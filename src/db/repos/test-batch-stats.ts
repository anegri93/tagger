import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import type { TestBatchStatsReader, TestBatchStats } from '../../api/routes/test-batch-stats.js';

const CACHE_MS = 1000;

export function crearTestBatchStatsReader(db: Db): TestBatchStatsReader {
  const cache = new Map<string, { at: number; data: TestBatchStats }>();

  return {
    async stats(batchId: string): Promise<TestBatchStats> {
      const hit = cache.get(batchId);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

      const data = await loadStats(db, batchId);
      cache.set(batchId, { at: Date.now(), data });
      return data;
    },
  };
}

async function loadStats(db: Db, batchId: string): Promise<TestBatchStats> {
  const baseRes = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      min(created_at) AS primer,
      max(created_at) AS ultimo,
      EXTRACT(EPOCH FROM (max(created_at) - min(created_at))) * 1000 AS elapsed_ms
    FROM movimientos WHERE batch_id = ${batchId}
  `);
  const base = baseRes.rows[0] as {
    total: number;
    primer: Date | string | null;
    ultimo: Date | string | null;
    elapsed_ms: string | number | null;
  };
  const total = Number(base.total ?? 0);
  const elapsedMs = Number(base.elapsed_ms ?? 0);
  const toIso = (v: Date | string | null): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    return new Date(v).toISOString();
  };

  if (total === 0) {
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

  const fuenteRes = await db.execute(sql`
    SELECT COALESCE(fuente_categoria::text, 'NULL') AS fuente, count(*)::int AS c
    FROM movimientos WHERE batch_id = ${batchId}
    GROUP BY fuente_categoria ORDER BY c DESC
  `);
  const fuente = (fuenteRes.rows as Array<{ fuente: string; c: number }>).map((r) => ({
    fuente: r.fuente,
    count: Number(r.c),
    pct: Number(((100 * Number(r.c)) / total).toFixed(2)),
  }));

  const cobRes = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE categoria_predicha_id IS NOT NULL AND fuente_categoria != 'ia' AND requiere_revision = false)::int AS sync_ok,
      count(*) FILTER (WHERE requiere_revision = true)::int AS revision,
      count(*) FILTER (WHERE categoria_predicha_id IS NULL)::int AS sin_categoria
    FROM movimientos WHERE batch_id = ${batchId}
  `);
  const cob = cobRes.rows[0] as { sync_ok: number; revision: number; sin_categoria: number };
  const cobertura = {
    sync_ok: Number(cob.sync_ok),
    revision: Number(cob.revision),
    sin_categoria: Number(cob.sin_categoria),
    sync_ok_pct: Number(((100 * Number(cob.sync_ok)) / total).toFixed(2)),
  };

  const latRes = await db.execute(sql`
    SELECT
      min(latency_ms)::int AS min,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99,
      max(latency_ms)::int AS max,
      avg(latency_ms)::int AS avg
    FROM movimientos WHERE batch_id = ${batchId} AND latency_ms IS NOT NULL
  `);
  const latencia = (latRes.rows[0] ?? {
    min: null,
    p50: null,
    p95: null,
    p99: null,
    max: null,
    avg: null,
  }) as TestBatchStats['latencia'];

  const histRes = await db.execute(sql`
    SELECT
      sum((latency_ms < 10)::int)::int AS b1,
      sum((latency_ms >= 10 AND latency_ms < 25)::int)::int AS b2,
      sum((latency_ms >= 25 AND latency_ms < 50)::int)::int AS b3,
      sum((latency_ms >= 50 AND latency_ms < 100)::int)::int AS b4,
      sum((latency_ms >= 100 AND latency_ms < 500)::int)::int AS b5,
      sum((latency_ms >= 500)::int)::int AS b6
    FROM movimientos WHERE batch_id = ${batchId} AND latency_ms IS NOT NULL
  `);
  const h = (histRes.rows[0] ?? {}) as Record<string, number>;
  const latencia_histograma = [
    { bucket: '0-10ms', count: Number(h.b1 ?? 0) },
    { bucket: '10-25ms', count: Number(h.b2 ?? 0) },
    { bucket: '25-50ms', count: Number(h.b3 ?? 0) },
    { bucket: '50-100ms', count: Number(h.b4 ?? 0) },
    { bucket: '100-500ms', count: Number(h.b5 ?? 0) },
    { bucket: '500+ms', count: Number(h.b6 ?? 0) },
  ];

  const confRes = await db.execute(sql`
    SELECT
      sum((confianza >= 0.9)::int)::int AS b1,
      sum((confianza >= 0.7 AND confianza < 0.9)::int)::int AS b2,
      sum((confianza >= 0.5 AND confianza < 0.7)::int)::int AS b3,
      sum((confianza < 0.5)::int)::int AS b4,
      sum((confianza IS NULL)::int)::int AS b5
    FROM movimientos WHERE batch_id = ${batchId}
  `);
  const cf = (confRes.rows[0] ?? {}) as Record<string, number>;
  const confianza_buckets = [
    { bucket: '>=0.90', count: Number(cf.b1 ?? 0) },
    { bucket: '0.70-0.89', count: Number(cf.b2 ?? 0) },
    { bucket: '0.50-0.69', count: Number(cf.b3 ?? 0) },
    { bucket: '<0.50', count: Number(cf.b4 ?? 0) },
    { bucket: 'NULL', count: Number(cf.b5 ?? 0) },
  ];

  const topRes = await db.execute(sql`
    SELECT cat.slug, cat.nombre, count(*)::int AS c
    FROM movimientos m
    JOIN categorias cat ON cat.id = m.categoria_predicha_id
    WHERE m.batch_id = ${batchId}
    GROUP BY cat.slug, cat.nombre
    ORDER BY c DESC LIMIT 10
  `);
  const top_categorias = (topRes.rows as Array<{ slug: string; nombre: string; c: number }>).map(
    (r) => ({ slug: r.slug, nombre: r.nombre, count: Number(r.c) }),
  );

  const agrRes = await db.execute(sql`
    WITH joined AS (
      SELECT m.categoria_predicha_id AS pred, c.categoria_id AS cat
      FROM movimientos m
      LEFT JOIN comercios_catalogo c
        ON c.bancard_id = m.bancard_id AND c.codigo_comercio = m.codigo_comercio
      WHERE m.batch_id = ${batchId}
    )
    SELECT
      count(*) FILTER (WHERE pred IS NOT NULL AND cat IS NOT NULL AND pred = cat)::int AS match,
      count(*) FILTER (WHERE pred IS NOT NULL AND cat IS NOT NULL AND pred != cat)::int AS mismatch,
      count(*) FILTER (WHERE cat IS NULL)::int AS sin_catalogo,
      count(*) FILTER (WHERE pred IS NULL)::int AS sin_prediccion
    FROM joined
  `);
  const a = agrRes.rows[0] as {
    match: number;
    mismatch: number;
    sin_catalogo: number;
    sin_prediccion: number;
  };
  const denom = Number(a.match) + Number(a.mismatch);
  const agreement = {
    match: Number(a.match),
    mismatch: Number(a.mismatch),
    sin_catalogo: Number(a.sin_catalogo),
    sin_prediccion: Number(a.sin_prediccion),
    pct: denom > 0 ? Number(((100 * Number(a.match)) / denom).toFixed(2)) : 0,
  };

  const recRes = await db.execute(sql`
    SELECT m.id, m.nombre_bancard, m.fuente_categoria AS fuente, m.confianza,
           cat.slug AS categoria_slug, m.requiere_revision, m.latency_ms, m.created_at
    FROM movimientos m
    LEFT JOIN categorias cat ON cat.id = m.categoria_predicha_id
    WHERE m.batch_id = ${batchId}
    ORDER BY m.created_at DESC LIMIT 30
  `);
  const recientes = (
    recRes.rows as Array<{
      id: string;
      nombre_bancard: string | null;
      fuente: string | null;
      confianza: string | null;
      categoria_slug: string | null;
      requiere_revision: boolean;
      latency_ms: number | null;
      created_at: Date;
    }>
  ).map((r) => ({
    id: r.id,
    nombre_bancard: r.nombre_bancard,
    fuente: r.fuente,
    confianza: r.confianza != null ? Number(r.confianza) : null,
    categoria_slug: r.categoria_slug,
    requiere_revision: r.requiere_revision,
    latency_ms: r.latency_ms,
    created_at: toIso(r.created_at as Date | string | null) ?? '',
  }));

  const misRes = await db.execute(sql`
    SELECT m.nombre_bancard, m.bancard_id, m.codigo_comercio,
           m.fuente_categoria AS rt_fuente, cat_pred.slug AS rt_categoria,
           c.fuente_categoria AS cat_fuente, cat_cat.slug AS cat_categoria
    FROM movimientos m
    JOIN comercios_catalogo c
      ON c.bancard_id = m.bancard_id AND c.codigo_comercio = m.codigo_comercio
    LEFT JOIN categorias cat_pred ON cat_pred.id = m.categoria_predicha_id
    LEFT JOIN categorias cat_cat ON cat_cat.id = c.categoria_id
    WHERE m.batch_id = ${batchId}
      AND m.categoria_predicha_id IS NOT NULL
      AND m.categoria_predicha_id != c.categoria_id
    ORDER BY m.created_at DESC LIMIT 20
  `);
  const mismatches_recientes = (
    misRes.rows as Array<{
      nombre_bancard: string | null;
      bancard_id: string | null;
      codigo_comercio: string | null;
      rt_fuente: string | null;
      rt_categoria: string | null;
      cat_fuente: string | null;
      cat_categoria: string | null;
    }>
  ).map((r) => ({
    nombre_bancard: r.nombre_bancard,
    bancard_id: r.bancard_id,
    codigo_comercio: r.codigo_comercio,
    runtime_fuente: r.rt_fuente,
    runtime_categoria: r.rt_categoria,
    catalogo_fuente: r.cat_fuente,
    catalogo_categoria: r.cat_categoria,
  }));

  const modoRes = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE evidencia->>'bypass_catalogo' = 'true')::int AS bypass,
      count(*) FILTER (WHERE evidencia->>'bypass_catalogo' IS NULL OR evidencia->>'bypass_catalogo' != 'true')::int AS normal
    FROM movimientos WHERE batch_id = ${batchId}
  `);
  const m = modoRes.rows[0] as { bypass: number; normal: number };
  const bypassCount = Number(m.bypass ?? 0);
  const normalCount = Number(m.normal ?? 0);
  let modo: TestBatchStats['modo'];
  if (bypassCount === 0) modo = 'con_catalogo';
  else if (normalCount === 0) modo = 'cascada_pura';
  else modo = 'mixto';

  return {
    batch_id: batchId,
    modo,
    total,
    primer_movimiento_at: toIso(base.primer),
    ultimo_movimiento_at: toIso(base.ultimo),
    elapsed_ms: elapsedMs,
    throughput_rps_total: elapsedMs > 0 ? Number(((total * 1000) / elapsedMs).toFixed(2)) : 0,
    fuente,
    cobertura,
    latencia,
    latencia_histograma,
    confianza_buckets,
    top_categorias,
    agreement,
    recientes,
    mismatches_recientes,
  };
}
