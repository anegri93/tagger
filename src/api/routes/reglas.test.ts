import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { reglasRoute } from './reglas.js';
import type { ReglaWriter } from '../../db/repos/reglas-writer.js';

function fakeWriter(overrides: Partial<ReglaWriter> = {}): ReglaWriter {
  return {
    listar: vi.fn(async () => [
      {
        id: 'r1',
        patron: '\\bBIGGIE\\b',
        categoriaId: 'c1',
        categoriaSlug: 'super',
        prioridad: 10,
        descripcion: 'BIGGIE',
        activo: true,
      },
    ]),
    crear: vi.fn(async (input) => ({
      id: 'new',
      patron: input.patron,
      categoriaId: 'c1',
      categoriaSlug: input.categoriaSlug,
      prioridad: input.prioridad,
      descripcion: input.descripcion ?? null,
      activo: true,
    })),
    actualizar: vi.fn(async (id) => ({
      id,
      patron: 'X',
      categoriaId: 'c1',
      categoriaSlug: 'super',
      prioridad: 100,
      descripcion: null,
      activo: true,
    })),
    eliminar: vi.fn(async () => true),
    ...overrides,
  };
}

describe('reglas route', () => {
  it('GET /reglas lista', async () => {
    const app = Fastify();
    await app.register(reglasRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/reglas' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toHaveLength(1);
  });

  it('POST /reglas crea', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(reglasRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/reglas',
      payload: { patron: '\\bAZAR\\b', categoria_slug: 'azar', prioridad: 10 },
    });
    expect(r.statusCode).toBe(201);
    expect(w.crear).toHaveBeenCalled();
  });

  it('POST rechaza patrón inválido', async () => {
    const app = Fastify();
    await app.register(reglasRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/reglas',
      payload: { patron: '[invalid', categoria_slug: 'super', prioridad: 10 },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('patron_invalido');
  });

  it('POST 400 si categoria_inexistente', async () => {
    const w = fakeWriter({
      crear: vi.fn(async () => {
        throw new Error('categoria_inexistente');
      }),
    });
    const app = Fastify();
    await app.register(reglasRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/reglas',
      payload: { patron: 'X', categoria_slug: 'no-existe', prioridad: 10 },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST /reglas/test devuelve match', async () => {
    const app = Fastify();
    await app.register(reglasRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/reglas/test',
      payload: { patron: '\\bBIGGIE\\b', texto: 'COMPRA BIGGIE ASUNCION' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().match).toBe(true);
  });

  it('PATCH actualiza', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(reglasRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/reglas/r1',
      payload: { activo: false },
    });
    expect(r.statusCode).toBe(200);
  });

  it('DELETE ok', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(reglasRoute(w));
    const r = await app.inject({ method: 'DELETE', url: '/reglas/r1' });
    expect(r.statusCode).toBe(200);
  });
});
