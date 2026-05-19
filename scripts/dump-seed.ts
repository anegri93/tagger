import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { db } from '../src/db/client.js';

function esc(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function values(row: Record<string, unknown>, cols: string[]): string {
  return '(' + cols.map((c) => esc(row[c])).join(', ') + ')';
}

async function main() {
  const out: string[] = [];
  out.push('-- tagger seed dump');
  out.push(`-- generado ${new Date().toISOString()}`);
  out.push('-- idempotente: ON CONFLICT DO NOTHING en todas las tablas');
  out.push('-- aplica sobre schema post-migraciones 0017-0019 (reglas + mcc_por_nombre)');
  out.push('');
  out.push('BEGIN;');
  out.push('');

  // ===== categorias =====
  const cats = await db.execute(sql`
    SELECT id, slug, nombre, descripcion, activo
    FROM categorias ORDER BY slug
  `);
  const catCols = ['id', 'slug', 'nombre', 'descripcion', 'activo'];
  out.push(`-- categorias (${cats.rows.length})`);
  if (cats.rows.length > 0) {
    out.push(`INSERT INTO categorias (${catCols.join(', ')}) VALUES`);
    out.push(cats.rows.map((r) => values(r as Record<string, unknown>, catCols)).join(',\n'));
    out.push(`ON CONFLICT (slug) DO NOTHING;`);
  }
  out.push('');

  // ===== mcc_catalogo =====
  const mccs = await db.execute(sql`
    SELECT cod_mcc, descripcion, categoria_id, ambiguo
    FROM mcc_catalogo ORDER BY cod_mcc
  `);
  const mccCols = ['cod_mcc', 'descripcion', 'categoria_id', 'ambiguo'];
  out.push(`-- mcc_catalogo (${mccs.rows.length})`);
  if (mccs.rows.length > 0) {
    out.push(`INSERT INTO mcc_catalogo (${mccCols.join(', ')}) VALUES`);
    out.push(mccs.rows.map((r) => values(r as Record<string, unknown>, mccCols)).join(',\n'));
    out.push(`ON CONFLICT (cod_mcc) DO NOTHING;`);
  }
  out.push('');

  // ===== reglas (unifica patrones globales + user-scope + memoria) =====
  const reglas = await db.execute(sql`
    SELECT id, scope, tipo, valor, valor_normalizado, categoria_id, prioridad,
           activo, hits, origen, descripcion
    FROM reglas ORDER BY scope, prioridad, valor_normalizado
  `);
  const reglasCols = [
    'id',
    'scope',
    'tipo',
    'valor',
    'valor_normalizado',
    'categoria_id',
    'prioridad',
    'activo',
    'hits',
    'origen',
    'descripcion',
  ];
  out.push(`-- reglas (${reglas.rows.length})`);
  if (reglas.rows.length > 0) {
    const BATCH = 500;
    const rows = reglas.rows as Array<Record<string, unknown>>;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      out.push(`INSERT INTO reglas (${reglasCols.join(', ')}) VALUES`);
      out.push(chunk.map((r) => values(r, reglasCols)).join(',\n'));
      out.push(`ON CONFLICT (scope, tipo, valor_normalizado) DO NOTHING;`);
    }
  }
  out.push('');

  // ===== marcas_conocidas =====
  const marcas = await db.execute(sql`
    SELECT id, marca, categoria_id, descripcion
    FROM marcas_conocidas ORDER BY marca
  `);
  const marcaCols = ['id', 'marca', 'categoria_id', 'descripcion'];
  out.push(`-- marcas_conocidas (${marcas.rows.length})`);
  if (marcas.rows.length > 0) {
    out.push(`INSERT INTO marcas_conocidas (${marcaCols.join(', ')}) VALUES`);
    out.push(marcas.rows.map((r) => values(r as Record<string, unknown>, marcaCols)).join(',\n'));
    out.push(`ON CONFLICT (marca) DO NOTHING;`);
  }
  out.push('');

  // ===== mcc_por_nombre (catálogo de nombres → MCC) =====
  const mccPN = await db.execute(sql`
    SELECT nombre, nombre_normalizado, mcc, categoria_id, requiere_revision
    FROM mcc_por_nombre
    ORDER BY nombre_normalizado
  `);
  out.push(`-- mcc_por_nombre (${mccPN.rows.length})`);
  if (mccPN.rows.length > 0) {
    const BATCH = 1000;
    const rows = mccPN.rows as Array<Record<string, unknown>>;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      out.push(
        `INSERT INTO mcc_por_nombre (nombre, nombre_normalizado, mcc, categoria_id, requiere_revision) VALUES`,
      );
      out.push(
        chunk
          .map(
            (r) =>
              '(' +
              [
                esc(r.nombre),
                esc(r.nombre_normalizado),
                esc(r.mcc),
                esc(r.categoria_id),
                esc(r.requiere_revision),
              ].join(', ') +
              ')',
          )
          .join(',\n'),
      );
      out.push(`ON CONFLICT (nombre_normalizado) DO NOTHING;`);
    }
  }
  out.push('');

  out.push('COMMIT;');
  out.push('');

  const path = 'data/seed.sql';
  writeFileSync(path, out.join('\n'));
  console.log(`escrito ${path}`);
  console.log(`  categorias: ${cats.rows.length}`);
  console.log(`  mcc_catalogo: ${mccs.rows.length}`);
  console.log(`  reglas: ${reglas.rows.length}`);
  console.log(`  marcas_conocidas: ${marcas.rows.length}`);
  console.log(`  mcc_por_nombre: ${mccPN.rows.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
