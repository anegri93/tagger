import type { FastifyPluginAsync } from 'fastify';
import { listComerciosSchema, updateComercioSchema } from '../schemas/comercios.js';
import type { ComerciosWriter } from '../../db/repos/comercios-writer.js';

export const comerciosRoute =
  (writer: ComerciosWriter): FastifyPluginAsync =>
  async (app) => {
    app.get('/comercios', async (req, reply) => {
      const parsed = listComerciosSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const q = parsed.data;
      const filter: Parameters<ComerciosWriter['listar']>[0] = {
        limit: q.limit,
        offset: q.offset,
      };
      if (q.categoria !== undefined) filter.categoriaSlug = q.categoria;
      if (q.q !== undefined) filter.q = q.q;
      if (q.requiere_revision !== undefined)
        filter.requiereRevision = q.requiere_revision === 'true';
      const result = await writer.listar(filter);
      return reply.send({ ...result, limit: q.limit, offset: q.offset });
    });

    app.patch<{ Params: { id: string } }>('/comercios/:id', async (req, reply) => {
      const parsed = updateComercioSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const upd = await writer.actualizar(req.params.id, {
          ...(parsed.data.categoria_slug !== undefined
            ? { categoriaSlug: parsed.data.categoria_slug }
            : {}),
          ...(parsed.data.requiere_revision !== undefined
            ? { requiereRevision: parsed.data.requiere_revision }
            : {}),
        });
        if (!upd) return reply.code(404).send({ error: 'no_existe' });
        return reply.send(upd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });
  };
