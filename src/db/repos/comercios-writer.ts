import { eq, sql, and, ilike } from 'drizzle-orm';
import type { Db } from '../client.js';
import { comerciosCatalogo, categorias } from '../schema/index.js';

export interface ComercioPublico {
  id: string;
  nombre: string;
  bancardId: string | null;
  codigoComercio: string | null;
  mcc: string | null;
  fuenteCategoria: string | null;
  confianza: string | null;
  requiereRevision: boolean;
  marca: string | null;
  mccInferido: boolean;
  categoriaSlug: string | null;
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
      const conds = [] as Array<ReturnType<typeof eq>>;
      if (filter.categoriaSlug) conds.push(eq(categorias.slug, filter.categoriaSlug));
      if (filter.q) conds.push(ilike(comerciosCatalogo.nombre, `%${filter.q}%`) as never);
      if (filter.requiereRevision !== undefined)
        conds.push(eq(comerciosCatalogo.requiereRevision, filter.requiereRevision) as never);
      const whereClause = conds.length > 0 ? (and(...conds) as never) : undefined;

      const baseSel = db
        .select({
          id: comerciosCatalogo.id,
          nombre: comerciosCatalogo.nombre,
          bancardId: comerciosCatalogo.bancardId,
          codigoComercio: comerciosCatalogo.codigoComercio,
          mcc: comerciosCatalogo.mcc,
          fuenteCategoria: comerciosCatalogo.fuenteCategoria,
          confianza: comerciosCatalogo.confianza,
          requiereRevision: comerciosCatalogo.requiereRevision,
          marca: comerciosCatalogo.marca,
          mccInferido: comerciosCatalogo.mccInferido,
          categoriaSlug: categorias.slug,
        })
        .from(comerciosCatalogo)
        .innerJoin(categorias, eq(comerciosCatalogo.categoriaId, categorias.id));
      const sel = whereClause ? baseSel.where(whereClause) : baseSel;
      const items = await sel
        .orderBy(comerciosCatalogo.nombre)
        .limit(filter.limit)
        .offset(filter.offset);

      const baseCount = db
        .select({ c: sql<number>`count(*)::int` })
        .from(comerciosCatalogo)
        .innerJoin(categorias, eq(comerciosCatalogo.categoriaId, categorias.id));
      const countQ = whereClause ? baseCount.where(whereClause) : baseCount;
      const cRow = await countQ;
      return { items, total: Number(cRow[0]?.c ?? 0) };
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.categoriaSlug !== undefined) {
        const cat = await db
          .select({ id: categorias.id })
          .from(categorias)
          .where(eq(categorias.slug, input.categoriaSlug))
          .limit(1);
        if (cat.length === 0) throw new Error('categoria_inexistente');
        set.categoriaId = cat[0]!.id;
        set.fuenteCategoria = 'manual';
        set.confianza = '1.00';
      }
      if (input.requiereRevision !== undefined) set.requiereRevision = input.requiereRevision;
      const upd = await db
        .update(comerciosCatalogo)
        .set(set)
        .where(eq(comerciosCatalogo.id, id))
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
        bancardId: r.bancardId,
        codigoComercio: r.codigoComercio,
        mcc: r.mcc,
        fuenteCategoria: r.fuenteCategoria,
        confianza: r.confianza,
        requiereRevision: r.requiereRevision,
        marca: r.marca,
        mccInferido: r.mccInferido,
        categoriaSlug: slugRow[0]?.slug ?? null,
      };
    },
  };
}
