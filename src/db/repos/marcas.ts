import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { marcasConocidas, categorias } from '../schema/index.js';

export interface MarcaPublica {
  id: string;
  marca: string;
  descripcion: string | null;
  categoriaSlug: string;
}

export interface MarcaWriter {
  listar(filterCategoriaSlug?: string): Promise<MarcaPublica[]>;
  porCategoria(): Promise<Map<string, MarcaPublica[]>>;
  crear(input: { marca: string; descripcion?: string | null | undefined; categoriaSlug: string }): Promise<MarcaPublica>;
  actualizar(
    id: string,
    input: { marca?: string | undefined; descripcion?: string | null | undefined; categoriaSlug?: string | undefined },
  ): Promise<MarcaPublica | null>;
  eliminar(id: string): Promise<boolean>;
}

const TTL_MS = 60_000;

export interface MarcasReader {
  porCategoria(): Promise<Map<string, MarcaPublica[]>>;
  invalidar(): void;
}

export function crearMarcasReader(db: Db): MarcasReader {
  let cache: Map<string, MarcaPublica[]> | null = null;
  let expira = 0;

  return {
    async porCategoria() {
      const now = Date.now();
      if (cache && expira > now) return cache;
      const rows = await db
        .select({
          id: marcasConocidas.id,
          marca: marcasConocidas.marca,
          descripcion: marcasConocidas.descripcion,
          categoriaSlug: categorias.slug,
        })
        .from(marcasConocidas)
        .innerJoin(categorias, eq(marcasConocidas.categoriaId, categorias.id))
        .orderBy(categorias.slug);
      const m = new Map<string, MarcaPublica[]>();
      for (const r of rows) {
        const list = m.get(r.categoriaSlug) ?? [];
        list.push(r);
        m.set(r.categoriaSlug, list);
      }
      cache = m;
      expira = now + TTL_MS;
      return m;
    },
    invalidar() {
      cache = null;
      expira = 0;
    },
  };
}

export function crearMarcaWriter(db: Db, reader?: MarcasReader): MarcaWriter {
  return {
    async listar(filterCategoriaSlug) {
      const base = db
        .select({
          id: marcasConocidas.id,
          marca: marcasConocidas.marca,
          descripcion: marcasConocidas.descripcion,
          categoriaSlug: categorias.slug,
        })
        .from(marcasConocidas)
        .innerJoin(categorias, eq(marcasConocidas.categoriaId, categorias.id));
      const rows = filterCategoriaSlug
        ? await base.where(eq(categorias.slug, filterCategoriaSlug)).orderBy(marcasConocidas.marca)
        : await base.orderBy(categorias.slug, marcasConocidas.marca);
      return rows;
    },
    async porCategoria() {
      const rows = await this.listar();
      const m = new Map<string, MarcaPublica[]>();
      for (const r of rows) {
        const list = m.get(r.categoriaSlug) ?? [];
        list.push(r);
        m.set(r.categoriaSlug, list);
      }
      return m;
    },
    async crear({ marca, descripcion, categoriaSlug }) {
      const cat = await db
        .select({ id: categorias.id })
        .from(categorias)
        .where(eq(categorias.slug, categoriaSlug))
        .limit(1);
      if (cat.length === 0) throw new Error('categoria_inexistente');
      const ins = await db
        .insert(marcasConocidas)
        .values({ marca, descripcion: descripcion ?? null, categoriaId: cat[0]!.id })
        .returning();
      const r = ins[0]!;
      reader?.invalidar();
      return { id: r.id, marca: r.marca, descripcion: r.descripcion, categoriaSlug };
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.marca !== undefined) set.marca = input.marca;
      if (input.descripcion !== undefined) set.descripcion = input.descripcion;
      if (input.categoriaSlug !== undefined) {
        const cat = await db
          .select({ id: categorias.id })
          .from(categorias)
          .where(eq(categorias.slug, input.categoriaSlug))
          .limit(1);
        if (cat.length === 0) throw new Error('categoria_inexistente');
        set.categoriaId = cat[0]!.id;
      }
      const upd = await db.update(marcasConocidas).set(set).where(eq(marcasConocidas.id, id)).returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = await db
        .select({ slug: categorias.slug })
        .from(categorias)
        .where(eq(categorias.id, r.categoriaId))
        .limit(1);
      reader?.invalidar();
      return {
        id: r.id,
        marca: r.marca,
        descripcion: r.descripcion,
        categoriaSlug: slugRow[0]?.slug ?? '',
      };
    },
    async eliminar(id) {
      const del = await db.delete(marcasConocidas).where(eq(marcasConocidas.id, id)).returning();
      if (del.length === 0) return false;
      reader?.invalidar();
      return true;
    },
  };
}
