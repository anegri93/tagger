import { describe, it, expect, beforeAll } from 'vitest';
import type { App } from './server.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

describe('server', () => {
  let app: App;

  beforeAll(async () => {
    const { build } = await import('./server.js');
    app = await build();
    await app.ready();
  });

  it('GET /health responde 200 con status ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
  });

  it('GET /version retorna shape esperado', async () => {
    const r = await app.inject({ method: 'GET', url: '/version' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.name).toBe('tagger');
    expect(typeof body.version).toBe('string');
    expect(body.repo).toBe('https://github.com/anegri93/tagger');
  });

  it('GET /postman/tagger.postman_collection.json sirve estático', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/postman/tagger.postman_collection.json',
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/json/);
  });

  it('GET /openapi.yaml sirve spec', async () => {
    const r = await app.inject({ method: 'GET', url: '/openapi.yaml' });
    expect(r.statusCode).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it('GET /docs/runbook.md sirve docs', async () => {
    const r = await app.inject({ method: 'GET', url: '/docs/runbook.md' });
    expect(r.statusCode).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
  });
});
