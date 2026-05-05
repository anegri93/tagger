import type { FastifyPluginAsync } from 'fastify';
import { createMccSchema, updateMccSchema } from '../schemas/mcc.js';
import type { MccWriter } from '../../db/repos/mcc-writer.js';

export const mccRoute =
  (writer: MccWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { categoria?: string; sin_categoria?: string } }>(
      '/mcc',
      async (req, reply) => {
        const filter: { categoriaSlug?: string; sinCategoria?: boolean } = {};
        if (req.query.sin_categoria === 'true') filter.sinCategoria = true;
        else if (req.query.categoria) filter.categoriaSlug = req.query.categoria;
        const items = await writer.listar(filter);
        return reply.send({ items });
      },
    );

    app.post('/mcc', async (req, reply) => {
      const parsed = createMccSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const r = await writer.crear({
          codMcc: parsed.data.cod_mcc,
          descripcion: parsed.data.descripcion,
          categoriaSlug: parsed.data.categoria_slug,
          ambiguo: parsed.data.ambiguo,
        });
        return reply.code(201).send(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (/duplicate|unique/.test(msg)) return reply.code(409).send({ error: 'cod_mcc_existe' });
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.patch<{ Params: { cod_mcc: string } }>('/mcc/:cod_mcc', async (req, reply) => {
      const parsed = updateMccSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const upd = await writer.actualizar(req.params.cod_mcc, {
          ...(parsed.data.descripcion !== undefined ? { descripcion: parsed.data.descripcion } : {}),
          ...(parsed.data.categoria_slug !== undefined
            ? { categoriaSlug: parsed.data.categoria_slug }
            : {}),
          ...(parsed.data.ambiguo !== undefined ? { ambiguo: parsed.data.ambiguo } : {}),
        });
        if (!upd) return reply.code(404).send({ error: 'no_existe' });
        return reply.send(upd);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'categoria_inexistente') return reply.code(400).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.delete<{ Params: { cod_mcc: string } }>('/mcc/:cod_mcc', async (req, reply) => {
      const r = await writer.eliminar(req.params.cod_mcc);
      if (r === false) return reply.code(404).send({ error: 'no_existe' });
      if (typeof r === 'object' && r.tieneRefs)
        return reply.code(409).send({ error: 'tiene_referencias', usage: { comercios: r.comercios } });
      return reply.send({ ok: true });
    });
  };
