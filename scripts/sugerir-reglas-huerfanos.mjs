#!/usr/bin/env node
// Analiza movs huérfanos (categoria_predicha_id IS NULL) en un batch con bypass_on
// y sugiere reglas globales 'contiene' basadas en tokens de alta pureza.
//
// Uso:
//   node scripts/sugerir-reglas-huerfanos.mjs [batch_id] [--apply]
//
// Sin --apply: imprime sugerencias. Con --apply: crea reglas via POST /reglas.

import 'dotenv/config';
import pg from 'pg';

const API = process.env.API_URL || 'http://localhost:3000';
const KEY = process.env.API_KEY;
const DB_URL = process.env.DATABASE_URL || 'postgres://tagger:tagger@localhost:5432/tagger';
if (!KEY) {
  console.error('falta API_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const BATCH = args.find((a) => !a.startsWith('--')) || 'bench-bypass-on';
const APPLY = args.includes('--apply');
const MIN_FREQ = Number(args.find((a) => a.startsWith('--min-freq='))?.split('=')[1] ?? 10);
const MIN_PURITY = Number(args.find((a) => a.startsWith('--min-purity='))?.split('=')[1] ?? 0.85);
const MIN_LEN = Number(args.find((a) => a.startsWith('--min-len='))?.split('=')[1] ?? 4);
const PRIORIDAD = Number(args.find((a) => a.startsWith('--prio='))?.split('=')[1] ?? 50);

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const q = `
WITH huer AS (
  SELECT UPPER(REGEXP_REPLACE(COALESCE(m.nombre_bancard, ''), '[^A-Za-z0-9 ]', ' ', 'g')) AS n,
         cat.slug
  FROM movimientos m
  LEFT JOIN mcc_por_nombre c ON c.nombre_normalizado = UPPER(REGEXP_REPLACE(COALESCE(m.nombre_bancard, ''), '[^A-Za-z0-9 ]', '', 'g'))
  LEFT JOIN categorias cat ON cat.id = c.categoria_id
  WHERE m.batch_id = $1 AND m.categoria_predicha_id IS NULL AND cat.slug IS NOT NULL
),
tok AS (
  SELECT unnest(regexp_split_to_array(n, '\\s+')) AS token, slug FROM huer
),
agg AS (
  SELECT token, slug, count(*)::int AS hits
  FROM tok WHERE length(token) >= $2 GROUP BY 1,2
),
total AS (SELECT token, sum(hits)::int AS total_hits FROM agg GROUP BY token)
SELECT a.token, a.slug, a.hits, t.total_hits,
       ROUND((1.0 * a.hits / t.total_hits)::numeric, 3) AS purity
FROM agg a JOIN total t USING (token)
WHERE t.total_hits >= $3 AND (1.0 * a.hits / t.total_hits) >= $4
ORDER BY a.hits DESC
`;

const res = await client.query(q, [BATCH, MIN_LEN, MIN_FREQ, MIN_PURITY]);

// Verificar conflictos con reglas ya existentes
const existing = await client.query(
  `SELECT valor_normalizado, c.slug FROM reglas r
   JOIN categorias c ON c.id = r.categoria_id
   WHERE r.scope = 'global' AND r.tipo = 'contiene' AND r.activo`,
);
const existingSet = new Set(existing.rows.map((r) => `${r.valor_normalizado}|${r.slug}`));

console.log(`Huérfanos en ${BATCH}: analizados`);
console.log(`Umbrales: min_freq=${MIN_FREQ}, min_purity=${MIN_PURITY}, min_len=${MIN_LEN}\n`);
console.log(`Token            | Cat            | Hits | Total | Purity | Existe?`);
console.log(`─────────────────┼────────────────┼──────┼───────┼────────┼────────`);

const candidatos = [];
let totalCobertura = 0;
for (const r of res.rows) {
  const key = `${r.token}|${r.slug}`;
  const existe = existingSet.has(key);
  console.log(
    `${r.token.padEnd(16)} | ${r.slug.padEnd(14)} | ${String(r.hits).padStart(4)} | ${String(r.total_hits).padStart(5)} | ${String(r.purity).padStart(6)} | ${existe ? 'sí' : '—'}`,
  );
  if (!existe) {
    candidatos.push({ valor: r.token, slug: r.slug, hits: r.hits });
    totalCobertura += r.hits;
  }
}

console.log(
  `\nCandidatos nuevos: ${candidatos.length} reglas, cobertura potencial ~${totalCobertura} movs huérfanos`,
);

if (!APPLY) {
  console.log('\nPara aplicar: node scripts/sugerir-reglas-huerfanos.mjs ' + BATCH + ' --apply');
  await client.end();
  process.exit(0);
}

console.log('\n▶ Aplicando vía POST /reglas...\n');
let ok = 0,
  fail = 0;
for (const c of candidatos) {
  try {
    const r = await fetch(`${API}/reglas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY },
      body: JSON.stringify({
        scope: 'global',
        tipo: 'contiene',
        valor: c.valor,
        categoria_slug: c.slug,
        prioridad: PRIORIDAD,
        origen: 'huerfanos-script',
        descripcion: `auto: token huérfano en ${BATCH} (hits=${c.hits})`,
      }),
    });
    if (r.ok) {
      ok++;
      process.stdout.write('.');
    } else {
      fail++;
      const txt = await r.text();
      console.log(`\n  fail ${c.valor}→${c.slug}: ${txt}`);
    }
  } catch (e) {
    fail++;
    console.log(`\n  fail ${c.valor}: ${e.message}`);
  }
}
console.log(`\n\nAplicadas: ${ok} · fallidas: ${fail}`);
await client.end();
