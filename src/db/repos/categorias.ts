import { eq, inArray, sql } from 'drizzle-orm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from '../client.js';
import {
  categorias,
  categoriasAlias,
  mccCatalogo,
  mccPorNombre,
  movimientos,
} from '../schema/index.js';
import type { CategoriasReader, CategoriaPublica } from '../../api/routes/categorias.js';
import type { CategoriasLoader, CategoriaActiva } from '../../layers/ia.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve un identificador (UUID, slug actual, o slug-alias antiguo) a la fila
 * de categoría real. Devuelve null si no existe.
 */
export async function resolverIdentificador(
  db: Db,
  identificador: string,
): Promise<{ id: string; slug: string; nombre: string } | null> {
  if (UUID_RE.test(identificador)) {
    const rows = await db
      .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
      .from(categorias)
      .where(eq(categorias.id, identificador))
      .limit(1);
    return rows[0] ?? null;
  }
  const directRows = await db
    .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
    .from(categorias)
    .where(eq(categorias.slug, identificador))
    .limit(1);
  if (directRows[0]) return directRows[0];
  const aliasRows = await db
    .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
    .from(categoriasAlias)
    .innerJoin(categorias, eq(categorias.id, categoriasAlias.categoriaId))
    .where(eq(categoriasAlias.slugAntiguo, identificador))
    .limit(1);
  return aliasRows[0] ?? null;
}

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const EXTRAS_PATH = resolve(ROOT, 'data/categorias-extras.tsv');

export interface CategoriaWriter {
  crear(input: {
    slug: string;
    nombre: string;
    descripcion?: string | null | undefined;
  }): Promise<{ id: string; slug: string; nombre: string; descripcion: string | null }>;
  /** identificador: slug actual, alias antiguo, o UUID */
  actualizar(
    identificador: string,
    input: { nombre?: string | undefined; descripcion?: string | null | undefined },
  ): Promise<{ id: string; slug: string; nombre: string; descripcion: string | null } | null>;
  /** identificador: slug actual, alias antiguo, o UUID */
  eliminar(identificador: string): Promise<boolean>;
  /** identificador: slug actual, alias antiguo, o UUID */
  usage(identificador: string): Promise<{
    movimientos: number;
    mcc: number;
    comercios: number;
  } | null>;
}

function appendExtra(slug: string, nombre: string, descripcion: string | null): void {
  const header = 'slug\tnombre\tdescripcion';
  let lines: string[];
  if (existsSync(EXTRAS_PATH)) {
    lines = readFileSync(EXTRAS_PATH, 'utf8').trim().split('\n').filter(Boolean);
    if (lines[0] !== header) lines = [header, ...lines];
  } else {
    lines = [header];
  }
  const existing = lines.findIndex((l) => l.startsWith(`${slug}\t`));
  const row = `${slug}\t${nombre}\t${descripcion ?? ''}`;
  if (existing > 0) lines[existing] = row;
  else lines.push(row);
  writeFileSync(EXTRAS_PATH, lines.join('\n') + '\n');
}

function removeExtra(slug: string): void {
  if (!existsSync(EXTRAS_PATH)) return;
  const lines = readFileSync(EXTRAS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const filtered = lines.filter((l, i) => i === 0 || !l.startsWith(`${slug}\t`));
  writeFileSync(EXTRAS_PATH, filtered.join('\n') + '\n');
}

export function crearCategoriaWriter(db: Db, resolver?: { invalidar(): void }): CategoriaWriter {
  return {
    async crear({ slug, nombre, descripcion }) {
      const rows = await db
        .insert(categorias)
        .values({ slug, nombre, descripcion: descripcion ?? null })
        .returning();
      const r = rows[0];
      if (!r) throw new Error('insert categoria sin id');
      appendExtra(slug, nombre, descripcion ?? null);
      resolver?.invalidar();
      return { id: r.id, slug: r.slug, nombre: r.nombre, descripcion: r.descripcion };
    },
    async actualizar(identificador, input) {
      const target = await resolverIdentificador(db, identificador);
      if (!target) return null;
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.nombre !== undefined) set.nombre = input.nombre;
      if (input.descripcion !== undefined) set.descripcion = input.descripcion;
      const rows = await db
        .update(categorias)
        .set(set)
        .where(eq(categorias.id, target.id))
        .returning();
      const r = rows[0];
      if (!r) return null;
      appendExtra(r.slug, r.nombre, r.descripcion);
      resolver?.invalidar();
      return { id: r.id, slug: r.slug, nombre: r.nombre, descripcion: r.descripcion };
    },
    async eliminar(identificador) {
      const target = await resolverIdentificador(db, identificador);
      if (!target) return false;
      const rows = await db.delete(categorias).where(eq(categorias.id, target.id)).returning();
      if (rows.length === 0) return false;
      removeExtra(target.slug);
      resolver?.invalidar();
      return true;
    },
    async usage(identificador) {
      const target = await resolverIdentificador(db, identificador);
      if (!target) return null;
      const id = target.id;
      const [m, c, mc] = await Promise.all([
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(movimientos)
          .where(
            sql`${movimientos.categoriaPredichaId} = ${id} OR ${movimientos.categoriaConfirmadaId} = ${id}`,
          ),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(mccPorNombre)
          .where(eq(mccPorNombre.categoriaId, id)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(mccCatalogo)
          .where(eq(mccCatalogo.categoriaId, id)),
      ]);
      return {
        movimientos: Number(m[0]?.c ?? 0),
        comercios: Number(c[0]?.c ?? 0),
        mcc: Number(mc[0]?.c ?? 0),
      };
    },
  };
}

export interface CategoriaRef {
  id: string;
  slug: string;
  nombre: string;
}

export interface CategoriaResolver {
  porId(id: string | null | undefined): Promise<CategoriaRef | null>;
  porIds(ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, CategoriaRef>>;
  invalidar(): void;
}

export function crearCategoriaResolver(db: Db, ttlMs = 60_000): CategoriaResolver {
  let cache: Map<string, CategoriaRef> | null = null;
  let expira = 0;

  async function getAll(): Promise<Map<string, CategoriaRef>> {
    const now = Date.now();
    if (cache && expira > now) return cache;
    const rows = await db
      .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
      .from(categorias);
    cache = new Map(rows.map((r) => [r.id, r]));
    expira = now + ttlMs;
    return cache;
  }

  return {
    async porId(id) {
      if (!id) return null;
      const all = await getAll();
      const hit = all.get(id);
      if (hit) return hit;
      const rows = await db
        .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
        .from(categorias)
        .where(eq(categorias.id, id))
        .limit(1);
      const r = rows[0];
      if (r) all.set(r.id, r);
      return r ?? null;
    },
    async porIds(ids) {
      const cleanIds = [...new Set(ids.filter((x): x is string => Boolean(x)))];
      if (cleanIds.length === 0) return new Map();
      const all = await getAll();
      const out = new Map<string, CategoriaRef>();
      const faltantes: string[] = [];
      for (const id of cleanIds) {
        const hit = all.get(id);
        if (hit) out.set(id, hit);
        else faltantes.push(id);
      }
      if (faltantes.length > 0) {
        const rows = await db
          .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
          .from(categorias)
          .where(inArray(categorias.id, faltantes));
        for (const r of rows) {
          all.set(r.id, r);
          out.set(r.id, r);
        }
      }
      return out;
    },
    invalidar() {
      cache = null;
      expira = 0;
    },
  };
}

export function crearCategoriasReader(db: Db): CategoriasReader {
  return {
    async activas(): Promise<CategoriaPublica[]> {
      const rows = await db
        .select({
          id: categorias.id,
          slug: categorias.slug,
          nombre: categorias.nombre,
          descripcion: categorias.descripcion,
        })
        .from(categorias)
        .where(eq(categorias.activo, true))
        .orderBy(categorias.slug);
      return rows;
    },
  };
}

export interface CategoriaSimilar {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  similitud: number;
}

export interface CategoriasSimilaresReader {
  /**
   * Devuelve categorías ordenadas por similitud trigram desc, excluyendo `excluirId`.
   * Si `q` está presente, busca contra ese texto; si no, contra la categoría
   * referenciada por `excluirId` (slug + nombre + descripcion).
   * `umbral` filtra resultados con similarity < umbral (default 0).
   */
  buscar(opts: {
    excluirId: string;
    q?: string | undefined;
    limit: number;
    offset: number;
    umbral?: number | undefined;
  }): Promise<CategoriaSimilar[]>;
}

export function crearCategoriasSimilaresReader(db: Db): CategoriasSimilaresReader {
  return {
    async buscar({ excluirId, q, limit, offset, umbral = 0 }) {
      // Texto de referencia: q explícito, o concat de la categoría origen.
      const refExpr = q
        ? sql<string>`${q}`
        : sql<string>`(SELECT coalesce(${categorias.slug},'') || ' ' || coalesce(${categorias.nombre},'') || ' ' || coalesce(${categorias.descripcion},'') FROM ${categorias} WHERE ${categorias.id} = ${excluirId})`;

      const candidatoTxt = sql<string>`(coalesce(${categorias.slug},'') || ' ' || coalesce(${categorias.nombre},'') || ' ' || coalesce(${categorias.descripcion},''))`;
      const simExpr = sql<number>`similarity(${candidatoTxt}, ${refExpr})`;

      const rows = await db
        .select({
          id: categorias.id,
          slug: categorias.slug,
          nombre: categorias.nombre,
          descripcion: categorias.descripcion,
          similitud: simExpr,
        })
        .from(categorias)
        .where(
          sql`${categorias.activo} = true AND ${categorias.id} <> ${excluirId} AND similarity(${candidatoTxt}, ${refExpr}) >= ${umbral}`,
        )
        .orderBy(sql`similarity(${candidatoTxt}, ${refExpr}) DESC, ${categorias.slug} ASC`)
        .limit(limit)
        .offset(offset);

      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        nombre: r.nombre,
        descripcion: r.descripcion,
        similitud: Number(r.similitud ?? 0),
      }));
    },
  };
}

export function crearCategoriasLoader(db: Db): CategoriasLoader {
  return {
    async activas(): Promise<CategoriaActiva[]> {
      const rows = await db
        .select({
          id: categorias.id,
          slug: categorias.slug,
          nombre: categorias.nombre,
          descripcion: categorias.descripcion,
        })
        .from(categorias)
        .where(eq(categorias.activo, true));
      return rows;
    },
  };
}
