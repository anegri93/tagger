import { eq, sql, and, isNull } from 'drizzle-orm';
import { comerciosCatalogo } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';
import type { LoaderConfig } from './csv.js';

interface ComercioCsvRow {
  nombre: string;
  nombre_bancard?: string;
  categoria_slug: string;
  mcc?: string;
}

interface ComercioInsertRow {
  nombre: string;
  nombreBancard: string | null;
  nombreNormalizado: string;
  categoriaId: string;
  mcc: string | null;
}

export const comerciosLoaderConfig: LoaderConfig<
  ComercioCsvRow & Record<string, string>,
  ComercioInsertRow
> = {
  table: comerciosCatalogo,
  tableName: 'comercios_catalogo',
  file: 'data/comercios.csv',
  mapRow(row, ctx) {
    if (!row.nombre || !row.categoria_slug) return null;
    const categoriaId = ctx.resolveCategoria(row.categoria_slug);
    if (!categoriaId) {
      console.warn(`[comercios] categoría '${row.categoria_slug}' inexistente, skip ${row.nombre}`);
      return null;
    }
    const nombreNormalizado = normalize(row.nombre);
    const nombreBancard = row.nombre_bancard ? normalize(row.nombre_bancard) : null;
    return {
      nombre: row.nombre,
      nombreBancard,
      nombreNormalizado,
      categoriaId,
      mcc: row.mcc ?? null,
    };
  },
  // Idempotencia depende de si tiene nombre_bancard. Custom insert.
  upsert: null,
  async customInsert(row, ctx) {
    if (row.nombreBancard) {
      const existing = await ctx.db
        .select({ id: comerciosCatalogo.id })
        .from(comerciosCatalogo)
        .where(eq(comerciosCatalogo.nombreBancard, row.nombreBancard))
        .limit(1);
      if (existing.length === 0) {
        await ctx.db.insert(comerciosCatalogo).values(row);
        return 'inserted';
      }
      await ctx.db
        .update(comerciosCatalogo)
        .set({
          nombre: row.nombre,
          nombreNormalizado: row.nombreNormalizado,
          categoriaId: row.categoriaId,
          mcc: row.mcc,
          updatedAt: new Date(),
        })
        .where(eq(comerciosCatalogo.nombreBancard, row.nombreBancard));
      return 'updated';
    }
    // sin bancard → evitar duplicado por (nombre_normalizado, sin bancard)
    const existing = await ctx.db
      .select({ id: comerciosCatalogo.id })
      .from(comerciosCatalogo)
      .where(
        and(
          eq(comerciosCatalogo.nombreNormalizado, row.nombreNormalizado),
          isNull(comerciosCatalogo.nombreBancard),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      await ctx.db.insert(comerciosCatalogo).values(row);
      return 'inserted';
    }
    await ctx.db
      .update(comerciosCatalogo)
      .set({
        nombre: row.nombre,
        categoriaId: row.categoriaId,
        mcc: row.mcc,
        updatedAt: new Date(),
      })
      .where(eq(comerciosCatalogo.id, existing[0]!.id));
    void sql;
    return 'updated';
  },
};
