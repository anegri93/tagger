import type { FastifyPluginAsync } from 'fastify';
import {
  createReglaSchema,
  updateReglaSchema,
  testReglaSchema,
} from '../schemas/reglas.js';
import type { ReglaWriter } from '../../db/repos/reglas-writer.js';

export const reglasRoute =
  (writer: ReglaWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { categoria?: string } }>('/reglas', async (req, reply) => {
      const items = await writer.listar(req.query.categoria);
      return reply.send({ items });
    });

    app.post('/reglas', async (req, reply) => {
      const parsed = createReglaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        new RegExp(parsed.data.patron, 'i');
      } catch {
        return reply.code(400).send({ error: 'patron_invalido' });
      }
      try {
        const r = await writer.crear({
          patron: parsed.data.patron,
          categoriaSlug: parsed.data.categoria_slug,
          prioridad: parsed.data.prioridad,
          descripcion: parsed.data.descripcion,
        });
        return reply.code(201).send(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.patch<{ Params: { id: string } }>('/reglas/:id', async (req, reply) => {
      const parsed = updateReglaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      if (parsed.data.patron !== undefined) {
        try {
          new RegExp(parsed.data.patron, 'i');
        } catch {
          return reply.code(400).send({ error: 'patron_invalido' });
        }
      }
      try {
        const upd = await writer.actualizar(req.params.id, {
          ...parsed.data,
          categoriaSlug: parsed.data.categoria_slug,
        });
        if (!upd) return reply.code(404).send({ error: 'no_existe' });
        return reply.send(upd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.delete<{ Params: { id: string } }>('/reglas/:id', async (req, reply) => {
      const ok = await writer.eliminar(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'no_existe' });
      return reply.send({ ok: true });
    });

    app.post('/reglas/test', async (req, reply) => {
      const parsed = testReglaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const re = new RegExp(parsed.data.patron, 'i');
        return reply.send({ match: re.test(parsed.data.texto) });
      } catch {
        return reply.code(400).send({ error: 'patron_invalido' });
      }
    });
  };
