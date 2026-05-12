import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { analisisProfundoRoute } from './analisis-profundo.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

function mockDb(responses: Array<{ rows: Array<Record<string, unknown>> }>) {
  let i = 0;
  return {
    execute: vi.fn().mockImplementation(() => Promise.resolve(responses[i++] ?? { rows: [] })),
  } as unknown as Parameters<typeof analisisProfundoRoute>[0];
}

async function build(responses: Array<{ rows: Array<Record<string, unknown>> }>) {
  const app = Fastify();
  await app.register(analisisProfundoRoute(mockDb(responses)));
  await app.ready();
  return app;
}

describe('GET /test-batch/:id/analisis', () => {
  it('400 cuando batch_id vacío', async () => {
    const app = await build([]);
    const r = await app.inject({ method: 'GET', url: '/test-batch/%20/analisis' });
    expect(r.statusCode).toBe(400);
  });

  it('agrega métricas de las 7 queries en respuesta', async () => {
    const app = await build([
      { rows: [{ total: 100, con_fuente: 90, sin_fuente: 10, requieren_revision: 15 }] },
      {
        rows: [
          {
            fuente: 'regex',
            movimientos: 60,
            volumen: '6000',
            confianza_avg: '0.95',
            latency_avg_ms: '0.0',
            requieren_revision: 0,
          },
        ],
      },
      {
        rows: [{ slug: 'supermercado', nombre: 'Supermercado', movimientos: 50, volumen: '5000' }],
      },
      {
        rows: [
          {
            patron_id: 'p1',
            patron_valor: 'BIGGIE',
            tipo: 'regex',
            categoria: 'Supermercado',
            hits: 30,
            volumen: '3000',
          },
        ],
      },
      { rows: [{ nombre: 'X', cantidad: 10, mcc: '5399', mcc_desc: 'OTROS' }] },
      { rows: [{ fuente: 'regex', bucket: '0.95-1.00', n: 60 }] },
      {
        rows: [
          {
            decil: 1,
            comercios: 10,
            volumen_decil: '5000',
            cubiertos: 10,
            cobertura_pct: '100.0',
          },
        ],
      },
      { rows: [{ fuente: 'regex', min: 0, p50: 0, p95: 1, p99: 2, max: 22 }] },
    ]);

    const r = await app.inject({ method: 'GET', url: '/test-batch/abc/analisis' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.batch_id).toBe('abc');
    expect(body.totales.total).toBe(100);
    expect(body.por_fuente).toHaveLength(1);
    expect(body.top_categorias).toHaveLength(1);
    expect(body.patrones_mas_usados).toHaveLength(1);
    expect(body.sin_prediccion_top_volumen).toHaveLength(1);
    expect(body.confianza_buckets).toHaveLength(1);
    expect(body.cobertura_por_decil_volumen).toHaveLength(1);
    expect(body.latencia_por_fuente).toHaveLength(1);
  });

  it('usa ground_truth query param', async () => {
    const app = await build([
      { rows: [{ total: 0, con_fuente: 0, sin_fuente: 0, requieren_revision: 0 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);
    const r = await app.inject({
      method: 'GET',
      url: '/test-batch/x/analisis?ground_truth=otro-batch',
    });
    const body = r.json();
    expect(body.ground_truth_batch).toBe('otro-batch');
  });
});
