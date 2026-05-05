import type { FastifyPluginAsync } from 'fastify';
import {
  createPatronSchema,
  updatePatronSchema,
  testPatronSchema,
} from '../schemas/patrones.js';
import type { PatronWriter, PatronTipo } from '../../db/repos/patrones.js';
import { normalize } from '../../domain/normalize.js';

function matchPatron(tipo: PatronTipo, valor: string, texto: string): boolean {
  const target = normalize(texto);
  switch (tipo) {
    case 'regex': {
      try {
        return new RegExp(valor, 'i').test(target);
      } catch {
        return false;
      }
    }
    case 'literal':
      return target === normalize(valor);
    case 'prefijo':
      return target.startsWith(normalize(valor));
    case 'contiene':
      return target.includes(normalize(valor));
  }
}

export const patronesRoute =
  (writer: PatronWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { categoria?: string; tipo?: PatronTipo; activo?: string } }>(
      '/patrones',
      async (req, reply) => {
        const filter: Parameters<PatronWriter['listar']>[0] = {};
        if (req.query.categoria) filter.categoriaSlug = req.query.categoria;
        if (req.query.tipo) filter.tipo = req.query.tipo;
        if (req.query.activo !== undefined) filter.activo = req.query.activo === 'true';
        const items = await writer.listar(filter);
        return reply.send({ items });
      },
    );

    app.get<{ Params: { id: string } }>('/patrones/:id', async (req, reply) => {
      const p = await writer.obtener(req.params.id);
      if (!p) return reply.code(404).send({ error: 'no_existe' });
      return reply.send(p);
    });

    app.post('/patrones', async (req, reply) => {
      const parsed = createPatronSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const r = await writer.crear({
          tipo: parsed.data.tipo,
          valor: parsed.data.valor,
          categoriaSlug: parsed.data.categoria_slug,
          prioridad: parsed.data.prioridad,
          descripcion: parsed.data.descripcion,
        });
        return reply.code(201).send(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        if (msg === 'patron_invalido') return reply.code(422).send({ error: msg });
        if (msg.includes('duplicate') || msg.includes('unique'))
          return reply.code(409).send({ error: 'patron_duplicado' });
        return reply.code(500).send({ error: msg });
      }
    });

    app.patch<{ Params: { id: string } }>('/patrones/:id', async (req, reply) => {
      const parsed = updatePatronSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
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
        if (msg === 'patron_invalido') return reply.code(422).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.delete<{ Params: { id: string } }>('/patrones/:id', async (req, reply) => {
      const ok = await writer.eliminar(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'no_existe' });
      return reply.send({ ok: true });
    });

    app.post('/patrones/test', async (req, reply) => {
      const parsed = testPatronSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      if (parsed.data.tipo === 'regex') {
        try {
          new RegExp(parsed.data.valor, 'i');
        } catch {
          return reply.code(422).send({ error: 'patron_invalido' });
        }
      }
      const match = matchPatron(parsed.data.tipo, parsed.data.valor, parsed.data.texto);
      return reply.send({ match });
    });
  };
