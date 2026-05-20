import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import {
  categoriasSimilaresRoute,
  movimientoCategoriasSugeridasRoute,
} from './categorias-similares.js';
import type {
  CategoriasSimilaresReader,
  CategoriaSimilar,
} from '../../db/repos/categorias.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

// Stub mínimo de `resolverIdentificador`: el módulo lo importa de
// db/repos/categorias. Mockeamos ese módulo entero para no tocar DB.
const TARGET = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slug: 'super', nombre: 'Super' };
vi.mock('../../db/repos/categorias.js', async (orig) => {
  const real = await orig<typeof import('../../db/repos/categorias.js')>();
  return {
    ...real,
    resolverIdentificador: vi.fn(async (_db: unknown, ident: string) =>
      ident === 'no-existe' ? null : TARGET,
    ),
  };
});

const SAMPLE: CategoriaSimilar[] = [
  {
    id: 'b'.repeat(8) + '-' + 'b'.repeat(4) + '-' + 'b'.repeat(4) + '-' + 'b'.repeat(4) + '-' + 'b'.repeat(12),
    slug: 'mercado',
    nombre: 'Mercado',
    descripcion: null,
    similitud: 0.8,
  },
];

function makeReader(): CategoriasSimilaresReader {
  return { buscar: vi.fn(async () => SAMPLE) };
}

describe('GET /categorias/:identificador/similares', () => {
  it('404 cuando identificador no existe', async () => {
    const app = Fastify();
    await app.register(categoriasSimilaresRoute({} as never, makeReader()));
    const r = await app.inject({ method: 'GET', url: '/categorias/no-existe/similares' });
    expect(r.statusCode).toBe(404);
  });

  it('devuelve top-N con default limit=5', async () => {
    const reader = makeReader();
    const app = Fastify();
    await app.register(categoriasSimilaresRoute({} as never, reader));
    const r = await app.inject({ method: 'GET', url: '/categorias/super/similares' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.limit).toBe(5);
    expect(body.offset).toBe(0);
    expect(body.categoria_origen.slug).toBe('super');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].slug).toBe('mercado');
    expect(reader.buscar).toHaveBeenCalledWith(
      expect.objectContaining({ excluirId: TARGET.id, limit: 5, offset: 0 }),
    );
  });

  it('respeta limit/offset/q', async () => {
    const reader = makeReader();
    const app = Fastify();
    await app.register(categoriasSimilaresRoute({} as never, reader));
    const r = await app.inject({
      method: 'GET',
      url: '/categorias/super/similares?limit=10&offset=5&q=alim',
    });
    expect(r.statusCode).toBe(200);
    expect(reader.buscar).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 5, q: 'alim' }),
    );
  });

  it('400 si limit fuera de rango', async () => {
    const app = Fastify();
    await app.register(categoriasSimilaresRoute({} as never, makeReader()));
    const r = await app.inject({ method: 'GET', url: '/categorias/super/similares?limit=999' });
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /movimientos/:id/categorias-sugeridas', () => {
  const VALID_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  it('400 si id inválido', async () => {
    const app = Fastify();
    await app.register(
      movimientoCategoriasSugeridasRoute(
        { porId: vi.fn() },
        makeReader(),
      ),
    );
    const r = await app.inject({ method: 'GET', url: '/movimientos/xx/categorias-sugeridas' });
    expect(r.statusCode).toBe(400);
  });

  it('404 si movimiento no existe', async () => {
    const app = Fastify();
    await app.register(
      movimientoCategoriasSugeridasRoute(
        { porId: vi.fn(async () => null) },
        makeReader(),
      ),
    );
    const r = await app.inject({
      method: 'GET',
      url: `/movimientos/${VALID_ID}/categorias-sugeridas`,
    });
    expect(r.statusCode).toBe(404);
  });

  it('devuelve items basados en categoría confirmada > predicha', async () => {
    const reader = makeReader();
    const app = Fastify();
    await app.register(
      movimientoCategoriasSugeridasRoute(
        {
          porId: vi.fn(async () => ({
            categoriaPredichaId: 'p',
            categoriaConfirmadaId: TARGET.id,
          })),
        },
        reader,
      ),
    );
    const r = await app.inject({
      method: 'GET',
      url: `/movimientos/${VALID_ID}/categorias-sugeridas?limit=3`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.categoria_origen_id).toBe(TARGET.id);
    expect(body.items).toHaveLength(1);
    expect(reader.buscar).toHaveBeenCalledWith(
      expect.objectContaining({ excluirId: TARGET.id, limit: 3 }),
    );
  });

  it('items vacíos cuando no hay origen ni q', async () => {
    const reader = makeReader();
    const app = Fastify();
    await app.register(
      movimientoCategoriasSugeridasRoute(
        {
          porId: vi.fn(async () => ({
            categoriaPredichaId: null,
            categoriaConfirmadaId: null,
          })),
        },
        reader,
      ),
    );
    const r = await app.inject({
      method: 'GET',
      url: `/movimientos/${VALID_ID}/categorias-sugeridas`,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toEqual([]);
    expect(reader.buscar).not.toHaveBeenCalled();
  });
});
