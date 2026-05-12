#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('Uso: node scripts/xlsx-to-tsv.mjs <ruta.xlsx>');
  process.exit(1);
}
const inputPath = resolve(input);
if (!existsSync(inputPath)) {
  console.error(`Archivo no existe: ${inputPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(inputPath, { cellDates: false });

const sheets = wb.SheetNames;
console.log(`Hojas: ${sheets.join(', ')}`);

const SHEET_COMMERCES = 'COMMERCES';
const SHEET_MCC_GENERAL = 'MCC GENERAL';

if (!sheets.includes(SHEET_COMMERCES)) {
  console.error(`Falta hoja "${SHEET_COMMERCES}"`);
  process.exit(1);
}
if (!sheets.includes(SHEET_MCC_GENERAL)) {
  console.error(`Falta hoja "${SHEET_MCC_GENERAL}"`);
  process.exit(1);
}

function toTsv(sheet, columns) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const lines = [columns.join('\t')];
  for (const r of rows) {
    const vals = columns.map((c) => {
      let v = r[c] ?? '';
      v = String(v)
        .replace(/[\t\r\n]+/g, ' ')
        .trim();
      return v;
    });
    if (vals.every((v) => v === '')) continue;
    lines.push(vals.join('\t'));
  }
  return lines.join('\n') + '\n';
}

const commercesTsv = toTsv(wb.Sheets[SHEET_COMMERCES], [
  'Nombre',
  'BancardId',
  'CodigoComercio',
  'MCC',
]);
const mccTsv = toTsv(wb.Sheets[SHEET_MCC_GENERAL], ['MCC', 'MCC Descripción']);

const outCommerces = resolve(root, 'data/comercios-bancard-raw.tsv');
const outMcc = resolve(root, 'data/mcc-general.tsv');
writeFileSync(outCommerces, commercesTsv);
writeFileSync(outMcc, mccTsv);

const commercesCount = commercesTsv.split('\n').length - 2;
const mccCount = mccTsv.split('\n').length - 2;
console.log(`✔ ${outCommerces} (${commercesCount} filas)`);
console.log(`✔ ${outMcc} (${mccCount} filas)`);
console.log(`Hoja "MCC COMMERCES" descartada (datos basura).`);
