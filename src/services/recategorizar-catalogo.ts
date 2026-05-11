import { eq, sql } from 'drizzle-orm';
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
  onProgress?: (stats: RecatStats) => void;
  batchSize?: number;
}

interface Row {
  id: string;
  nombre: string;
  mcc: string | null;
  categoriaActual: string | null;
}

async function fetchTotal(db: Db): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS c FROM comercios_catalogo`);
  return (r.rows[0] as { c: number }).c;
}

async function fetchBatch(db: Db, offset: number, limit: number): Promise<Row[]> {
  const rows = await db
    .select({
      id: comerciosCatalogo.id,
      nombre: comerciosCatalogo.nombre,
      mcc: comerciosCatalogo.mccOriginal,
      categoriaActual: comerciosCatalogo.categoriaId,
    })
    .from(comerciosCatalogo)
    .orderBy(comerciosCatalogo.id)
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    ...r,
    mcc: r.mcc ?? null,
    categoriaActual: r.categoriaActual ?? null,
  }));
}

async function aplicarUpdate(
  db: Db,
  rowId: string,
  categoriaNuevaId: string | null,
  fuenteNueva: string | null,
  confianzaNueva: number | null,
  evidenciaNueva: unknown,
): Promise<void> {
  const confStr = confianzaNueva !== null ? String(confianzaNueva) : null;
  await db
    .update(comerciosCatalogo)
    .set({
      categoriaNuevaId,
      fuenteNueva: fuenteNueva as never,
      confianzaNueva: confStr,
      evidenciaNueva: evidenciaNueva as never,
      recategorizadoAt: new Date(),
    })
    .where(eq(comerciosCatalogo.id, rowId));
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

  stats.total = await fetchTotal(db);

  let offset = 0;
  while (offset < stats.total) {
    const batch = await fetchBatch(db, offset, batchSize);

    for (const row of batch) {
      const r = await ejecutarCascada(
        { descripcion: row.nombre, mcc: row.mcc ?? undefined },
        capas,
        { bypassCatalogo: true },
      );

      const categoriaNuevaId = r.resultado?.categoriaId ?? null;
      const fuenteNueva = r.resultado?.fuente ?? null;
      const confianzaNueva = r.resultado?.confianza ?? null;
      const evidenciaNueva = r.resultado?.evidencia ?? null;

      await aplicarUpdate(
        db,
        row.id,
        categoriaNuevaId,
        fuenteNueva,
        confianzaNueva,
        evidenciaNueva,
      );

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
