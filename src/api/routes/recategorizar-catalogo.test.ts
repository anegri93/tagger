import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { recategorizarCatalogoRoute, _resetRunState } from './recategorizar-catalogo.js';
import type { CapasSincrono } from '../../pipeline/categorizar.js';

function fakeDbVacia() {
  return {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: () => ({
            offset: () => Promise.resolve([]),
          }),
        }),
        then: (resolve: (v: unknown[]) => unknown) => resolve([]),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    execute: vi.fn(async () => ({ rows: [{ n: 0 }] })),
  };
}

function stubCapas(): CapasSincrono {
  return {
    regex: { evaluar: vi.fn(async () => null) },
    bancard: { evaluar: vi.fn(async () => null) },
    comercio: { evaluar: vi.fn(async () => null) },
    patrones: { evaluar: vi.fn(async () => null) },
    mcc: { evaluar: vi.fn(async () => null) },
  };
}

describe('recategorizar-catalogo route', () => {
  beforeEach(() => {
    _resetRunState();
  });

  it('POST dispara run y devuelve 202 + run_id', async () => {
    const app = Fastify();
    await app.register(recategorizarCatalogoRoute(fakeDbVacia() as never, stubCapas()));
    const r = await app.inject({ method: 'POST', url: '/catalogo/recategorizar' });
    expect(r.statusCode).toBe(202);
    expect(r.json().run_id).toMatch(/^run_/);
  });

  it('GET status sin run previo → run: null', async () => {
    const app = Fastify();
    await app.register(recategorizarCatalogoRoute(fakeDbVacia() as never, stubCapas()));
    const r = await app.inject({ method: 'GET', url: '/catalogo/recategorizar/status' });
    expect(r.json().run).toBeNull();
  });

  it('GET status post-run muestra estado', async () => {
    const app = Fastify();
    await app.register(recategorizarCatalogoRoute(fakeDbVacia() as never, stubCapas()));
    await app.inject({ method: 'POST', url: '/catalogo/recategorizar' });
    // pequeño delay para que el run termine
    await new Promise((res) => setTimeout(res, 50));
    const r = await app.inject({ method: 'GET', url: '/catalogo/recategorizar/status' });
    expect(['running', 'done']).toContain(r.json().run.estado);
  });

  it('POST 409 si run en progreso', async () => {
    const app = Fastify();
    // mockear servicio lento bloqueando la query select inicial
    const slowDb = {
      ...fakeDbVacia(),
      select: () => ({
        from: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => new Promise((res) => setTimeout(() => res([]), 200)),
            }),
          }),
          then: (resolve: (v: unknown[]) => unknown) =>
            new Promise((res) =>
              setTimeout(() => {
                resolve([{ id: '1' }]);
                res(undefined);
              }, 100),
            ),
        }),
      }),
    };
    await app.register(recategorizarCatalogoRoute(slowDb as never, stubCapas()));
    const r1 = await app.inject({ method: 'POST', url: '/catalogo/recategorizar' });
    expect(r1.statusCode).toBe(202);
    const r2 = await app.inject({ method: 'POST', url: '/catalogo/recategorizar' });
    expect(r2.statusCode).toBe(409);
  });

  it('GET comparacion devuelve totales', async () => {
    const app = Fastify();
    const db = {
      ...fakeDbVacia(),
      execute: vi.fn(async () => ({ rows: [{ n: 5 }] })),
    };
    await app.register(recategorizarCatalogoRoute(db as never, stubCapas()));
    const r = await app.inject({ method: 'GET', url: '/catalogo/recategorizar/comparacion' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('match');
    expect(body).toHaveProperty('diff');
    expect(body).toHaveProperty('top_diffs');
    expect(body).toHaveProperty('por_fuente_nueva');
  });
});
