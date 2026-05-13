import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { logger } from '../lib/logger.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedVersion: string | null = null;
function readVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    cachedVersion = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion ?? '0.0.0';
}

export interface BuildOptions {
  trustProxy?: boolean;
}

export async function build(opts: BuildOptions = {}) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: opts.trustProxy ?? false,
    disableRequestLogging: false,
    bodyLimit: 200 * 1024 * 1024, // 200 MB para imports grandes
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: true,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-api-key', 'x-request-id'],
  });

  await app.register(staticPlugin, {
    root: resolve(ROOT, 'ui'),
    prefix: '/ui/',
    decorateReply: false,
  });

  await app.register(staticPlugin, {
    root: resolve(ROOT, 'postman'),
    prefix: '/postman/',
    decorateReply: false,
  });

  await app.register(staticPlugin, {
    root: resolve(ROOT, 'docs'),
    prefix: '/docs/',
    decorateReply: false,
  });

  app.get('/openapi.yaml', async (_req, reply) => {
    return reply
      .type('application/yaml')
      .send(readFileSync(resolve(ROOT, 'openapi.yaml'), 'utf8'));
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/version', async () => ({
    version: readVersion(),
    name: 'tagger',
    repo: 'https://github.com/anegri93/tagger',
  }));

  app.get('/', async (_req, reply) => reply.redirect('/ui/'));
  app.get('/ui', async (_req, reply) => reply.redirect('/ui/'));

  return app;
}

export type App = Awaited<ReturnType<typeof build>>;

export async function start(port: number) {
  const app = await build();
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
