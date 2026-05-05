import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { catalogoRoute } from './catalogo.js';
import type { CatalogoMassiveRunner } from '../../test-batch/catalogo-runner.js';

function fakeRunner(overrides: Partial<CatalogoMassiveRunner> = {}): CatalogoMassiveRunner {
  return {
    start: vi.fn(() => ({
      status: 'running' as const,
      startedAt: Date.now(),
      finishedAt: null,
      total: 0,
      porFuente: null,
      revision: 0,
      truncated: false,
      errorMsg: null,
    })),
    info: {
      status: 'idle' as const,
      startedAt: null,
      finishedAt: null,
      total: 0,
      porFuente: null,
      revision: 0,
      truncated: false,
      errorMsg: null,
    },
    ...overrides,
  } as unknown as CatalogoMassiveRunner;
}

describe('catalogo route', () => {
  it('POST /catalogo/reprocess arranca', async () => {
    const r = fakeRunner();
    const app = Fastify();
    await app.register(catalogoRoute(r));
    const res = await app.inject({
      method: 'POST',
      url: '/catalogo/reprocess',
      payload: { truncate_first: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('running');
  });

  it('POST 409 si reproceso en curso', async () => {
    const r = fakeRunner({
      start: vi.fn(() => {
        throw new Error('reproceso_en_curso');
      }),
    });
    const app = Fastify();
    await app.register(catalogoRoute(r));
    const res = await app.inject({ method: 'POST', url: '/catalogo/reprocess', payload: {} });
    expect(res.statusCode).toBe(409);
  });

  it('GET status', async () => {
    const r = fakeRunner();
    const app = Fastify();
    await app.register(catalogoRoute(r));
    const res = await app.inject({ method: 'GET', url: '/catalogo/reprocess/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('idle');
  });
});
