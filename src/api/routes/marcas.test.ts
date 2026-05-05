import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { marcasRoute } from './marcas.js';
import type { MarcaWriter } from '../../db/repos/marcas.js';

function fakeWriter(overrides: Partial<MarcaWriter> = {}): MarcaWriter {
  return {
    listar: vi.fn(async () => [
      { id: 'm1', marca: 'BIGGIE', descripcion: null, categoriaSlug: 'super' },
    ]),
    porCategoria: vi.fn(async () => new Map()),
    crear: vi.fn(async (input) => ({
      id: 'new',
      marca: input.marca,
      descripcion: input.descripcion ?? null,
      categoriaSlug: input.categoriaSlug,
    })),
    actualizar: vi.fn(async (id) => ({ id, marca: 'X', descripcion: null, categoriaSlug: 'super' })),
    eliminar: vi.fn(async () => true),
    ...overrides,
  };
}

describe('marcas route', () => {
  it('GET /marcas', async () => {
    const app = Fastify();
    await app.register(marcasRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/marcas' });
    expect(r.statusCode).toBe(200);
  });

  it('POST /marcas crea', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(marcasRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/marcas',
      payload: { marca: 'PETSHOP', categoria_slug: 'mascotas' },
    });
    expect(r.statusCode).toBe(201);
  });

  it('POST 409 si marca duplicada', async () => {
    const w = fakeWriter({
      crear: vi.fn(async () => {
        throw new Error('duplicate key');
      }),
    });
    const app = Fastify();
    await app.register(marcasRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/marcas',
      payload: { marca: 'BIGGIE', categoria_slug: 'super' },
    });
    expect(r.statusCode).toBe(409);
  });
});
