import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { correccionRoute } from './correccion.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

const MOV = '123e4567-e89b-12d3-a456-426614174000';
const CAT = '550e8400-e29b-41d4-a716-446655440000';

async function build(svc: { aplicar: ReturnType<typeof vi.fn> }) {
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
  await app.register(correccionRoute(svc, cats));
  await app.ready();
  return app;
}

describe('POST /movimientos/:id/correccion', () => {
  it('200 con resultado ok', async () => {
    const svc = {
      aplicar: vi.fn().mockResolvedValue({
        ok: true,
        correccionId: 'c-1',
        categoriaAnteriorId: 'old-cat',
      }),
    };
    const app = await build(svc);
    const r = await app.inject({
      method: 'POST',
      url: `/movimientos/${MOV}/correccion`,
      payload: { categoria_id_nueva: CAT, motivo: 'fix' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ correccion_id: 'c-1', categoria_nueva_id: CAT });
    expect(svc.aplicar).toHaveBeenCalledWith({
      movimientoId: MOV,
      categoriaIdNueva: CAT,
      motivo: 'fix',
      usuario: undefined,
      aprender: undefined,
      subcategoriaUsuarioId: null,
    });
  });

  it('propaga aprender=false al service (excepción puntual)', async () => {
    const svc = {
      aplicar: vi
        .fn()
        .mockResolvedValue({ ok: true, correccionId: 'c-2', categoriaAnteriorId: null }),
    };
    const app = await build(svc);
    const r = await app.inject({
      method: 'POST',
      url: `/movimientos/${MOV}/correccion`,
      payload: { categoria_id_nueva: CAT, aprender: false },
    });
    expect(r.statusCode).toBe(200);
    expect(svc.aplicar).toHaveBeenCalledWith(
      expect.objectContaining({ aprender: false }),
    );
  });

  it('404 si movimiento no existe', async () => {
    const app = await build({
      aplicar: vi.fn().mockResolvedValue({ ok: false, error: 'movimiento_no_encontrado' }),
    });
    const r = await app.inject({
      method: 'POST',
      url: `/movimientos/${MOV}/correccion`,
      payload: { categoria_id_nueva: CAT },
    });
    expect(r.statusCode).toBe(404);
  });

  it('400 si body inválido', async () => {
    const app = await build({ aplicar: vi.fn() });
    const r = await app.inject({
      method: 'POST',
      url: `/movimientos/${MOV}/correccion`,
      payload: { categoria_id_nueva: 'no-uuid' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('400 si categoria inválida según servicio', async () => {
    const app = await build({
      aplicar: vi.fn().mockResolvedValue({ ok: false, error: 'categoria_invalida' }),
    });
    const r = await app.inject({
      method: 'POST',
      url: `/movimientos/${MOV}/correccion`,
      payload: { categoria_id_nueva: CAT },
    });
    expect(r.statusCode).toBe(400);
  });
});
