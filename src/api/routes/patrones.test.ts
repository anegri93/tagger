import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { patronesRoute } from './patrones.js';
import type { PatronWriter, PatronPublico } from '../../db/repos/patrones.js';

const SAMPLE: PatronPublico = {
  id: 'p1',
  tipo: 'contiene',
  valor: 'CIAL',
  categoriaId: 'cat-super',
  categoriaSlug: 'supermercado',
  prioridad: 20,
  activo: true,
  fuente: 'manual',
  descripcion: null,
};

function fakeWriter(overrides: Partial<PatronWriter> = {}): PatronWriter {
  return {
    listar: vi.fn(async () => [SAMPLE]),
    obtener: vi.fn(async (id) => (id === SAMPLE.id ? SAMPLE : null)),
    crear: vi.fn(async (input) => ({
      ...SAMPLE,
      id: 'new',
      tipo: input.tipo,
      valor: input.valor,
      categoriaSlug: input.categoriaSlug,
      prioridad: input.prioridad ?? 100,
      descripcion: input.descripcion ?? null,
    })),
    actualizar: vi.fn(async (id, input) => ({
      ...SAMPLE,
      id,
      valor: input.valor ?? SAMPLE.valor,
      activo: input.activo ?? SAMPLE.activo,
    })),
    eliminar: vi.fn(async () => true),
    ...overrides,
  };
}

describe('patrones route', () => {
  it('GET /patrones lista', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/patrones' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toHaveLength(1);
  });

  it('GET /patrones aplica filtros', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(patronesRoute(w));
    await app.inject({
      method: 'GET',
      url: '/patrones?categoria=super&tipo=regex&activo=false',
    });
    expect(w.listar).toHaveBeenCalledWith({
      categoriaSlug: 'super',
      tipo: 'regex',
      activo: false,
    });
  });

  it('GET /patrones/:id existe', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/patrones/p1' });
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBe('p1');
  });

  it('GET /patrones/:id 404', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/patrones/zzz' });
    expect(r.statusCode).toBe(404);
  });

  it('POST /patrones crea', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones',
      payload: { tipo: 'contiene', valor: 'CIAL', categoria_slug: 'super', prioridad: 20 },
    });
    expect(r.statusCode).toBe(201);
    expect(w.crear).toHaveBeenCalled();
  });

  it('POST 400 invalid_input (valor vacío)', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones',
      payload: { tipo: 'contiene', valor: '', categoria_slug: 'super' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST 422 patron_invalido (regex inválida)', async () => {
    const w = fakeWriter({
      crear: vi.fn(async () => {
        throw new Error('patron_invalido');
      }),
    });
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones',
      payload: { tipo: 'regex', valor: '[invalid', categoria_slug: 'super' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe('patron_invalido');
  });

  it('POST 400 categoria_inexistente', async () => {
    const w = fakeWriter({
      crear: vi.fn(async () => {
        throw new Error('categoria_inexistente');
      }),
    });
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones',
      payload: { tipo: 'contiene', valor: 'X', categoria_slug: 'no' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST 409 patron_duplicado (UNIQUE)', async () => {
    const w = fakeWriter({
      crear: vi.fn(async () => {
        throw new Error('duplicate key value violates unique constraint');
      }),
    });
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones',
      payload: { tipo: 'contiene', valor: 'X', categoria_slug: 'super' },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('patron_duplicado');
  });

  it('PATCH actualiza', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/patrones/p1',
      payload: { activo: false },
    });
    expect(r.statusCode).toBe(200);
  });

  it('PATCH 404 si no existe', async () => {
    const w = fakeWriter({ actualizar: vi.fn(async () => null) });
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({
      method: 'PATCH',
      url: '/patrones/zzz',
      payload: { activo: false },
    });
    expect(r.statusCode).toBe(404);
  });

  it('DELETE ok', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({ method: 'DELETE', url: '/patrones/p1' });
    expect(r.statusCode).toBe(200);
  });

  it('DELETE 404', async () => {
    const w = fakeWriter({ eliminar: vi.fn(async () => false) });
    const app = Fastify();
    await app.register(patronesRoute(w));
    const r = await app.inject({ method: 'DELETE', url: '/patrones/zzz' });
    expect(r.statusCode).toBe(404);
  });

  it('POST /patrones/test contiene match', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/test',
      payload: { tipo: 'contiene', valor: 'CIAL', texto: 'CIAL.VIRGEN DEL ROSA' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().match).toBe(true);
  });

  it('POST /patrones/test regex inválida 422', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/test',
      payload: { tipo: 'regex', valor: '[invalid', texto: 'X' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('POST /patrones/test literal exacto post-normalize', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/test',
      payload: { tipo: 'literal', valor: 'BIGGIE', texto: 'biggie' },
    });
    expect(r.json().match).toBe(true);
  });

  it('POST /patrones/test prefijo', async () => {
    const app = Fastify();
    await app.register(patronesRoute(fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/test',
      payload: { tipo: 'prefijo', valor: 'SUPER', texto: 'Super Seis Centro' },
    });
    expect(r.json().match).toBe(true);
  });
});
