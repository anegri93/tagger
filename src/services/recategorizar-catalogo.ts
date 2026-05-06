import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { comerciosCatalogo } from '../db/schema/index.js';
import { ejecutarCascada, type CapasSincrono } from '../pipeline/categorizar.js';

export interface RecatStats {
  total: number;
  procesados: number;
  match: number;
  diff: number;
  sinCategoria: number;
}

export interface RecategorizarDeps {
  db: Db;
  capas: CapasSincrono;
  /** callback opcional para reportar progreso (cada N filas) */
  onProgress?: (stats: RecatStats) => void;
  /** tamaño del batch (default 500) */
  batchSize?: number;
}

export async function recategorizarCatalogo(deps: RecategorizarDeps): Promise<RecatStats> {
  const { db, capas, onProgress, batchSize = 500 } = deps;
  const stats: RecatStats = {
    total: 0,
    procesados: 0,
    match: 0,
    diff: 0,
    sinCategoria: 0,
  };

  const totalRow = await db.select({ id: comerciosCatalogo.id }).from(comerciosCatalogo);
  stats.total = totalRow.length;

  let offset = 0;
  while (offset < stats.total) {
    const batch = await db
      .select({
        id: comerciosCatalogo.id,
        nombre: comerciosCatalogo.nombre,
        categoriaActual: comerciosCatalogo.categoriaId,
      })
      .from(comerciosCatalogo)
      .orderBy(comerciosCatalogo.id)
      .limit(batchSize)
      .offset(offset);

    for (const row of batch) {
      const r = await ejecutarCascada(
        { descripcion: row.nombre },
        capas,
        { bypassCatalogo: true, bypassComercio: true },
      );

      const categoriaNuevaId = r.resultado?.categoriaId ?? null;
      const fuenteNueva = r.resultado?.fuente ?? null;
      const confianzaNueva = r.resultado?.confianza ?? null;
      const evidenciaNueva = r.resultado?.evidencia ?? null;

      await db
        .update(comerciosCatalogo)
        .set({
          categoriaNuevaId,
          fuenteNueva,
          confianzaNueva: confianzaNueva !== null ? String(confianzaNueva) : null,
          evidenciaNueva,
          recategorizadoAt: new Date(),
        })
        .where(eq(comerciosCatalogo.id, row.id));

      stats.procesados++;
      if (categoriaNuevaId === null) stats.sinCategoria++;
      else if (categoriaNuevaId === row.categoriaActual) stats.match++;
      else stats.diff++;
    }

    if (onProgress) onProgress({ ...stats });
    offset += batchSize;
  }

  return stats;
}
