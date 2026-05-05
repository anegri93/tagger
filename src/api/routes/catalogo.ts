import type { FastifyPluginAsync } from 'fastify';
import { reprocessRequestSchema } from '../schemas/catalogo.js';
import type { CatalogoMassiveRunner } from '../../test-batch/catalogo-runner.js';

export const catalogoRoute =
  (runner: CatalogoMassiveRunner): FastifyPluginAsync =>
  async (app) => {
    app.post('/catalogo/reprocess', async (req, reply) => {
      const parsed = reprocessRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const opts: Parameters<CatalogoMassiveRunner['start']>[0] = {};
        if (parsed.data.truncate_first !== undefined) opts.truncateFirst = parsed.data.truncate_first;
        if (parsed.data.file !== undefined) opts.file = parsed.data.file;
        const info = runner.start(opts);
        return reply.send(info);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'reproceso_en_curso') return reply.code(409).send({ error: msg });
        return reply.code(500).send({ error: msg });
      }
    });

    app.get('/catalogo/reprocess/status', async (_req, reply) => {
      return reply.send(runner.info);
    });
  };
