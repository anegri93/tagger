import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { descripcionesRoute } from './descripciones.js';
import type { DescripcionUsoRepo, SugerenciaDescripcion } from '../../db/repos/descripcion-uso.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

const SAMPLE: SugerenciaDescripcion[] = [
  { descripcion: 'alquiler', freq: 8, categoriaSlug: 'hogar' },
  { descripcion: 'alquiler departamento', freq: 5, categoriaSlug: 'hogar' },
];

function makeRepo(rows: SugerenciaDescripcion[] = SAMPLE): DescripcionUsoRepo {
  return {
    upsert: vi.fn(async () => undefined),
    sugerir: vi.fn(async () => rows),
  };
}

describe('GET /descripciones/sugerencias', () => {
  it('400 si falta usuario', async () => {
    const app = Fastify();
    await app.register(descripcionesRoute(makeRepo()));
    const r = await app.inject({ method: 'GET', url: '/descripciones/sugerencias?q=alq' });
    expect(r.statusCode).toBe(400);
  });

  it('400 si q < 2 chars', async () => {
    const app = Fastify();
    await app.register(descripcionesRoute(makeRepo()));
    const r = await app.inject({
      method: 'GET',
      url: '/descripciones/sugerencias?usuario=u1&q=a',
    });
    expect(r.statusCode).toBe(400);
  });

  it('400 si limit fuera de rango', async () => {
    const app = Fastify();
    await app.register(descripcionesRoute(makeRepo()));
    const r = await app.inject({
      method: 'GET',
      url: '/descripciones/sugerencias?usuario=u1&q=alq&limit=99',
    });
    expect(r.statusCode).toBe(400);
  });

  it('devuelve items con default limit=10', async () => {
    const repo = makeRepo();
    const app = Fastify();
    await app.register(descripcionesRoute(repo));
    const r = await app.inject({
      method: 'GET',
      url: '/descripciones/sugerencias?usuario=user_123&q=alq',
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.usuario).toBe('user_123');
    expect(body.q).toBe('alq');
    expect(body.limit).toBe(10);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toEqual({ descripcion: 'alquiler', freq: 8, categoria_slug: 'hogar' });
    expect(repo.sugerir).toHaveBeenCalledWith({
      usuarioId: 'user_123',
      q: 'alq',
      limit: 10,
      categoriaId: null,
    });
  });

  it('pasa categoria_id al repo cuando viene en query', async () => {
    const repo = makeRepo([]);
    const app = Fastify();
    await app.register(descripcionesRoute(repo));
    const catId = '550e8400-e29b-41d4-a716-446655440000';
    const r = await app.inject({
      method: 'GET',
      url: `/descripciones/sugerencias?usuario=u1&q=alq&categoria_id=${catId}`,
    });
    expect(r.statusCode).toBe(200);
    expect(repo.sugerir).toHaveBeenCalledWith(
      expect.objectContaining({ categoriaId: catId }),
    );
  });

  it('omite categoria_slug si la fila no tiene cat', async () => {
    const repo = makeRepo([{ descripcion: 'pago varios', freq: 1 }]);
    const app = Fastify();
    await app.register(descripcionesRoute(repo));
    const r = await app.inject({
      method: 'GET',
      url: '/descripciones/sugerencias?usuario=u1&q=pa',
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.items[0]).toEqual({ descripcion: 'pago varios', freq: 1 });
    expect(body.items[0].categoria_slug).toBeUndefined();
  });

  it('respeta limit cuando viene en query', async () => {
    const repo = makeRepo();
    const app = Fastify();
    await app.register(descripcionesRoute(repo));
    const r = await app.inject({
      method: 'GET',
      url: '/descripciones/sugerencias?usuario=u1&q=alq&limit=3',
    });
    expect(r.statusCode).toBe(200);
    expect(repo.sugerir).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
  });
});
