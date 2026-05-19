import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { categorizarRoute } from './categorizar.js';
import type { CapasSincrono } from '../../pipeline/categorizar.js';
import type { ResultadoCapa } from '../../domain/types.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

const HIT: ResultadoCapa = {
  categoriaId: '00000000-0000-0000-0000-000000000001',
  confianza: 0.95,
  fuente: 'regex',
  evidencia: { regla_id: 'r1', patron: 'X' },
};

function stubCapas(hit: ResultadoCapa | null): CapasSincrono {
  return {
    reglas: { evaluar: vi.fn().mockResolvedValue(hit) },
    mcc: { evaluar: vi.fn().mockResolvedValue(null) },
  };
}

async function build(opts: { hit?: ResultadoCapa | null } = {}) {
  const app = Fastify();
  const repo = {
    insertar: vi.fn(async () => ({ id: '00000000-0000-0000-0000-0000000000aa' })),
  };
  const iaFallback = { schedule: vi.fn() };
  const categorias = {
    porId: vi.fn(async (id: string | null | undefined) =>
      id ? { id, slug: 'super', nombre: 'Supermercado' } : null,
    ),
  };
  await app.register(
    categorizarRoute({
      capas: stubCapas(opts.hit ?? null),
      repo,
      iaFallback,
      categorias,
    }),
  );
  await app.ready();
  return { app, repo, iaFallback };
}

describe('POST /categorizar-movimiento', () => {
  it('200 con resultado reglas hit', async () => {
    const { app } = await build({ hit: HIT });
    const r = await app.inject({
      method: 'POST',
      url: '/categorizar-movimiento',
      payload: { descripcion: 'BIGGIE' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      categoria_id: HIT.categoriaId,
      categoria: { id: HIT.categoriaId, slug: 'super', nombre: 'Supermercado' },
      fuente: 'regex',
      confianza: 0.95,
      requiere_revision: false,
    });
  });

  it('400 si input inválido (vacío)', async () => {
    const { app } = await build();
    const r = await app.inject({
      method: 'POST',
      url: '/categorizar-movimiento',
      payload: { monto: 10 },
    });
    expect(r.statusCode).toBe(400);
  });

  it('dispara iaFallback cuando ninguna capa síncrona acierta', async () => {
    const { app, iaFallback } = await build({ hit: null });
    const r = await app.inject({
      method: 'POST',
      url: '/categorizar-movimiento',
      payload: { descripcion: 'desconocido' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().requiere_revision).toBe(true);
    expect(iaFallback.schedule).toHaveBeenCalled();
  });
});
