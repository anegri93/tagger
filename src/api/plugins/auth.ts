import { timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const SKIP_PATHS = new Set(['/health', '/health/ready', '/', '/ui', '/favicon.ico']);

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const plugin: FastifyPluginAsync<{ apiKey: string }> = async (app, opts) => {
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (SKIP_PATHS.has(path)) return;
    if (path.startsWith('/ui/')) return;
    const provided = req.headers['x-api-key'];
    if (typeof provided !== 'string' || !safeEqual(provided, opts.apiKey)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
};

export const apiKeyAuth = fp(plugin, { name: 'api-key-auth' });
