import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { healthRoute } from './health.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

async function build(deps: Parameters<typeof healthRoute>[0]) {
  const app = Fastify();
  await app.register(healthRoute(deps));
  await app.ready();
  return app;
}

describe('health/ready', () => {
  it('200 cuando DB ok y ollama skip', async () => {
    const app = await build({ pingDb: vi.fn().mockResolvedValue(true) });
    const r = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', db: 'ok', ollama: 'skip' });
  });

  it('503 cuando DB falla', async () => {
    const app = await build({ pingDb: vi.fn().mockResolvedValue(false) });
    const r = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ status: 'degraded', db: 'fail' });
  });

  it('reporta ollama ok/fail si pingOllama provisto', async () => {
    const a = await build({
      pingDb: vi.fn().mockResolvedValue(true),
      pingOllama: vi.fn().mockResolvedValue(true),
    });
    expect((await a.inject({ method: 'GET', url: '/health/ready' })).json()).toMatchObject({
      ollama: 'ok',
    });

    const b = await build({
      pingDb: vi.fn().mockResolvedValue(true),
      pingOllama: vi.fn().mockResolvedValue(false),
    });
    expect((await b.inject({ method: 'GET', url: '/health/ready' })).json()).toMatchObject({
      ollama: 'fail',
    });
  });

  it('pingDb que throw → tratado como fail', async () => {
    const app = await build({ pingDb: vi.fn().mockRejectedValue(new Error('conn')) });
    const r = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(r.statusCode).toBe(503);
  });
});
