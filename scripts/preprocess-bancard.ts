import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBrand } from '../src/domain/brand.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(root, 'data/comercios-bancard-raw.tsv');
const outMango = resolve(root, 'data/mango-p2p.tsv');
const outStaged = resolve(root, 'data/comercios-bancard-staged.tsv');

if (!existsSync(inputPath)) {
  console.error(`Falta ${inputPath}. Correr antes: node scripts/xlsx-to-tsv.mjs <ruta.xlsx>`);
  process.exit(1);
}

const MANGO_RE = /^MANGO-/i;
const MCC_INVALID = new Set(['', 'SIN RUBRO', 'null', 'NULL']);

function isValidMcc(m: string): boolean {
  if (!m) return false;
  return !MCC_INVALID.has(m.trim());
}

interface Row {
  nombre: string;
  bancardId: string;
  codigoComercio: string;
  mcc: string;
}

const raw = readFileSync(inputPath, 'utf8').trim().split('\n');
const rawHeader = raw[0]!;
const stagedHeader = [...rawHeader.split('\t'), 'mcc_conflicto', 'marca', 'mcc_inferido'].join('\t');
const lines = raw.slice(1);

const mangoRows: string[] = [];
const otrosRows: Row[] = [];

for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.split('\t');
  const nombre = cols[0] ?? '';
  if (MANGO_RE.test(nombre)) {
    mangoRows.push(line);
    continue;
  }
  otrosRows.push({
    nombre,
    bancardId: cols[1] ?? '',
    codigoComercio: cols[2] ?? '',
    mcc: (cols[3] ?? '').trim(),
  });
}

// Step 1: dedup by (bancardId, codigoComercio) - elegir MCC ganador entre filas duplicadas
const groupsByKey = new Map<string, Row[]>();
for (const r of otrosRows) {
  const key = `${r.bancardId}|${r.codigoComercio}`;
  if (!groupsByKey.has(key)) groupsByKey.set(key, []);
  groupsByKey.get(key)!.push(r);
}

interface DedupRow extends Row {
  conflicto: string;
}

const deduped: DedupRow[] = [];
let conflicts = 0;
let resolvedFromMultiple = 0;
for (const [, items] of groupsByKey) {
  if (items.length === 1) {
    deduped.push({ ...items[0]!, conflicto: '' });
    continue;
  }
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!isValidMcc(it.mcc)) continue;
    counts.set(it.mcc, (counts.get(it.mcc) ?? 0) + 1);
  }
  const canonical = items.slice().sort((a, b) => b.nombre.length - a.nombre.length)[0]!;
  if (counts.size === 0) {
    deduped.push({ ...canonical, mcc: '', conflicto: '' });
    continue;
  }
  resolvedFromMultiple++;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const winner = sorted[0]![0];
  const conflict = counts.size > 1 ? '1' : '';
  if (conflict) conflicts++;
  deduped.push({ ...canonical, mcc: winner, conflicto: conflict });
}

// Step 2: brand grouping → MCC inferido
interface Enriched extends DedupRow {
  marca: string;
  mccInferido: string;
}

const byBrand = new Map<string, DedupRow[]>();
const sinMarca: DedupRow[] = [];
for (const r of deduped) {
  const marca = extractBrand(r.nombre);
  if (!marca) {
    sinMarca.push(r);
    continue;
  }
  if (!byBrand.has(marca)) byBrand.set(marca, []);
  byBrand.get(marca)!.push(r);
}

const enriched: Enriched[] = [];
let rescatados = 0;
const topRescate: Array<{ marca: string; rescatados: number; mcc: string }> = [];

for (const [marca, group] of byBrand) {
  const counts = new Map<string, number>();
  for (const r of group) {
    if (!isValidMcc(r.mcc)) continue;
    counts.set(r.mcc, (counts.get(r.mcc) ?? 0) + 1);
  }
  let winnerMcc: string | null = null;
  if (counts.size > 0 && group.length >= 2) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    winnerMcc = sorted[0]![0];
  }
  let groupRescate = 0;
  for (const r of group) {
    if (!isValidMcc(r.mcc) && winnerMcc) {
      enriched.push({ ...r, mcc: winnerMcc, marca, mccInferido: '1' });
      rescatados++;
      groupRescate++;
    } else {
      enriched.push({ ...r, marca, mccInferido: '' });
    }
  }
  if (groupRescate > 0) topRescate.push({ marca, rescatados: groupRescate, mcc: winnerMcc! });
}

for (const r of sinMarca) {
  enriched.push({ ...r, marca: '', mccInferido: '' });
}

// Step 3: write
const stagedLines = [stagedHeader];
for (const e of enriched) {
  stagedLines.push(
    [e.nombre, e.bancardId, e.codigoComercio, e.mcc, e.conflicto, e.marca, e.mccInferido].join('\t'),
  );
}
writeFileSync(outMango, [rawHeader, ...mangoRows].join('\n') + '\n');
writeFileSync(outStaged, stagedLines.join('\n') + '\n');

const total = lines.length;
console.log(`Total filas raw: ${total}`);
console.log(`MANGO-P2P     : ${mangoRows.length} (${((100 * mangoRows.length) / total).toFixed(1)}%)`);
console.log(`Comercios raw : ${otrosRows.length}`);
console.log(`Comercios dedup: ${deduped.length}`);
console.log(`  resueltos múltiple: ${resolvedFromMultiple}, con conflicto MCC: ${conflicts}`);
console.log(`\nInferencia por marca:`);
console.log(`  marcas únicas: ${byBrand.size}`);
console.log(`  filas sin marca extraíble: ${sinMarca.length}`);
console.log(`  filas rescatadas (MCC heredado): ${rescatados}`);
console.log(`\nTop 15 marcas con más rescates:`);
for (const t of topRescate.sort((a, b) => b.rescatados - a.rescatados).slice(0, 15)) {
  console.log(`  ${t.marca.padEnd(30)} ${String(t.rescatados).padStart(5)} (mcc ${t.mcc})`);
}
console.log(`\n→ ${outMango}`);
console.log(`→ ${outStaged}`);
