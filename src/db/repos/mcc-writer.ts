import { eq, sql, isNull } from 'drizzle-orm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from '../client.js';
import { mccCatalogo, categorias, mccPorNombre } from '../schema/index.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const EXTRAS_PATH = resolve(ROOT, 'data/mcc-extras.tsv');
const HEADER = 'cod_mcc\tdescripcion\tcategoria_slug';

export interface MccPublico {
  codMcc: string;
  descripcion: string | null;
  categoriaSlug: string | null;
  ambiguo: boolean;
  source: string | null;
}

export interface MccWriter {
  listar(filter?: { categoriaSlug?: string; sinCategoria?: boolean }): Promise<MccPublico[]>;
  crear(input: {
    codMcc: string;
    descripcion: string;
    categoriaSlug?: string | null | undefined;
    ambiguo?: boolean | undefined;
  }): Promise<MccPublico>;
  actualizar(
    codMcc: string,
    input: {
      descripcion?: string | undefined;
      categoriaSlug?: string | null | undefined;
      ambiguo?: boolean | undefined;
    },
  ): Promise<MccPublico | null>;
  eliminar(codMcc: string): Promise<boolean | { tieneRefs: true; comercios: number }>;
}

interface ExtraRow {
  cod_mcc: string;
  descripcion: string;
  categoria_slug: string;
}

function readExtras(): Map<string, ExtraRow> {
  if (!existsSync(EXTRAS_PATH)) return new Map();
  const lines = readFileSync(EXTRAS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const out = new Map<string, ExtraRow>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split('\t');
    const [cod_mcc, descripcion, categoria_slug] = cols;
    if (cod_mcc)
      out.set(cod_mcc, {
        cod_mcc,
        descripcion: descripcion ?? '',
        categoria_slug: categoria_slug ?? '',
      });
  }
  return out;
}

function writeExtras(map: Map<string, ExtraRow>): void {
  const lines = [HEADER];
  for (const [, r] of map) {
    lines.push(`${r.cod_mcc}\t${r.descripcion}\t${r.categoria_slug}`);
  }
  writeFileSync(EXTRAS_PATH, lines.join('\n') + '\n');
}

function upsertExtra(codMcc: string, descripcion: string, slug: string | null): void {
  const map = readExtras();
  map.set(codMcc, { cod_mcc: codMcc, descripcion, categoria_slug: slug ?? '' });
  writeExtras(map);
}

function removeExtra(codMcc: string): void {
  const map = readExtras();
  if (map.delete(codMcc)) writeExtras(map);
}

export function crearMccWriter(db: Db, invalidar?: () => void): MccWriter {
  return {
    async listar(filter) {
      const base = db
        .select({
          codMcc: mccCatalogo.codMcc,
          descripcion: mccCatalogo.descripcion,
          categoriaSlug: categorias.slug,
          ambiguo: mccCatalogo.ambiguo,
          source: mccCatalogo.source,
        })
        .from(mccCatalogo)
        .leftJoin(categorias, eq(mccCatalogo.categoriaId, categorias.id));
      let query = base;
      if (filter?.sinCategoria) query = base.where(isNull(mccCatalogo.categoriaId)) as never;
      else if (filter?.categoriaSlug)
        query = base.where(eq(categorias.slug, filter.categoriaSlug)) as never;
      const rows = await query.orderBy(mccCatalogo.codMcc);
      return rows;
    },
    async crear({ codMcc, descripcion, categoriaSlug, ambiguo }) {
      let categoriaId: string | null = null;
      if (categoriaSlug) {
        const cat = await db
          .select({ id: categorias.id })
          .from(categorias)
          .where(eq(categorias.slug, categoriaSlug))
          .limit(1);
        if (cat.length === 0) throw new Error('categoria_inexistente');
        categoriaId = cat[0]!.id;
      }
      const ins = await db
        .insert(mccCatalogo)
        .values({
          codMcc,
          descripcion,
          categoriaId,
          ambiguo: ambiguo ?? false,
          source: 'extras',
        })
        .returning();
      const r = ins[0]!;
      upsertExtra(codMcc, descripcion, categoriaSlug ?? null);
      invalidar?.();
      return {
        codMcc: r.codMcc,
        descripcion: r.descripcion,
        categoriaSlug: categoriaSlug ?? null,
        ambiguo: r.ambiguo,
        source: r.source,
      };
    },
    async actualizar(codMcc, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      let nuevoSlug: string | null | undefined;
      if (input.descripcion !== undefined) set.descripcion = input.descripcion;
      if (input.ambiguo !== undefined) set.ambiguo = input.ambiguo;
      if (input.categoriaSlug !== undefined) {
        if (input.categoriaSlug === null) {
          set.categoriaId = null;
          nuevoSlug = null;
        } else {
          const cat = await db
            .select({ id: categorias.id })
            .from(categorias)
            .where(eq(categorias.slug, input.categoriaSlug))
            .limit(1);
          if (cat.length === 0) throw new Error('categoria_inexistente');
          set.categoriaId = cat[0]!.id;
          nuevoSlug = input.categoriaSlug;
        }
      }
      const upd = await db
        .update(mccCatalogo)
        .set(set)
        .where(eq(mccCatalogo.codMcc, codMcc))
        .returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = r.categoriaId
        ? await db
            .select({ slug: categorias.slug })
            .from(categorias)
            .where(eq(categorias.id, r.categoriaId))
            .limit(1)
        : [];
      const finalSlug = slugRow[0]?.slug ?? null;
      upsertExtra(codMcc, r.descripcion ?? '', finalSlug);
      invalidar?.();
      void nuevoSlug;
      return {
        codMcc: r.codMcc,
        descripcion: r.descripcion,
        categoriaSlug: finalSlug,
        ambiguo: r.ambiguo,
        source: r.source,
      };
    },
    async eliminar(codMcc) {
      const refs = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(mccPorNombre)
        .where(eq(mccPorNombre.mcc, codMcc));
      const n = Number(refs[0]?.c ?? 0);
      if (n > 0) return { tieneRefs: true, comercios: n };
      const del = await db.delete(mccCatalogo).where(eq(mccCatalogo.codMcc, codMcc)).returning();
      if (del.length === 0) return false;
      removeExtra(codMcc);
      invalidar?.();
      return true;
    },
  };
}
