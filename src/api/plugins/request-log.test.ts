import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { requestLog } from './request-log.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

async function build() {
  const app = Fastify();
  await app.register(requestLog);
  app.get('/x', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('request-log plugin', () => {
  it('agrega header x-request-id', async () => {
    const app = await build();
    const r = await app.inject({ method: 'GET', url: '/x' });
    expect(r.headers['x-request-id']).toBeDefined();
    expect(typeof r.headers['x-request-id']).toBe('string');
  });

  it('propaga x-request-id entrante', async () => {
    const app = await build();
    const r = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { 'x-request-id': 'rid-abc-123' },
    });
    expect(r.headers['x-request-id']).toBe('rid-abc-123');
  });

  it('genera nuevo si entrada > 128 chars', async () => {
    const app = await build();
    const big = 'x'.repeat(200);
    const r = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { 'x-request-id': big },
    });
    expect(r.headers['x-request-id']).not.toBe(big);
  });
});
