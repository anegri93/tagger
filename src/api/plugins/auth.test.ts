import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { apiKeyAuth } from './auth.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

const KEY = 'super-secret-key-1234567890';

async function build() {
  const app = Fastify();
  await app.register(apiKeyAuth, { apiKey: KEY });
  app.get('/protegido', async () => ({ ok: true }));
  app.get('/health', async () => ({ status: 'ok' }));
  await app.ready();
  return app;
}

describe('auth api-key', () => {
  it('401 si falta header', async () => {
    const app = await build();
    const r = await app.inject({ method: 'GET', url: '/protegido' });
    expect(r.statusCode).toBe(401);
  });

  it('401 si key incorrecta', async () => {
    const app = await build();
    const r = await app.inject({
      method: 'GET',
      url: '/protegido',
      headers: { 'x-api-key': 'wrong' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('200 si key correcta', async () => {
    const app = await build();
    const r = await app.inject({
      method: 'GET',
      url: '/protegido',
      headers: { 'x-api-key': KEY },
    });
    expect(r.statusCode).toBe(200);
  });

  it('skip /health sin header', async () => {
    const app = await build();
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
  });

  it.each(['/openapi.yaml', '/version', '/postman/x.json', '/docs/runbook.md', '/ui/algo'])(
    'skip %s sin header',
    async (url) => {
      const app = Fastify();
      await app.register(apiKeyAuth, { apiKey: KEY });
      app.get(url, async () => 'ok');
      await app.ready();
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(200);
    },
  );
});
