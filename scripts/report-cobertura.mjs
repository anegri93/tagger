#!/usr/bin/env node
import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgres://tagger:tagger@localhost:5432/tagger';
const c = new pg.Client({ connectionString: url });
await c.connect();

console.log('\n=== Cobertura comercios_catalogo ===\n');

const total = (await c.query(`SELECT count(*)::int AS c FROM comercios_catalogo`)).rows[0].c;
console.log(`Total registros: ${total}`);

console.log('\n--- Por fuente_categoria ---');
const fuente = await c.query(`
  SELECT COALESCE(fuente_categoria::text, 'NULL') AS fuente,
         count(*)::int AS c,
         round(100.0 * count(*) / NULLIF(${total}, 0), 1) AS pct
  FROM comercios_catalogo
  GROUP BY fuente_categoria
  ORDER BY c DESC
`);
for (const r of fuente.rows) console.log(`  ${r.fuente.padEnd(12)} ${String(r.c).padStart(8)} (${r.pct}%)`);

console.log('\n--- Requiere revisión ---');
const rev = await c.query(`
  SELECT requiere_revision, count(*)::int AS c
  FROM comercios_catalogo
  GROUP BY requiere_revision
`);
for (const r of rev.rows) console.log(`  revision=${r.requiere_revision}: ${r.c}`);

console.log('\n--- Top 15 categorías ---');
const top = await c.query(`
  SELECT cat.slug, count(*)::int AS c
  FROM comercios_catalogo co
  JOIN categorias cat ON cat.id = co.categoria_id
  GROUP BY cat.slug
  ORDER BY c DESC
  LIMIT 15
`);
for (const r of top.rows) console.log(`  ${r.slug.padEnd(20)} ${String(r.c).padStart(8)}`);

console.log('\n--- Top 15 MCCs sin mapeo (categoria_id NULL en mcc_catalogo) ---');
const sinMap = await c.query(`
  SELECT co.mcc_original, count(*)::int AS c
  FROM comercios_catalogo co
  LEFT JOIN mcc_catalogo m ON m.cod_mcc = co.mcc
  WHERE co.requiere_revision = true
    AND co.mcc IS NOT NULL
    AND (m.categoria_id IS NULL OR m.cod_mcc IS NULL)
  GROUP BY co.mcc_original
  ORDER BY c DESC
  LIMIT 15
`);
for (const r of sinMap.rows) console.log(`  ${(r.mcc_original ?? 'NULL').padEnd(15)} ${String(r.c).padStart(8)}`);

console.log('\n--- Inferencia por marca ---');
const inf = await c.query(`
  SELECT mcc_inferido, count(*)::int AS c
  FROM comercios_catalogo
  GROUP BY mcc_inferido
`);
for (const r of inf.rows) console.log(`  inferido=${r.mcc_inferido}: ${r.c}`);

const topMarcas = await c.query(`
  SELECT marca, count(*)::int AS c
  FROM comercios_catalogo
  WHERE mcc_inferido = true AND marca IS NOT NULL
  GROUP BY marca
  ORDER BY c DESC
  LIMIT 10
`);
console.log('\n  Top 10 marcas con MCC inferido:');
for (const r of topMarcas.rows) console.log(`    ${(r.marca ?? '').padEnd(30)} ${String(r.c).padStart(5)}`);

console.log('\n--- Distribución confianza ---');
const conf = await c.query(`
  SELECT
    CASE
      WHEN confianza IS NULL THEN 'NULL'
      WHEN confianza >= 0.9 THEN '>=0.90'
      WHEN confianza >= 0.7 THEN '0.70-0.89'
      WHEN confianza >= 0.5 THEN '0.50-0.69'
      ELSE '<0.50'
    END AS bucket,
    count(*)::int AS c
  FROM comercios_catalogo
  GROUP BY bucket
  ORDER BY bucket DESC
`);
for (const r of conf.rows) console.log(`  ${r.bucket.padEnd(12)} ${String(r.c).padStart(8)}`);

await c.end();
console.log('');
