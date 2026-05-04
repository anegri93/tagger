#!/usr/bin/env node
import 'dotenv/config';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'data/mcc-categoria-mapping.tsv');

const url = process.env.DATABASE_URL ?? 'postgres://tagger:tagger@localhost:5432/tagger';
const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows: mccs } = await client.query(`
  SELECT m.cod_mcc, m.descripcion, c.slug AS categoria_slug
  FROM mcc_catalogo m
  LEFT JOIN categorias c ON c.id = m.categoria_id
  ORDER BY m.cod_mcc
`);

await client.end();

const existing = new Map();
if (existsSync(out)) {
  const prev = readFileSync(out, 'utf8').split('\n').slice(1);
  for (const line of prev) {
    const [cod, , slug] = line.split('\t');
    if (cod && slug) existing.set(cod, slug);
  }
}

const lines = ['cod_mcc\tdescripcion\tcategoria_slug'];
for (const r of mccs) {
  const slug = r.categoria_slug ?? existing.get(r.cod_mcc) ?? '';
  const desc = (r.descripcion ?? '').replace(/[\t\r\n]+/g, ' ');
  lines.push(`${r.cod_mcc}\t${desc}\t${slug}`);
}
writeFileSync(out, lines.join('\n') + '\n');

const sinSlug = mccs.filter((r) => !r.categoria_slug && !existing.has(r.cod_mcc)).length;
const conSlug = mccs.length - sinSlug;
console.log(`✔ ${out}`);
console.log(`  total: ${mccs.length}, con slug: ${conSlug}, sin slug: ${sinSlug}`);
console.log(`  Editá el TSV manualmente, llená columna categoria_slug pa filas vacías.`);
console.log(`  Luego: pnpm db:load:mcc-categoria`);
