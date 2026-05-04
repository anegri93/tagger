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
});
