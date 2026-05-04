import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { logger } from '../lib/logger.js';

export interface BuildOptions {
  trustProxy?: boolean;
}

export async function build(opts: BuildOptions = {}) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: opts.trustProxy ?? false,
    disableRequestLogging: false,
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: true,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-api-key', 'x-request-id'],
  });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

export type App = Awaited<ReturnType<typeof build>>;

export async function start(port: number) {
  const app = await build();
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
