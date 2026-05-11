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
  out.push('');
  out.push('BEGIN;');
  out.push('');

  // categorias
  const cats = await db.execute(sql`
    SELECT id, slug, nombre, descripcion, activo
    FROM categorias ORDER BY slug
  `);
  const catCols = ['id', 'slug', 'nombre', 'descripcion', 'activo'];
  out.push(`-- categorias (${cats.rows.length})`);
  out.push(
    `INSERT INTO categorias (${catCols.join(', ')}) VALUES`,
  );
  out.push(
    cats.rows.map((r) => values(r as Record<string, unknown>, catCols)).join(',\n'),
  );
  out.push(`ON CONFLICT (slug) DO NOTHING;`);
  out.push('');

  // mcc_catalogo
  const mccs = await db.execute(sql`
    SELECT cod_mcc, descripcion, categoria_id, ambiguo
    FROM mcc_catalogo ORDER BY cod_mcc
  `);
  const mccCols = ['cod_mcc', 'descripcion', 'categoria_id', 'ambiguo'];
  out.push(`-- mcc_catalogo (${mccs.rows.length})`);
  if (mccs.rows.length > 0) {
    out.push(`INSERT INTO mcc_catalogo (${mccCols.join(', ')}) VALUES`);
    out.push(
      mccs.rows.map((r) => values(r as Record<string, unknown>, mccCols)).join(',\n'),
    );
    out.push(`ON CONFLICT (cod_mcc) DO NOTHING;`);
  }
  out.push('');

  // patrones
  const pats = await db.execute(sql`
    SELECT id, tipo, valor, categoria_id, prioridad, descripcion, fuente, activo
    FROM patrones ORDER BY prioridad, valor
  `);
  const patCols = ['id', 'tipo', 'valor', 'categoria_id', 'prioridad', 'descripcion', 'fuente', 'activo'];
  out.push(`-- patrones (${pats.rows.length})`);
  if (pats.rows.length > 0) {
    out.push(`INSERT INTO patrones (${patCols.join(', ')}) VALUES`);
    out.push(
      pats.rows
        .map((r) => {
          const row = r as Record<string, unknown>;
          return (
            '(' +
            [
              esc(row.id),
              `${esc(row.tipo)}::patron_tipo`,
              esc(row.valor),
              esc(row.categoria_id),
              esc(row.prioridad),
              esc(row.descripcion),
              `${esc(row.fuente)}::patron_fuente`,
              esc(row.activo),
            ].join(', ') +
            ')'
          );
        })
        .join(',\n'),
    );
    out.push(`ON CONFLICT (tipo, valor, categoria_id) DO NOTHING;`);
  }
  out.push('');

  // marcas_conocidas
  const marcas = await db.execute(sql`
    SELECT id, marca, categoria_id, descripcion
    FROM marcas_conocidas ORDER BY marca
  `);
  const marcaCols = ['id', 'marca', 'categoria_id', 'descripcion'];
  out.push(`-- marcas_conocidas (${marcas.rows.length})`);
  if (marcas.rows.length > 0) {
    out.push(`INSERT INTO marcas_conocidas (${marcaCols.join(', ')}) VALUES`);
    out.push(
      marcas.rows.map((r) => values(r as Record<string, unknown>, marcaCols)).join(',\n'),
    );
    out.push(`ON CONFLICT (marca) DO NOTHING;`);
  }
  out.push('');

  out.push('COMMIT;');
  out.push('');

  const path = 'data/seed.sql';
  writeFileSync(path, out.join('\n'));
  console.log(`escrito ${path}`);
  console.log(`  categorias: ${cats.rows.length}`);
  console.log(`  mcc_catalogo: ${mccs.rows.length}`);
  console.log(`  patrones: ${pats.rows.length}`);
  console.log(`  marcas_conocidas: ${marcas.rows.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
