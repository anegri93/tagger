import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { mccRoute } from './mcc.js';
import type { MccWriter } from '../../db/repos/mcc-writer.js';

function fakeWriter(overrides: Partial<MccWriter> = {}): MccWriter {
  return {
    listar: vi.fn(async () => [
      {
        codMcc: '5411',
        descripcion: 'SUPERMERCADOS',
        categoriaSlug: 'super',
        ambiguo: false,
        source: 'mcc-general',
      },
    ]),
    crear: vi.fn(async (input) => ({
      codMcc: input.codMcc,
      descripcion: input.descripcion,
      categoriaSlug: input.categoriaSlug ?? null,
      ambiguo: input.ambiguo ?? false,
      source: 'extras',
    })),
    actualizar: vi.fn(async (cod) => ({
      codMcc: cod,
      descripcion: 'X',
      categoriaSlug: 'super',
      ambiguo: false,
      source: 'extras',
    })),
    eliminar: vi.fn(async () => true),
    ...overrides,
  };
}

describe('mcc route', () => {
  it('GET /mcc lista', async () => {
    const app = Fastify();
    await app.register(mccRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/mcc' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items[0].codMcc).toBe('5411');
  });

  it('GET /mcc?sin_categoria=true', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(mccRoute(w));
    await app.inject({ method: 'GET', url: '/mcc?sin_categoria=true' });
    expect(w.listar).toHaveBeenCalledWith({ sinCategoria: true });
  });

  it('POST /mcc valida cod_mcc', async () => {
    const app = Fastify();
    await app.register(mccRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/mcc',
      payload: { cod_mcc: 'abc', descripcion: 'X' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST /mcc crea', async () => {
    const app = Fastify();
    await app.register(mccRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/mcc',
      payload: { cod_mcc: '0742', descripcion: 'VETERINARIA', categoria_slug: 'mascotas' },
    });
    expect(r.statusCode).toBe(201);
  });

  it('PATCH actualiza', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(mccRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/mcc/5411',
      payload: { categoria_slug: 'super' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('DELETE 409 si tiene refs', async () => {
    const w = fakeWriter({
      eliminar: vi.fn(async () => ({ tieneRefs: true as const, comercios: 5 })),
    });
    const app = Fastify();
    await app.register(mccRoute(w));
    const r = await app.inject({ method: 'DELETE', url: '/mcc/5411' });
    expect(r.statusCode).toBe(409);
    expect(r.json().usage.comercios).toBe(5);
  });
});
