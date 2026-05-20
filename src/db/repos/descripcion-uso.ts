import { sql, eq, and, desc } from 'drizzle-orm';
import type { Db } from '../client.js';
import { descripcionUso, categorias } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';

export interface SugerenciaDescripcion {
  descripcion: string;
  freq: number;
  categoriaSlug?: string;
}

export interface DescripcionUsoRepo {
  upsert(input: {
    usuarioId: string;
    descripcion: string;
    categoriaId?: string | null;
  }): Promise<void>;
  sugerir(input: {
    usuarioId: string;
    q: string;
    limit: number;
    categoriaId?: string | null;
  }): Promise<SugerenciaDescripcion[]>;
}

export function crearDescripcionUsoRepo(db: Db): DescripcionUsoRepo {
  return {
    async upsert({ usuarioId, descripcion, categoriaId }) {
      const original = descripcion.trim();
      if (!original) return;
      const normalizada = normalize(original);
      if (!normalizada) return;
      await db
        .insert(descripcionUso)
        .values({
          usuarioId,
          descripcionNormalizada: normalizada,
          descripcionOriginal: original,
          catTopId: categoriaId ?? null,
          freq: 1,
        })
        .onConflictDoUpdate({
          target: [descripcionUso.usuarioId, descripcionUso.descripcionNormalizada],
          set: {
            freq: sql`${descripcionUso.freq} + 1`,
            ultimaVezAt: new Date(),
            ...(categoriaId ? { catTopId: categoriaId } : {}),
          },
        });
    },

    async sugerir({ usuarioId, q, limit, categoriaId }) {
      const qNorm = normalize(q);
      if (!qNorm) return [];
      const prefix = qNorm + '%';
      const baseSelect = {
        descripcion: descripcionUso.descripcionOriginal,
        freq: descripcionUso.freq,
        categoriaSlug: categorias.slug,
      };
      const baseQuery = db
        .select(baseSelect)
        .from(descripcionUso)
        .leftJoin(categorias, eq(categorias.id, descripcionUso.catTopId))
        .where(
          and(
            eq(descripcionUso.usuarioId, usuarioId),
            sql`${descripcionUso.descripcionNormalizada} LIKE ${prefix}`,
          ),
        );
      const rows = categoriaId
        ? await baseQuery
            .orderBy(
              sql`CASE WHEN ${descripcionUso.catTopId} = ${categoriaId} THEN 0 ELSE 1 END`,
              desc(descripcionUso.freq),
            )
            .limit(limit)
        : await baseQuery.orderBy(desc(descripcionUso.freq)).limit(limit);
      return rows.map((r) => ({
        descripcion: r.descripcion,
        freq: r.freq,
        ...(r.categoriaSlug ? { categoriaSlug: r.categoriaSlug } : {}),
      }));
    },
  };
}
