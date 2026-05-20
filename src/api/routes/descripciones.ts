import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DescripcionUsoRepo } from '../../db/repos/descripcion-uso.js';

const querySchema = z.object({
  usuario: z.string().trim().min(1).max(200),
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  categoria_id: z.string().uuid().optional(),
});

export const descripcionesRoute =
  (repo: DescripcionUsoRepo): FastifyPluginAsync =>
  async (app) => {
    app.get('/descripciones/sugerencias', async (req, reply) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.flatten() });
      }
      const { usuario, q, limit, categoria_id } = parsed.data;
      const items = await repo.sugerir({
        usuarioId: usuario,
        q,
        limit,
        categoriaId: categoria_id ?? null,
      });
      return reply.send({
        usuario,
        q,
        limit,
        items: items.map((i) => ({
          descripcion: i.descripcion,
          freq: i.freq,
          ...(i.categoriaSlug ? { categoria_slug: i.categoriaSlug } : {}),
        })),
      });
    });
  };
