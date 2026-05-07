import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

export const datasetsRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get('/datasets', async (_req, reply) => {
      const rows = await db.execute(sql`
        SELECT d.slug, d.nombre, d.descripcion,
               (SELECT count(*)::int FROM dataset_comercios dc WHERE dc.dataset_id = d.id) AS total,
               (SELECT count(*)::int FROM dataset_comercios dc
                WHERE dc.dataset_id = d.id AND dc.recategorizado_at IS NOT NULL) AS recategorizados,
               (SELECT count(*)::int FROM dataset_comercios dc
                WHERE dc.dataset_id = d.id AND dc.recategorizado_at IS NOT NULL
                  AND dc.categoria_nueva_id IS NULL) AS sin_categoria
        FROM datasets d
        ORDER BY d.created_at DESC
      `);
      return reply.send({ items: rows.rows });
    });
  };
