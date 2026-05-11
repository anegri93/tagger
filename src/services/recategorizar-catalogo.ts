import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { comerciosCatalogo, datasetComercios, categorias } from '../db/schema/index.js';
import { ejecutarCascada, type CapasSincrono } from '../pipeline/categorizar.js';

export interface RecatStats {
  total: number;
  procesados: number;
  match: number;
  diff: number;
  sinCategoria: number;
}

export type RecatTarget =
  | { kind: 'catalogo' }
  | { kind: 'dataset'; datasetId: string };

export interface RecategorizarDeps {
  db: Db;
  capas: CapasSincrono;
  target?: RecatTarget;
  onProgress?: (stats: RecatStats) => void;
  batchSize?: number;
}

interface Row {
  id: string;
  nombre: string;
  mcc: string | null;
  categoriaActual: string | null;
}

async function fetchTotal(db: Db, target: RecatTarget): Promise<number> {
  if (target.kind === 'catalogo') {
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM comercios_catalogo`);
    return (r.rows[0] as { c: number }).c;
  }
  const r = await db.execute(
    sql`SELECT count(*)::int AS c FROM dataset_comercios WHERE dataset_id = ${target.datasetId}`,
  );
  return (r.rows[0] as { c: number }).c;
}

async function fetchBatch(
  db: Db,
  target: RecatTarget,
  offset: number,
  limit: number,
): Promise<Row[]> {
  if (target.kind === 'catalogo') {
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
  const rows = await db
    .select({
      id: datasetComercios.id,
      nombre: datasetComercios.nombre,
      categoriaActual: datasetComercios.categoriaId,
    })
    .from(datasetComercios)
    .where(eq(datasetComercios.datasetId, target.datasetId))
    .orderBy(datasetComercios.id)
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({ ...r, mcc: null, categoriaActual: r.categoriaActual ?? null }));
}

async function aplicarUpdate(
  db: Db,
  target: RecatTarget,
  rowId: string,
  categoriaNuevaId: string | null,
  fuenteNueva: string | null,
  confianzaNueva: number | null,
  evidenciaNueva: unknown,
  categoriaSlug: string | null,
): Promise<void> {
  const confStr = confianzaNueva !== null ? String(confianzaNueva) : null;
  if (target.kind === 'catalogo') {
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
    return;
  }
  await db
    .update(datasetComercios)
    .set({
      categoriaNuevaId,
      categoriaNuevaSlug: categoriaSlug,
      fuenteNueva: fuenteNueva as never,
      confianzaNueva: confStr,
      recategorizadoAt: new Date(),
    })
    .where(eq(datasetComercios.id, rowId));
}

export async function recategorizarCatalogo(deps: RecategorizarDeps): Promise<RecatStats> {
  const { db, capas, onProgress, batchSize = 500 } = deps;
  const target: RecatTarget = deps.target ?? { kind: 'catalogo' };
  const stats: RecatStats = {
    total: 0,
    procesados: 0,
    match: 0,
    diff: 0,
    sinCategoria: 0,
  };

  stats.total = await fetchTotal(db, target);

  // Lookup id->slug para escribir slug nuevo en datasets
  const cats = await db.select({ id: categorias.id, slug: categorias.slug }).from(categorias);
  const slugById = new Map(cats.map((c) => [c.id, c.slug]));

  let offset = 0;
  while (offset < stats.total) {
    const batch = await fetchBatch(db, target, offset, batchSize);

    for (const row of batch) {
      const r = await ejecutarCascada(
        { descripcion: row.nombre, mcc: row.mcc ?? undefined },
        capas,
        { bypassCatalogo: true, bypassComercio: true },
      );

      const categoriaNuevaId = r.resultado?.categoriaId ?? null;
      const fuenteNueva = r.resultado?.fuente ?? null;
      const confianzaNueva = r.resultado?.confianza ?? null;
      const evidenciaNueva = r.resultado?.evidencia ?? null;
      const categoriaNuevaSlug = categoriaNuevaId ? slugById.get(categoriaNuevaId) ?? null : null;

      await aplicarUpdate(
        db,
        target,
        row.id,
        categoriaNuevaId,
        fuenteNueva,
        confianzaNueva,
        evidenciaNueva,
        categoriaNuevaSlug,
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
