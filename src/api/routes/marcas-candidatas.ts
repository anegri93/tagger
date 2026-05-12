import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { STOPWORDS_GEO } from '../../services/sugerir-patrones-ia.js';

function buildFrom(categoriaSlug?: string): ReturnType<typeof sql> {
  if (categoriaSlug === '__all__') {
    return sql`(SELECT id, nombre FROM comercios_catalogo
      WHERE categoria_id IS NOT NULL) AS src`;
  }
  if (categoriaSlug) {
    return sql`(SELECT cc.id, cc.nombre FROM comercios_catalogo cc
      JOIN categorias cat ON cat.id = cc.categoria_id
      WHERE cat.slug = ${categoriaSlug}) AS src`;
  }
  return sql`(SELECT id, nombre FROM comercios_catalogo
    WHERE recategorizado_at IS NOT NULL AND categoria_nueva_id IS NULL) AS src`;
}

export const marcasCandidatasRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get<{
      Querystring: { min_freq?: string; limit?: string; categoria?: string };
    }>('/datasets/marcas-candidatas', async (req, reply) => {
      const from = buildFrom(req.query.categoria);
      const minFreq = Math.max(2, Number(req.query.min_freq ?? 3));
      const limit = Math.min(200, Number(req.query.limit ?? 50));

      const stopwordsSql = sql.join(
        STOPWORDS_GEO.map((w) => sql`${w}`),
        sql`, `,
      );

      const rows = await db.execute(sql`
          WITH base AS (
            SELECT id, nombre,
                   regexp_split_to_array(
                     upper(regexp_replace(nombre, '[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ ]', ' ', 'g')),
                     ' +'
                   ) AS toks
            FROM ${from}
          ),
          filtrado AS (
            SELECT b.id, b.nombre,
                   (
                     SELECT array_agg(t)
                     FROM unnest(b.toks) AS t
                     WHERE length(t) >= 3
                   ) AS toks_ok
            FROM base b
          ),
          prefijos AS (
            SELECT id, nombre,
                   toks_ok[1] AS t1,
                   toks_ok[2] AS t2,
                   toks_ok[1] || ' ' || toks_ok[2] AS prefijo
            FROM filtrado
            WHERE array_length(toks_ok, 1) >= 2
          ),
          stopwords AS (
            SELECT unnest(ARRAY[${stopwordsSql}]::text[]) AS w
          ),
          existentes AS (
            SELECT upper(valor) AS v FROM patrones
          )
          SELECT prefijo,
                 count(*)::int AS freq,
                 (array_agg(nombre ORDER BY nombre))[1:5] AS ejemplos
          FROM prefijos p
          WHERE length(prefijo) >= 7
            AND NOT (
              EXISTS (SELECT 1 FROM stopwords s WHERE s.w = p.t1)
              AND EXISTS (SELECT 1 FROM stopwords s WHERE s.w = p.t2)
            )
            AND NOT EXISTS (SELECT 1 FROM existentes e WHERE e.v = p.prefijo)
          GROUP BY prefijo
          HAVING count(*) >= ${minFreq}
          ORDER BY freq DESC
          LIMIT ${limit}
        `);
      return reply.send({ items: rows.rows });
    });
  };
