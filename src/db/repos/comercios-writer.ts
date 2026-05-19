import { eq, sql, and, ilike } from 'drizzle-orm';
import type { Db } from '../client.js';
import { mccPorNombre, categorias } from '../schema/index.js';

export interface ComercioPublico {
  id: string;
  nombre: string;
  mcc: string;
  requiereRevision: boolean;
  categoriaSlug: string;
}

export interface ComerciosWriter {
  listar(filter: {
    categoriaSlug?: string | undefined;
    q?: string | undefined;
    requiereRevision?: boolean | undefined;
    limit: number;
    offset: number;
  }): Promise<{ items: ComercioPublico[]; total: number }>;
  actualizar(
    id: string,
    input: { categoriaSlug?: string | undefined; requiereRevision?: boolean | undefined },
  ): Promise<ComercioPublico | null>;
}

export function crearComerciosWriter(db: Db, invalidar?: () => void): ComerciosWriter {
  return {
    async listar(filter) {
      const conds: ReturnType<typeof eq>[] = [];
      if (filter.categoriaSlug) conds.push(eq(categorias.slug, filter.categoriaSlug));
      if (filter.q) conds.push(ilike(mccPorNombre.nombre, `%${filter.q}%`) as never);
      if (filter.requiereRevision !== undefined)
        conds.push(eq(mccPorNombre.requiereRevision, filter.requiereRevision) as never);
      const whereClause = conds.length > 0 ? (and(...conds) as never) : undefined;

      const baseSel = db
        .select({
          id: mccPorNombre.id,
          nombre: mccPorNombre.nombre,
          mcc: mccPorNombre.mcc,
          requiereRevision: mccPorNombre.requiereRevision,
          categoriaSlug: categorias.slug,
        })
        .from(mccPorNombre)
        .innerJoin(categorias, eq(mccPorNombre.categoriaId, categorias.id));
      const sel = whereClause ? baseSel.where(whereClause) : baseSel;
      const items = await sel.orderBy(mccPorNombre.nombre).limit(filter.limit).offset(filter.offset);

      const baseCnt = db
        .select({ c: sql<number>`count(*)::int` })
        .from(mccPorNombre)
        .innerJoin(categorias, eq(mccPorNombre.categoriaId, categorias.id));
      const cntRows = whereClause ? await baseCnt.where(whereClause) : await baseCnt;
      const total = Number(cntRows[0]?.c ?? 0);

      return { items, total };
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.requiereRevision !== undefined) set.requiereRevision = input.requiereRevision;
      if (input.categoriaSlug !== undefined) {
        const cat = await db
          .select({ id: categorias.id })
          .from(categorias)
          .where(eq(categorias.slug, input.categoriaSlug))
          .limit(1);
        if (cat.length === 0) throw new Error('categoria_inexistente');
        set.categoriaId = cat[0]!.id;
      }
      const upd = await db
        .update(mccPorNombre)
        .set(set)
        .where(eq(mccPorNombre.id, id))
        .returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = await db
        .select({ slug: categorias.slug })
        .from(categorias)
        .where(eq(categorias.id, r.categoriaId))
        .limit(1);
      invalidar?.();
      return {
        id: r.id,
        nombre: r.nombre,
        mcc: r.mcc,
        requiereRevision: r.requiereRevision,
        categoriaSlug: slugRow[0]?.slug ?? '',
      };
    },
  };
}
