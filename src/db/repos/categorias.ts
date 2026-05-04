import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../client.js';
import { categorias } from '../schema/index.js';
import type { CategoriasReader, CategoriaPublica } from '../../api/routes/categorias.js';
import type { CategoriasLoader, CategoriaActiva } from '../../layers/ia.js';

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
