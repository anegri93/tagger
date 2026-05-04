#!/usr/bin/env node
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const batchId = process.argv[2];
if (!batchId) {
  console.error('Uso: node scripts/analyze-test-batch.mjs <batch_id>');
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? 'postgres://tagger:tagger@localhost:5432/tagger';
const c = new pg.Client({ connectionString: url });
await c.connect();

const summary = {};

console.log(`\n=== Análisis batch '${batchId}' ===\n`);

const total = (
  await c.query(`SELECT count(*)::int AS n FROM movimientos WHERE batch_id = $1`, [batchId])
).rows[0].n;
summary.total = total;
console.log(`Total movimientos: ${total}`);
if (total === 0) {
  console.log('Batch vacío. Verificar runner.');
  await c.end();
  process.exit(0);
}

console.log('\n--- Distribución por fuente_categoria ---');
const fuente = await c.query(
  `SELECT COALESCE(fuente_categoria::text,'NULL') AS fuente,
          count(*)::int AS c,
          round(100.0*count(*)/${total},1) AS pct
   FROM movimientos WHERE batch_id=$1
   GROUP BY fuente_categoria ORDER BY c DESC`,
  [batchId],
);
summary.fuente = {};
for (const r of fuente.rows) {
  console.log(`  ${r.fuente.padEnd(12)} ${String(r.c).padStart(8)} (${r.pct}%)`);
  summary.fuente[r.fuente] = { count: r.c, pct: Number(r.pct) };
}

console.log('\n--- Cobertura sync (sin IA) ---');
const cob = await c.query(
  `SELECT
     count(*) FILTER (WHERE categoria_predicha_id IS NOT NULL AND fuente_categoria != 'ia')::int AS sync_ok,
     count(*) FILTER (WHERE categoria_predicha_id IS NULL OR fuente_categoria = 'ia')::int AS pendiente_o_ia,
     count(*) FILTER (WHERE requiere_revision = true)::int AS revision
   FROM movimientos WHERE batch_id=$1`,
  [batchId],
);
const r0 = cob.rows[0];
summary.cobertura = {
  sync_ok: r0.sync_ok,
  sync_ok_pct: Number(((100 * r0.sync_ok) / total).toFixed(1)),
  pendiente_o_ia: r0.pendiente_o_ia,
  revision: r0.revision,
};
console.log(`  sync_ok        ${r0.sync_ok} (${summary.cobertura.sync_ok_pct}%)`);
console.log(`  pendiente_o_ia ${r0.pendiente_o_ia}`);
console.log(`  revision       ${r0.revision}`);

console.log('\n--- Latencia (ms) ---');
const lat = await c.query(
  `SELECT
     min(latency_ms)::int AS min,
     percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
     percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95,
     percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99,
     max(latency_ms)::int AS max,
     avg(latency_ms)::int AS avg
   FROM movimientos WHERE batch_id=$1 AND latency_ms IS NOT NULL`,
  [batchId],
);
summary.latencia = lat.rows[0];
console.log(`  min ${lat.rows[0].min}, p50 ${lat.rows[0].p50}, p95 ${lat.rows[0].p95}, p99 ${lat.rows[0].p99}, max ${lat.rows[0].max}, avg ${lat.rows[0].avg}`);

console.log('\n--- Top 10 categorías predichas ---');
const top = await c.query(
  `SELECT cat.slug, count(*)::int AS c
   FROM movimientos m
   JOIN categorias cat ON cat.id = m.categoria_predicha_id
   WHERE m.batch_id=$1
   GROUP BY cat.slug ORDER BY c DESC LIMIT 10`,
  [batchId],
);
summary.top_categorias = top.rows;
for (const r of top.rows) console.log(`  ${r.slug.padEnd(20)} ${String(r.c).padStart(8)}`);

console.log('\n--- Agreement vs catálogo (movimiento.categoria_predicha vs comercios_catalogo.categoria) ---');
const agr = await c.query(
  `WITH joined AS (
     SELECT m.categoria_predicha_id AS pred,
            c.categoria_id AS cat,
            m.fuente_categoria AS m_fuente,
            c.fuente_categoria AS c_fuente
     FROM movimientos m
     LEFT JOIN comercios_catalogo c
       ON c.bancard_id = m.bancard_id AND c.codigo_comercio = m.codigo_comercio
     WHERE m.batch_id = $1
   )
   SELECT
     count(*) FILTER (WHERE pred IS NOT NULL AND cat IS NOT NULL AND pred = cat)::int AS match,
     count(*) FILTER (WHERE pred IS NOT NULL AND cat IS NOT NULL AND pred != cat)::int AS mismatch,
     count(*) FILTER (WHERE cat IS NULL)::int AS sin_catalogo,
     count(*) FILTER (WHERE pred IS NULL)::int AS sin_prediccion
   FROM joined`,
  [batchId],
);
const a = agr.rows[0];
const denom = a.match + a.mismatch;
summary.agreement = {
  ...a,
  agreement_pct: denom > 0 ? Number(((100 * a.match) / denom).toFixed(2)) : 0,
};
console.log(`  match           ${a.match}`);
console.log(`  mismatch        ${a.mismatch}`);
console.log(`  sin_catalogo    ${a.sin_catalogo}`);
console.log(`  sin_prediccion  ${a.sin_prediccion}`);
console.log(`  agreement       ${summary.agreement.agreement_pct}%`);

console.log('\n--- Top 30 mismatches (runtime → catálogo) ---');
const mis = await c.query(
  `SELECT m.nombre_bancard, m.bancard_id, m.codigo_comercio,
          m.fuente_categoria AS rt_fuente, cat_pred.slug AS rt_categoria,
          c.fuente_categoria AS cat_fuente, cat_cat.slug AS cat_categoria,
          count(*)::int AS c
   FROM movimientos m
   JOIN comercios_catalogo c
     ON c.bancard_id = m.bancard_id AND c.codigo_comercio = m.codigo_comercio
   LEFT JOIN categorias cat_pred ON cat_pred.id = m.categoria_predicha_id
   LEFT JOIN categorias cat_cat ON cat_cat.id = c.categoria_id
   WHERE m.batch_id=$1 AND m.categoria_predicha_id IS NOT NULL
     AND m.categoria_predicha_id != c.categoria_id
   GROUP BY m.nombre_bancard, m.bancard_id, m.codigo_comercio, m.fuente_categoria,
            cat_pred.slug, c.fuente_categoria, cat_cat.slug
   ORDER BY c DESC LIMIT 30`,
  [batchId],
);
summary.top_mismatches = mis.rows;
for (const r of mis.rows) {
  console.log(`  ${(r.nombre_bancard ?? '').slice(0, 30).padEnd(30)} | rt=${(r.rt_fuente ?? 'null').padEnd(7)} ${(r.rt_categoria ?? '-').padEnd(15)} cat=${(r.cat_fuente ?? 'null').padEnd(7)} ${r.cat_categoria ?? '-'}`);
}

const outPath = resolve(root, `data/test-summary-${batchId}.json`);
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`\n→ ${outPath}`);

await c.end();
