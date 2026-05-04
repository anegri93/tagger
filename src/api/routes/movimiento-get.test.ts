import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { movimientoGetRoute, type MovimientoGetData } from './movimiento-get.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

const ID = '123e4567-e89b-12d3-a456-426614174000';
const ROW: MovimientoGetData = {
  id: ID,
  descripcion: 'BIGGIE',
  nombreComercio: null,
  nombreBancard: null,
  mcc: null,
  monto: '50.00',
  categoriaPredichaId: '550e8400-e29b-41d4-a716-446655440000',
  categoriaConfirmadaId: null,
  fuenteCategoria: 'regex',
  confianza: '0.95',
  requiereRevision: false,
  evidencia: { regla_id: 'r1' },
  createdAt: '2026-05-04T00:00:00Z',
  updatedAt: '2026-05-04T00:00:00Z',
};

async function build(reader: { porId: ReturnType<typeof vi.fn> }) {
  const app = Fastify();
  const cats = {
    porIds: vi.fn(async (ids: ReadonlyArray<string | null | undefined>) => {
      const map = new Map<string, { id: string; slug: string; nombre: string }>();
      for (const id of ids) {
        if (id) map.set(id, { id, slug: 'cat-' + id.slice(0, 4), nombre: 'Cat ' + id.slice(0, 4) });
      }
      return map;
    }),
  };
  await app.register(movimientoGetRoute(reader, cats));
  await app.ready();
  return app;
}

describe('GET /movimientos/:id', () => {
  it('200 con movimiento + evidencia', async () => {
    const app = await build({ porId: vi.fn().mockResolvedValue(ROW) });
    const r = await app.inject({ method: 'GET', url: `/movimientos/${ID}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      id: ID,
      fuente_categoria: 'regex',
      evidencia: { regla_id: 'r1' },
    });
  });

  it('404 si no existe', async () => {
    const app = await build({ porId: vi.fn().mockResolvedValue(null) });
    const r = await app.inject({ method: 'GET', url: `/movimientos/${ID}` });
    expect(r.statusCode).toBe(404);
  });

  it('400 si id no es uuid', async () => {
    const app = await build({ porId: vi.fn() });
    const r = await app.inject({ method: 'GET', url: '/movimientos/not-uuid' });
    expect(r.statusCode).toBe(400);
  });
});
