// Loader pa formato real Bancard (TSV):
// Nombre  BancardId  CodigoComercio  SectorComercio  CategoriaDescripcion  CategoriaNombre  cantidad
//
// Estrategia categoría:
// 1. SectorComercio numérico → lookup en mcc_catalogo (resuelto en runtime)
// 2. Patrón en Nombre (slots/bet/gaming/azar) → 'azar'
// 3. Default → 'otros'
import { eq, and, isNull } from 'drizzle-orm';
import { comerciosCatalogo, mccCatalogo } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';
import type { LoaderConfig, LoaderContext } from './csv.js';

interface BancardRow {
  Nombre?: string;
  BancardId?: string;
  CodigoComercio?: string;
  SectorComercio?: string;
  CategoriaDescripcion?: string;
  CategoriaNombre?: string;
  cantidad?: string;
}

interface ComercioInsert {
  nombre: string;
  nombreBancard: string | null;
  nombreNormalizado: string;
  categoriaId: string;
  mcc: string | null;
}

const PATRONES_AZAR = /\b(SLOT|BET|BETZ|SOLBET|GAMING|GIRO\s*WIN|AZAR|CASINO|TRAGAMONEDAS)\b/i;
const PATRONES_SUPER = /\b(BIGGIE|SUPERSEIS|SUPER\s*SEIS|AHORRAZO|HIPER|CIAL|COMERCIAL|CACIQUE|STOCK|AREA\s*UNO|SALEMMA|CASA\s*RICA|FORTIS)\b/i;
const PATRONES_COMBUSTIBLE = /\b(COPETROL|SHELL|PETROBRAS|PUMA|BARCOS\s*Y\s*ROD|MONTE\s*ALTO)\b/i;
const PATRONES_FARMACIA = /\b(FARMA|FARMACIA|SCAVONE|CATEDRAL\s*FARMA)\b/i;
const PATRONES_SERVICIOS = /\b(TIGO|PERSONAL|CLARO|COPACO|ANDE|ESSAP|UPAY|MITIC|EGLOBALT)\b/i;
const PATRONES_RESTAURANT = /\b(MC\s*DONAL|BURGER\s*KING|KFC|PIZZA\s*HUT|BOLSI|HAMBURGUESERIA)\b/i;

async function resolverCategoria(
  ctx: LoaderContext,
  nombre: string,
  mcc: string | null,
): Promise<string | null> {
  // 1. Por MCC
  if (mcc) {
    const rows = await ctx.db
      .select({ categoriaId: mccCatalogo.categoriaId, ambiguo: mccCatalogo.ambiguo })
      .from(mccCatalogo)
      .where(eq(mccCatalogo.codMcc, mcc))
      .limit(1);
    const r = rows[0];
    if (r && r.categoriaId && !r.ambiguo) return r.categoriaId;
  }

  // 2. Patrones de nombre
  if (PATRONES_AZAR.test(nombre)) return ctx.resolveCategoria('azar') ?? null;
  if (PATRONES_SUPER.test(nombre)) return ctx.resolveCategoria('supermercado') ?? null;
  if (PATRONES_COMBUSTIBLE.test(nombre)) return ctx.resolveCategoria('combustible') ?? null;
  if (PATRONES_FARMACIA.test(nombre)) return ctx.resolveCategoria('farmacia') ?? null;
  if (PATRONES_SERVICIOS.test(nombre)) return ctx.resolveCategoria('servicios') ?? null;
  if (PATRONES_RESTAURANT.test(nombre)) return ctx.resolveCategoria('restaurante') ?? null;

  // 3. Default
  return ctx.resolveCategoria('otros') ?? null;
}

function parseMcc(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{2,4}$/.test(t)) return t;
  return null;
}

export const comerciosBancardLoaderConfig: LoaderConfig<
  BancardRow & Record<string, string>,
  ComercioInsert
> = {
  table: comerciosCatalogo,
  tableName: 'comercios_catalogo (bancard)',
  file: 'data/comercios-bancard.tsv',
  delimiter: '\t',
  async mapRow(row, ctx) {
    const nombre = row.Nombre?.trim();
    if (!nombre) return null;
    const mcc = parseMcc(row.SectorComercio);
    const categoriaId = await resolverCategoria(ctx, nombre, mcc);
    if (!categoriaId) {
      console.warn(`[comercios-bancard] sin categoría pa ${nombre}, skip`);
      return null;
    }
    const nombreNormalizado = normalize(nombre);
    return {
      nombre,
      nombreBancard: nombreNormalizado,
      nombreNormalizado,
      categoriaId,
      mcc,
    };
  },
  upsert: null,
  async customInsert(row, ctx) {
    if (!row.nombreBancard) return 'skipped';
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
    void and;
    void isNull;
    return 'updated';
  },
};
