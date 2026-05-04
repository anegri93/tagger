import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { testBatchStatsRoute, type TestBatchStats } from './test-batch-stats.js';

function emptyStats(batchId: string): TestBatchStats {
  return {
    batch_id: batchId,
    modo: 'sin_datos',
    total: 0,
    primer_movimiento_at: null,
    ultimo_movimiento_at: null,
    elapsed_ms: 0,
    throughput_rps_total: 0,
    fuente: [],
    cobertura: { sync_ok: 0, revision: 0, sin_categoria: 0, sync_ok_pct: 0 },
    latencia: { min: null, p50: null, p95: null, p99: null, max: null, avg: null },
    latencia_histograma: [],
    confianza_buckets: [],
    top_categorias: [],
    agreement: { match: 0, mismatch: 0, sin_catalogo: 0, sin_prediccion: 0, pct: 0 },
    recientes: [],
    mismatches_recientes: [],
  };
}

describe('test-batch-stats route', () => {
  it('GET /test-batch/:id/stats devuelve stats', async () => {
    const reader = { stats: vi.fn(async (b: string) => emptyStats(b)) };
    const app = Fastify();
    await app.register(testBatchStatsRoute(reader));
    const r = await app.inject({ method: 'GET', url: '/test-batch/foo-123/stats' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.batch_id).toBe('foo-123');
    expect(body.total).toBe(0);
    expect(reader.stats).toHaveBeenCalledWith('foo-123');
  });

  it('rechaza batch_id vacío', async () => {
    const reader = { stats: vi.fn() };
    const app = Fastify();
    await app.register(testBatchStatsRoute(reader));
    const r = await app.inject({ method: 'GET', url: '/test-batch/%20/stats' });
    expect(r.statusCode).toBe(400);
  });
});
