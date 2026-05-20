#!/usr/bin/env node
// Analiza huérfanos y sugiere reglas globales 'contiene' usando BIGRAMS (pares
// de tokens consecutivos). Mayor pureza que unigrams porque captura contexto.
//
// Uso:
//   node scripts/sugerir-bigrams-huerfanos.mjs [batch_id] [--apply] [opciones]

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
const MIN_FREQ = Number(args.find((a) => a.startsWith('--min-freq='))?.split('=')[1] ?? 5);
const MIN_PURITY = Number(args.find((a) => a.startsWith('--min-purity='))?.split('=')[1] ?? 0.85);
const MIN_LEN_BIGRAM = Number(args.find((a) => a.startsWith('--min-len='))?.split('=')[1] ?? 7);
const PRIORIDAD = Number(args.find((a) => a.startsWith('--prio='))?.split('=')[1] ?? 45);

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const huerRes = await client.query(
  `SELECT UPPER(REGEXP_REPLACE(COALESCE(m.nombre_bancard, ''), '[^A-Za-z0-9 ]', ' ', 'g')) AS n,
          cat.slug
   FROM movimientos m
   LEFT JOIN mcc_por_nombre c ON c.nombre_normalizado = UPPER(REGEXP_REPLACE(COALESCE(m.nombre_bancard, ''), '[^A-Za-z0-9 ]', '', 'g'))
   LEFT JOIN categorias cat ON cat.id = c.categoria_id
   WHERE m.batch_id = $1 AND m.categoria_predicha_id IS NULL AND cat.slug IS NOT NULL`,
  [BATCH],
);

// Construir bigrams: pares de tokens consecutivos
const bigramCounts = new Map();
for (const row of huerRes.rows) {
  const tokens = row.n.split(/\s+/).filter((t) => t.length >= 3);
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (bigram.length < MIN_LEN_BIGRAM) continue;
    const key = `${bigram}|${row.slug}`;
    bigramCounts.set(key, (bigramCounts.get(key) ?? 0) + 1);
  }
}

const byBigram = new Map();
for (const [key, hits] of bigramCounts) {
  const [bigram, slug] = key.split('|');
  if (!byBigram.has(bigram)) byBigram.set(bigram, new Map());
  byBigram.get(bigram).set(slug, hits);
}

const candidatos = [];
for (const [bigram, slugMap] of byBigram) {
  const total = [...slugMap.values()].reduce((a, b) => a + b, 0);
  if (total < MIN_FREQ) continue;
  let topSlug = '',
    topHits = 0;
  for (const [s, h] of slugMap) {
    if (h > topHits) {
      topSlug = s;
      topHits = h;
    }
  }
  const purity = topHits / total;
  if (purity < MIN_PURITY) continue;
  candidatos.push({ valor: bigram, slug: topSlug, hits: topHits, total, purity });
}

candidatos.sort((a, b) => b.hits - a.hits);

// Verificar conflictos con reglas existentes
const existing = await client.query(
  `SELECT valor_normalizado, c.slug FROM reglas r
   JOIN categorias c ON c.id = r.categoria_id
   WHERE r.scope = 'global' AND r.tipo = 'contiene' AND r.activo`,
);
const existingSet = new Set(existing.rows.map((r) => r.valor_normalizado));

console.log(`Huérfanos en ${BATCH}: analizados`);
console.log(
  `Umbrales: min_freq=${MIN_FREQ}, min_purity=${MIN_PURITY}, min_len_bigram=${MIN_LEN_BIGRAM}\n`,
);
console.log(`Bigram               | Cat            | Hits | Total | Purity | Existe?`);
console.log(`─────────────────────┼────────────────┼──────┼───────┼────────┼────────`);

const nuevos = [];
let totalCobertura = 0;
for (const c of candidatos) {
  const existe = existingSet.has(c.valor);
  console.log(
    `${c.valor.padEnd(20)} | ${c.slug.padEnd(14)} | ${String(c.hits).padStart(4)} | ${String(c.total).padStart(5)} | ${c.purity.toFixed(3).padStart(6)} | ${existe ? 'sí' : '—'}`,
  );
  if (!existe) {
    nuevos.push(c);
    totalCobertura += c.hits;
  }
}

console.log(
  `\nCandidatos nuevos: ${nuevos.length} reglas, cobertura potencial ~${totalCobertura} movs`,
);

if (!APPLY) {
  console.log('\nPara aplicar: node scripts/sugerir-bigrams-huerfanos.mjs ' + BATCH + ' --apply');
  await client.end();
  process.exit(0);
}

console.log('\n▶ Aplicando vía POST /reglas...\n');
let ok = 0,
  fail = 0;
for (const c of nuevos) {
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
        origen: 'huerfanos-bigram',
        descripcion: `auto-bigram: ${BATCH} hits=${c.hits} purity=${c.purity.toFixed(2)}`,
      }),
    });
    if (r.ok) {
      ok++;
      process.stdout.write('.');
    } else {
      fail++;
      const txt = await r.text();
      console.log(`\n  fail "${c.valor}"→${c.slug}: ${txt}`);
    }
  } catch (e) {
    fail++;
    console.log(`\n  fail "${c.valor}": ${e.message}`);
  }
}
console.log(`\n\nAplicadas: ${ok} · fallidas: ${fail}`);
await client.end();
