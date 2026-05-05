import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { categoriasRoute } from './categorias.js';
import type { CategoriaWriter } from '../../db/repos/categorias.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

const reader = {
  activas: vi.fn(async () => [
    { id: 'u1', slug: 'super', nombre: 'Super', descripcion: null },
  ]),
};

function fakeWriter(overrides: Partial<CategoriaWriter> = {}): CategoriaWriter {
  return {
    crear: vi.fn(async (input) => ({
      id: 'new-id',
      slug: input.slug,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
    })),
    actualizar: vi.fn(async (slug, input) => ({
      id: 'u1',
      slug,
      nombre: input.nombre ?? 'X',
      descripcion: input.descripcion ?? null,
    })),
    eliminar: vi.fn(async () => true),
    usage: vi.fn(async () => ({ movimientos: 0, reglas: 0, mcc: 0, comercios: 0 })),
    ...overrides,
  };
}

describe('GET /categorias', () => {
  it('lista categorías activas', async () => {
    const app = Fastify();
    await app.register(categoriasRoute(reader));
    await app.ready();
    const r = await app.inject({ method: 'GET', url: '/categorias' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toHaveLength(1);
  });
});

describe('CRUD categorias', () => {
  it('POST crea categoría', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(categoriasRoute(reader, w));
    const r = await app.inject({
      method: 'POST',
      url: '/categorias',
      payload: { slug: 'mascotas', nombre: 'Mascotas' },
    });
    expect(r.statusCode).toBe(201);
    expect(w.crear).toHaveBeenCalled();
  });

  it('POST rechaza slug inválido', async () => {
    const app = Fastify();
    await app.register(categoriasRoute(reader, fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/categorias',
      payload: { slug: 'Mascotas Espacios!', nombre: 'X' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST 409 si slug existe', async () => {
    const w = fakeWriter({
      crear: vi.fn(async () => {
        throw new Error('duplicate key violates unique');
      }),
    });
    const app = Fastify();
    await app.register(categoriasRoute(reader, w));
    const r = await app.inject({
      method: 'POST',
      url: '/categorias',
      payload: { slug: 'super', nombre: 'X' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('PATCH actualiza nombre', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(categoriasRoute(reader, w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/categorias/super',
      payload: { nombre: 'Super Mercado' },
    });
    expect(r.statusCode).toBe(200);
    expect(w.actualizar).toHaveBeenCalledWith('super', { nombre: 'Super Mercado' });
  });

  it('GET /categorias/:slug/usage', async () => {
    const w = fakeWriter({
      usage: vi.fn(async () => ({ movimientos: 5, reglas: 1, mcc: 0, comercios: 2 })),
    });
    const app = Fastify();
    await app.register(categoriasRoute(reader, w));
    const r = await app.inject({ method: 'GET', url: '/categorias/super/usage' });
    expect(r.json().movimientos).toBe(5);
  });

  it('DELETE 409 con refs', async () => {
    const w = fakeWriter({
      usage: vi.fn(async () => ({ movimientos: 1, reglas: 0, mcc: 0, comercios: 0 })),
    });
    const app = Fastify();
    await app.register(categoriasRoute(reader, w));
    const r = await app.inject({ method: 'DELETE', url: '/categorias/super' });
    expect(r.statusCode).toBe(409);
  });

  it('DELETE ok zero refs', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(categoriasRoute(reader, w));
    const r = await app.inject({ method: 'DELETE', url: '/categorias/super' });
    expect(r.statusCode).toBe(200);
    expect(w.eliminar).toHaveBeenCalled();
  });
});
