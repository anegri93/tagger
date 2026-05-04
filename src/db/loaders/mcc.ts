import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mccCatalogo } from '../schema/index.js';
import { readCsv, type LoaderConfig } from './csv.js';

interface MccCsvRow {
  'Cód.Rubro'?: string;
  'Desc.Rubro'?: string;
  'Cód.MCC'?: string;
  Descripción?: string;
  cod_rubro?: string;
  desc_rubro?: string;
  cod_mcc?: string;
  descripcion?: string;
}

interface MccMappingEntry {
  categoria_slug: string;
  ambiguo?: boolean;
}

interface MccInsert {
  codMcc: string;
  codRubro: string | null;
  descRubro: string | null;
  descripcion: string | null;
  categoriaId: string;
  ambiguo: boolean;
  source: string;
}

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function pickField(row: MccCsvRow, ...keys: Array<keyof MccCsvRow>): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function readMapping(): Record<string, MccMappingEntry> {
  const path = resolve(ROOT, 'data/mcc-mapping.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const out: Record<string, MccMappingEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    out[k] = v as MccMappingEntry;
  }
  return out;
}

function readCsvByMcc(): Map<string, MccCsvRow> {
  const path = resolve(ROOT, 'data/mcc.csv');
  if (!existsSync(path)) return new Map();
  const rows = readCsv<MccCsvRow & Record<string, string>>('data/mcc.csv');
  const map = new Map<string, MccCsvRow>();
  for (const r of rows) {
    const cod = pickField(r, 'Cód.MCC', 'cod_mcc');
    if (cod) map.set(cod, r);
  }
  return map;
}

export const mccLoaderConfig: LoaderConfig<Record<string, string>, MccInsert> = {
  table: mccCatalogo,
  tableName: 'mcc_catalogo',
  // Mapping JSON es la fuente, CSV solo enriquece metadata
  data: (() => {
    const mapping = readMapping();
    return Object.entries(mapping).map(([codMcc, m]) => ({
      cod_mcc: codMcc,
      categoria_slug: m.categoria_slug,
      ambiguo: m.ambiguo ? '1' : '',
    }));
  })(),
  mapRow(row, ctx) {
    const codMcc = row.cod_mcc;
    const categoriaSlug = row.categoria_slug;
    if (!codMcc || !categoriaSlug) return null;
    const categoriaId = ctx.resolveCategoria(categoriaSlug);
    if (!categoriaId) {
      console.warn(`[mcc] categoría '${categoriaSlug}' inexistente, skip ${codMcc}`);
      return null;
    }
    const csvByMcc = readCsvByMcc();
    const csvRow = csvByMcc.get(codMcc);
    return {
      codMcc,
      codRubro: csvRow ? pickField(csvRow, 'Cód.Rubro', 'cod_rubro') ?? null : null,
      descRubro: csvRow ? pickField(csvRow, 'Desc.Rubro', 'desc_rubro') ?? null : null,
      descripcion: csvRow ? pickField(csvRow, 'Descripción', 'descripcion') ?? null : null,
      categoriaId,
      ambiguo: row.ambiguo === '1',
      source: csvRow ? 'csv+mapping' : 'mapping',
    };
  },
  upsert: {
    target: mccCatalogo.codMcc,
    setUpdate: (r) => ({
      categoriaId: r.categoriaId,
      ambiguo: r.ambiguo,
      codRubro: r.codRubro,
      descRubro: r.descRubro,
      descripcion: r.descripcion,
      source: r.source,
      updatedAt: new Date(),
    }),
  },
};
