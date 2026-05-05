import { eq, inArray, sql } from 'drizzle-orm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from '../client.js';
import {
  categorias,
  reglasRegex,
  mccCatalogo,
  comerciosCatalogo,
  movimientos,
} from '../schema/index.js';
import type { CategoriasReader, CategoriaPublica } from '../../api/routes/categorias.js';
import type { CategoriasLoader, CategoriaActiva } from '../../layers/ia.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const EXTRAS_PATH = resolve(ROOT, 'data/categorias-extras.tsv');

export interface CategoriaWriter {
  crear(input: {
    slug: string;
    nombre: string;
    descripcion?: string | null | undefined;
  }): Promise<{ id: string; slug: string; nombre: string; descripcion: string | null }>;
  actualizar(
    slug: string,
    input: { nombre?: string | undefined; descripcion?: string | null | undefined },
  ): Promise<{ id: string; slug: string; nombre: string; descripcion: string | null } | null>;
  eliminar(slug: string): Promise<boolean>;
  usage(slug: string): Promise<{
    movimientos: number;
    reglas: number;
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

export function crearCategoriaWriter(
  db: Db,
  resolver?: { invalidar(): void },
): CategoriaWriter {
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
    async actualizar(slug, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.nombre !== undefined) set.nombre = input.nombre;
      if (input.descripcion !== undefined) set.descripcion = input.descripcion;
      const rows = await db
        .update(categorias)
        .set(set)
        .where(eq(categorias.slug, slug))
        .returning();
      const r = rows[0];
      if (!r) return null;
      appendExtra(r.slug, r.nombre, r.descripcion);
      resolver?.invalidar();
      return { id: r.id, slug: r.slug, nombre: r.nombre, descripcion: r.descripcion };
    },
    async eliminar(slug) {
      const rows = await db.delete(categorias).where(eq(categorias.slug, slug)).returning();
      if (rows.length === 0) return false;
      removeExtra(slug);
      resolver?.invalidar();
      return true;
    },
    async usage(slug) {
      const cat = await db
        .select({ id: categorias.id })
        .from(categorias)
        .where(eq(categorias.slug, slug))
        .limit(1);
      if (cat.length === 0) return null;
      const id = cat[0]!.id;
      const [m, r, c, mc] = await Promise.all([
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(movimientos)
          .where(
            sql`${movimientos.categoriaPredichaId} = ${id} OR ${movimientos.categoriaConfirmadaId} = ${id}`,
          ),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(reglasRegex)
          .where(eq(reglasRegex.categoriaId, id)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(comerciosCatalogo)
          .where(eq(comerciosCatalogo.categoriaId, id)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(mccCatalogo)
          .where(eq(mccCatalogo.categoriaId, id)),
      ]);
      return {
        movimientos: Number(m[0]?.c ?? 0),
        reglas: Number(r[0]?.c ?? 0),
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

export function crearCategoriasLoader(db: Db): CategoriasLoader {
  return {
    async activas(): Promise<CategoriaActiva[]> {
      const rows = await db
        .select({ id: categorias.id, slug: categorias.slug, nombre: categorias.nombre })
        .from(categorias)
        .where(eq(categorias.activo, true));
      return rows;
    },
  };
}
