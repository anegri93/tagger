import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { comerciosRoute } from './comercios.js';
import type { ComerciosWriter, ComercioPublico } from '../../db/repos/comercios-writer.js';

function fixt(): ComercioPublico[] {
  return [
    {
      id: 'c1',
      nombre: 'BIGGIE-CENTRO',
      bancardId: 'BIGGIE-CENTRO',
      codigoComercio: '111',
      mcc: '5411',
      fuenteCategoria: 'mcc',
      confianza: '0.75',
      requiereRevision: false,
      marca: 'BIGGIE',
      mccInferido: false,
      categoriaSlug: 'supermercado',
    },
  ];
}

function fakeWriter(overrides: Partial<ComerciosWriter> = {}): ComerciosWriter {
  return {
    listar: vi.fn(async () => ({ items: fixt(), total: 1 })),
    actualizar: vi.fn(async (id) => ({ ...fixt()[0]!, id })),
    ...overrides,
  };
}

describe('comercios route', () => {
  it('GET /comercios?categoria=X', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(comerciosRoute(w));
    const r = await app.inject({ method: 'GET', url: '/comercios?categoria=supermercado' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toHaveLength(1);
    expect(w.listar).toHaveBeenCalledWith(
      expect.objectContaining({ categoriaSlug: 'supermercado' }),
    );
  });

  it('GET /comercios?q=BIGGIE&limit=10', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(comerciosRoute(w));
    const r = await app.inject({ method: 'GET', url: '/comercios?q=BIGGIE&limit=10' });
    expect(r.statusCode).toBe(200);
    expect(w.listar).toHaveBeenCalledWith(expect.objectContaining({ q: 'BIGGIE', limit: 10 }));
  });

  it('GET rechaza limit fuera de rango', async () => {
    const app = Fastify();
    await app.register(comerciosRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/comercios?limit=9999' });
    expect(r.statusCode).toBe(400);
  });

  it('PATCH cambia categoría', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(comerciosRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/comercios/c1',
      payload: { categoria_slug: 'farmacia' },
    });
    expect(r.statusCode).toBe(200);
    expect(w.actualizar).toHaveBeenCalledWith('c1', { categoriaSlug: 'farmacia' });
  });

  it('PATCH 404 si no existe', async () => {
    const w = fakeWriter({ actualizar: vi.fn(async () => null) });
    const app = Fastify();
    await app.register(comerciosRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/comercios/x',
      payload: { categoria_slug: 'farmacia' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('PATCH 400 si categoria_slug inexistente', async () => {
    const w = fakeWriter({
      actualizar: vi.fn(async () => {
        throw new Error('categoria_inexistente');
      }),
    });
    const app = Fastify();
    await app.register(comerciosRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/comercios/x',
      payload: { categoria_slug: 'no-existe' },
    });
    expect(r.statusCode).toBe(400);
  });
});
