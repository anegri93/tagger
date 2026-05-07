import type { FastifyPluginAsync } from 'fastify';
import {
  startBatchRequestSchema,
  stopBatchRequestSchema,
} from '../schemas/test-batch.js';
import type { TestBatchRunner } from '../../test-batch/runner.js';

export const testBatchControlRoute =
  (runner: TestBatchRunner): FastifyPluginAsync =>
  async (app) => {
    app.post('/test-batch/start', async (req, reply) => {
      const parsed = startBatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const body = parsed.data;
      try {
        const opts: Parameters<TestBatchRunner['start']>[1] = {};
        if (body.files !== undefined) opts.files = body.files;
        if (body.limit !== undefined) opts.limit = body.limit;
        if (body.concurrency !== undefined) opts.concurrency = body.concurrency;
        if (body.bypass_catalogo !== undefined) opts.bypassCatalogo = body.bypass_catalogo;
        if (body.source !== undefined) opts.source = body.source;
        const info = await runner.start(body.batch_id, opts);
        return reply.send({ ok: true, batch: info });
      } catch (err) {
        return reply
          .code(409)
          .send({ error: err instanceof Error ? err.message : 'start_failed' });
      }
    });

    app.post('/test-batch/stop', async (req, reply) => {
      const parsed = stopBatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const ok = runner.stop(parsed.data.batch_id);
      return reply.send({ ok, batch_id: parsed.data.batch_id });
    });

    app.get('/test-batch/list', async (_req, reply) => {
      return reply.send({ items: runner.list() });
    });
  };
