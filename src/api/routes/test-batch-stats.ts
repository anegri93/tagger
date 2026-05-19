import type { FastifyPluginAsync } from 'fastify';

export interface TestBatchStatsReader {
  stats(batchId: string): Promise<TestBatchStats>;
}

export interface TestBatchStats {
  batch_id: string;
  modo: 'cascada_pura' | 'con_catalogo' | 'mixto' | 'sin_datos';
  total: number;
  primer_movimiento_at: string | null;
  ultimo_movimiento_at: string | null;
  elapsed_ms: number;
  throughput_rps_total: number;
  fuente: Array<{ fuente: string; count: number; pct: number }>;
  cobertura: {
    sync_ok: number;
    revision: number;
    sin_categoria: number;
    sync_ok_pct: number;
  };
  latencia: {
    min: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
    avg: number | null;
  };
  latencia_histograma: Array<{ bucket: string; count: number }>;
  confianza_buckets: Array<{ bucket: string; count: number }>;
  top_categorias: Array<{ slug: string; nombre: string; count: number }>;
  agreement: {
    match: number;
    mismatch: number;
    sin_catalogo: number;
    sin_prediccion: number;
    pct: number;
  };
  recientes: Array<{
    id: string;
    nombre_bancard: string | null;
    fuente: string | null;
    confianza: number | null;
    categoria_slug: string | null;
    requiere_revision: boolean;
    latency_ms: number | null;
    created_at: string;
  }>;
  mismatches_recientes: Array<{
    nombre_bancard: string | null;
    runtime_fuente: string | null;
    runtime_categoria: string | null;
    catalogo_categoria: string | null;
  }>;
}

export const testBatchStatsRoute =
  (reader: TestBatchStatsReader): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { batch_id: string } }>('/test-batch/:batch_id/stats', async (req, reply) => {
      const batchId = req.params.batch_id?.trim();
      if (!batchId) {
        return reply.code(400).send({ error: 'batch_id requerido' });
      }
      const stats = await reader.stats(batchId);
      return reply.send(stats);
    });
  };
