import { sql } from 'drizzle-orm';
import { comerciosCatalogo, mccCatalogo, reglasRegex, categorias } from '../schema/index.js';
import { eq } from 'drizzle-orm';
import { normalize } from '../../domain/normalize.js';
import {
  categorizarComercio,
  type CascadaCtx,
  type PatronNombre,
  type FilaBancard,
} from '../../pipeline/cascada-catalogo.js';
import { readCsvStream, type LoaderConfig, type LoaderContext } from './csv.js';
import type { Db } from '../client.js';
import type { MccEntry } from '../../layers/mcc.js';
import type { ReglaCargada } from '../../layers/regex.js';

interface RawRow extends Record<string, string> {
  Nombre: string;
  BancardId: string;
  CodigoComercio: string;
  MCC: string;
  mcc_conflicto: string;
  marca: string;
  mcc_inferido: string;
}

const PATRONES_NOMBRE_DEFS: Array<{ slug: string; re: RegExp; nombre: string }> = [
  { slug: 'azar', re: /\b(AZAR|SLOT|TRAGAMONEDA|CASINO|GAMING|APUESTA|BETSAT|GIRO\s?WIN|SOLBET)\b/i, nombre: 'azar/juego' },
  { slug: 'supermercado', re: /\b(SUPER|HIPER|MERCADO|COMERCIAL|ABASTO|MINIMARKET|MARKET)\b/i, nombre: 'super/mercado' },
  { slug: 'farmacia', re: /\b(FARMACI|DROGUERIA|BOTICA)\b/i, nombre: 'farmacia' },
  { slug: 'combustible', re: /\b(PETROBRAS|COPETROL|PUMA|SHELL|ESSO|YPF|GASOIL|ESTACION\s+DE\s+SERVICIO)\b/i, nombre: 'combustible' },
  { slug: 'restaurante', re: /\b(RESTAURANT|PIZZERIA|HAMBURG|BURGER|PARRILLA|LOMITERIA|EMPANADA|GASTRO|COMIDA|CHIPA)\b/i, nombre: 'restaurante' },
  { slug: 'salud', re: /\b(CLINICA|SANATORIO|HOSPITAL|MEDICO|LABORATORIO|ODONTOLOG)\b/i, nombre: 'salud' },
  { slug: 'transporte', re: /\b(MUV|UBER|BOLT|TAXI|REMIS|TRANSPORTE)\b/i, nombre: 'transporte' },
];

async function buildCtxCascada(db: Db): Promise<CascadaCtx> {
  const cats = await db
    .select({ id: categorias.id, slug: categorias.slug })
    .from(categorias);
  const slugToId = new Map(cats.map((c) => [c.slug, c.id]));
  const otrosId = slugToId.get('otros');
  if (!otrosId) throw new Error("falta categoría 'otros'");

  const reglas: ReglaCargada[] = await db
    .select({
      id: reglasRegex.id,
      patron: reglasRegex.patron,
      categoriaId: reglasRegex.categoriaId,
      prioridad: reglasRegex.prioridad,
    })
    .from(reglasRegex)
    .where(eq(reglasRegex.activo, true));
  reglas.sort((a, b) => a.prioridad - b.prioridad);

  const mccRows = await db
    .select({
      codMcc: mccCatalogo.codMcc,
      categoriaId: mccCatalogo.categoriaId,
      ambiguo: mccCatalogo.ambiguo,
    })
    .from(mccCatalogo);
  const mccPorCodigo = new Map<string, MccEntry>();
  for (const r of mccRows) {
    mccPorCodigo.set(r.codMcc, {
      codMcc: r.codMcc,
      categoriaId: r.categoriaId,
      ambiguo: r.ambiguo,
    });
  }

  const patronesNombre: PatronNombre[] = [];
  for (const p of PATRONES_NOMBRE_DEFS) {
    const id = slugToId.get(p.slug);
    if (!id) continue;
    patronesNombre.push({
      re: p.re,
      categoriaSlug: p.slug,
      categoriaId: id,
      nombre: p.nombre,
    });
  }

  return { reglas, mccPorCodigo, patronesNombre, categoriaOtrosId: otrosId };
}

export async function loadComerciosBancardMasivo(
  ctx: LoaderContext,
  file = 'data/comercios-bancard-staged.tsv',
): Promise<{ total: number; porFuente: Record<string, number>; revisión: number }> {
  const cascada = await buildCtxCascada(ctx.db);
  const counts: Record<string, number> = { regex: 0, mcc: 0, nombre: 0 };
  let revision = 0;
  let total = 0;
  let buffer: Array<typeof comerciosCatalogo.$inferInsert> = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await ctx.db
      .insert(comerciosCatalogo)
      .values(buffer)
      .onConflictDoUpdate({
        target: [comerciosCatalogo.bancardId, comerciosCatalogo.codigoComercio],
        targetWhere: sql`${comerciosCatalogo.bancardId} IS NOT NULL`,
        set: {
          nombre: sql`excluded.nombre`,
          nombreNormalizado: sql`excluded.nombre_normalizado`,
          categoriaId: sql`excluded.categoria_id`,
          mcc: sql`excluded.mcc`,
          mccOriginal: sql`excluded.mcc_original`,
          fuenteCategoria: sql`excluded.fuente_categoria`,
          confianza: sql`excluded.confianza`,
          requiereRevision: sql`excluded.requiere_revision`,
          evidencia: sql`excluded.evidencia`,
          marca: sql`excluded.marca`,
          mccInferido: sql`excluded.mcc_inferido`,
          updatedAt: sql`now()`,
        },
      });
    buffer = [];
  };

  for await (const row of readCsvStream<RawRow>(file)) {
    total++;
    const nombre = row.Nombre?.trim();
    if (!nombre) continue;
    const mccTrim = row.MCC?.trim();
    const fila: FilaBancard = {
      nombre,
      bancardId: row.BancardId?.trim() || null,
      codigoComercio: row.CodigoComercio?.trim() || null,
      mcc: mccTrim && mccTrim !== 'SIN RUBRO' && mccTrim !== 'null' ? mccTrim : null,
      marca: row.marca?.trim() || null,
      mccInferido: row.mcc_inferido === '1',
    };
    const decision = categorizarComercio(fila, cascada);
    counts[decision.fuente] = (counts[decision.fuente] ?? 0) + 1;
    if (decision.requiereRevision) revision++;

    buffer.push({
      nombre: fila.nombre,
      nombreBancard: null,
      nombreNormalizado: normalize(fila.nombre),
      bancardId: fila.bancardId,
      codigoComercio: fila.codigoComercio,
      categoriaId: decision.categoriaId,
      mcc: fila.mcc,
      mccOriginal: row.MCC?.trim() || null,
      fuenteCategoria: decision.fuente,
      confianza: decision.confianza.toFixed(2),
      requiereRevision: decision.requiereRevision,
      evidencia: decision.evidencia,
      marca: fila.marca,
      mccInferido: fila.mccInferido === true,
    });

    if (buffer.length >= 500) await flush();

    if (total % 5000 === 0) {
      console.warn(
        `[comercios-bancard-masivo] progreso ${total} (regex ${counts.regex} mcc ${counts.mcc} nombre ${counts.nombre} revisión ${revision})`,
      );
    }
  }
  await flush();
  return { total, porFuente: counts, revisión: revision };
}

// LoaderConfig wrapper pa integrar con scripts/load.ts (usa customInsert por flexibilidad)
export const comerciosBancardMasivoLoaderConfig: LoaderConfig<RawRow, never> = {
  table: comerciosCatalogo,
  tableName: 'comercios_catalogo (masivo)',
  data: [],
  mapRow() {
    return null;
  },
};
