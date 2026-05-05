import type { FastifyPluginAsync } from 'fastify';
import { createMarcaSchema, updateMarcaSchema } from '../schemas/marcas.js';
import type { MarcaWriter } from '../../db/repos/marcas.js';

export const marcasRoute =
  (writer: MarcaWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { categoria?: string } }>('/marcas', async (req, reply) => {
      const items = await writer.listar(req.query.categoria);
      return reply.send({ items });
    });

    app.post('/marcas', async (req, reply) => {
      const parsed = createMarcaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const r = await writer.crear({
          marca: parsed.data.marca,
          categoriaSlug: parsed.data.categoria_slug,
          descripcion: parsed.data.descripcion,
        });
        return reply.code(201).send(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (/duplicate|unique/.test(msg)) return reply.code(409).send({ error: 'marca_existe' });
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.patch<{ Params: { id: string } }>('/marcas/:id', async (req, reply) => {
      const parsed = updateMarcaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const upd = await writer.actualizar(req.params.id, {
          ...(parsed.data.marca !== undefined ? { marca: parsed.data.marca } : {}),
          ...(parsed.data.descripcion !== undefined ? { descripcion: parsed.data.descripcion } : {}),
          ...(parsed.data.categoria_slug !== undefined
            ? { categoriaSlug: parsed.data.categoria_slug }
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

    app.delete<{ Params: { id: string } }>('/marcas/:id', async (req, reply) => {
      const ok = await writer.eliminar(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'no_existe' });
      return reply.send({ ok: true });
    });
  };
