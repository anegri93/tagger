import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { groundTruthAgreementRoute } from './ground-truth-agreement.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

function mockDb(rows: Array<Record<string, unknown>>) {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Parameters<typeof groundTruthAgreementRoute>[0];
}

async function build(rows: Array<Record<string, unknown>>) {
  const app = Fastify();
  await app.register(groundTruthAgreementRoute(mockDb(rows)));
  await app.ready();
  return app;
}

describe('GET /test-batch/:id/agreement', () => {
  it('400 cuando batch_id vacío', async () => {
    const app = await build([]);
    const r = await app.inject({ method: 'GET', url: '/test-batch/%20/agreement' });
    expect(r.statusCode).toBe(400);
  });

  it('calcula agreement ignorando categorías "Por defecto" y "Sin Categoría"', async () => {
    const rows = [
      {
        nombre: 'A',
        cantidad: 10,
        categoria_xlsx: 'Restaurante',
        fuente_categoria: 'regex',
        categoria_predicha_nombre: 'Restaurante',
        categoria_predicha_slug: 'restaurante',
        confianza: '0.95',
        latency_ms: 1,
        requiere_revision: false,
      },
      {
        nombre: 'B',
        cantidad: 5,
        categoria_xlsx: 'Por defecto',
        fuente_categoria: 'regex',
        categoria_predicha_nombre: 'Supermercado',
        categoria_predicha_slug: 'supermercado',
        confianza: '0.95',
        latency_ms: 1,
        requiere_revision: false,
      },
      {
        nombre: 'C',
        cantidad: 100,
        categoria_xlsx: 'Combustible',
        fuente_categoria: 'mcc',
        categoria_predicha_nombre: 'Supermercado',
        categoria_predicha_slug: 'supermercado',
        confianza: '0.75',
        latency_ms: 20,
        requiere_revision: false,
      },
    ];
    const app = await build(rows);
    const r = await app.inject({ method: 'GET', url: '/test-batch/x/agreement' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.total_ground_truth).toBe(3);
    expect(body.testeados).toBe(3);
    expect(body.con_ground_truth_util).toBe(2);
    expect(body.agreement.crudo).toBe(1);
    expect(body.agreement.ponderado_cantidad).toBe(10);
    expect(body.agreement.ponderado_cantidad_pct).toBe(Number(((10 / 110) * 100).toFixed(2)));
  });

  it('cuenta sin_prediccion separado de evaluables', async () => {
    const rows = [
      {
        nombre: 'A',
        cantidad: 10,
        categoria_xlsx: 'Restaurante',
        fuente_categoria: null,
        categoria_predicha_nombre: null,
        categoria_predicha_slug: null,
        confianza: null,
        latency_ms: null,
        requiere_revision: true,
      },
    ];
    const app = await build(rows);
    const r = await app.inject({ method: 'GET', url: '/test-batch/x/agreement' });
    const body = r.json();
    expect(body.testeados).toBe(0);
    expect(body.total_ground_truth).toBe(1);
  });
});

describe('GET /test-batch/:id/agreement-mcc', () => {
  it('filtra MCCs ambiguos y genéricos por default', async () => {
    const rows = [
      {
        nombre: 'A',
        cantidad: 10,
        mcc: '5411',
        mcc_categoria_id: 'cat-super',
        mcc_categoria_nombre: 'Supermercado',
        mcc_descripcion: 'SUPER',
        mcc_ambiguo: false,
        fuente_categoria: 'regex',
        categoria_predicha_id: 'cat-super',
        categoria_predicha_nombre: 'Supermercado',
        confianza: '0.95',
        latency_ms: 1,
      },
      {
        nombre: 'B',
        cantidad: 100,
        mcc: '5812',
        mcc_categoria_id: 'cat-rest',
        mcc_categoria_nombre: 'Restaurante',
        mcc_descripcion: 'REST',
        mcc_ambiguo: true,
        fuente_categoria: 'regex',
        categoria_predicha_id: 'cat-azar',
        categoria_predicha_nombre: 'Azar',
        confianza: '0.95',
        latency_ms: 1,
      },
      {
        nombre: 'C',
        cantidad: 50,
        mcc: '5399',
        mcc_categoria_id: 'cat-otros',
        mcc_categoria_nombre: 'Otros',
        mcc_descripcion: 'MERCANCIAS',
        mcc_ambiguo: false,
        fuente_categoria: 'mcc',
        categoria_predicha_id: 'cat-otros',
        categoria_predicha_nombre: 'Otros',
        confianza: '0.75',
        latency_ms: 20,
      },
    ];
    const app = await build(rows);
    const r = await app.inject({ method: 'GET', url: '/test-batch/x/agreement-mcc' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.contadores.evaluables).toBe(1);
    expect(body.contadores.mcc_ambiguo).toBe(1);
    expect(body.contadores.mcc_generico).toBe(1);
    expect(body.agreement.crudo).toBe(1);
    expect(body.agreement.crudo_pct).toBe(100);
  });

  it('include_ambiguo=true cuenta también MCCs ambiguos', async () => {
    const rows = [
      {
        nombre: 'A',
        cantidad: 10,
        mcc: '5812',
        mcc_categoria_id: 'cat-rest',
        mcc_categoria_nombre: 'Restaurante',
        mcc_descripcion: 'REST',
        mcc_ambiguo: true,
        fuente_categoria: 'regex',
        categoria_predicha_id: 'cat-azar',
        categoria_predicha_nombre: 'Azar',
        confianza: '0.95',
        latency_ms: 1,
      },
    ];
    const app = await build(rows);
    const r = await app.inject({
      method: 'GET',
      url: '/test-batch/x/agreement-mcc?include_ambiguo=true',
    });
    const body = r.json();
    expect(body.contadores.evaluables).toBe(1);
    expect(body.agreement.crudo).toBe(0);
  });
});
