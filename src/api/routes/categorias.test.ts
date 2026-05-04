import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { categoriasRoute } from './categorias.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

describe('GET /categorias', () => {
  it('lista categorías activas', async () => {
    const app = Fastify();
    await app.register(
      categoriasRoute({
        activas: vi.fn().mockResolvedValue([
          { id: 'a', slug: 'super', nombre: 'Supermercado', descripcion: null },
          { id: 'b', slug: 'comb', nombre: 'Combustible', descripcion: 'Naftas' },
        ]),
      }),
    );
    await app.ready();
    const r = await app.inject({ method: 'GET', url: '/categorias' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toHaveLength(2);
    expect(r.json().items[0]).toMatchObject({ slug: 'super' });
  });

  it('lista vacía es válida', async () => {
    const app = Fastify();
    await app.register(categoriasRoute({ activas: vi.fn().mockResolvedValue([]) }));
    await app.ready();
    const r = await app.inject({ method: 'GET', url: '/categorias' });
    expect(r.json()).toEqual({ items: [] });
  });
});
