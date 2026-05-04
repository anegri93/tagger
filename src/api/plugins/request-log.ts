import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id'];
    const reqId = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
    (req as { id: string }).id = reqId;
    void reply.header('x-request-id', reqId);
  });

  app.addHook('preHandler', async (req) => {
    if (req.log.level === 'debug' || req.log.level === 'trace') {
      req.log.debug({ body: req.body }, 'request body');
    }
  });
};

export const requestLog = fp(plugin, { name: 'request-log' });
