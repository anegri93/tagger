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
  out.push(`INSERT INTO categorias (${catCols.join(', ')}) VALUES`);
  out.push(cats.rows.map((r) => values(r as Record<string, unknown>, catCols)).join(',\n'));
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
    out.push(mccs.rows.map((r) => values(r as Record<string, unknown>, mccCols)).join(',\n'));
    out.push(`ON CONFLICT (cod_mcc) DO NOTHING;`);
  }
  out.push('');

  // patrones
  const pats = await db.execute(sql`
    SELECT id, tipo, valor, categoria_id, prioridad, descripcion, fuente, activo
    FROM patrones ORDER BY prioridad, valor
  `);
  const patCols = [
    'id',
    'tipo',
    'valor',
    'categoria_id',
    'prioridad',
    'descripcion',
    'fuente',
    'activo',
  ];
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
    out.push(marcas.rows.map((r) => values(r as Record<string, unknown>, marcaCols)).join(',\n'));
    out.push(`ON CONFLICT (marca) DO NOTHING;`);
  }
  out.push('');

  // comercios_catalogo (solo filas sin bancard_id/codigo_comercio — catálogo cargado desde sheet)
  const comercios = await db.execute(sql`
    SELECT nombre, nombre_normalizado, mcc, mcc_original, categoria_id,
           fuente_categoria, confianza, requiere_revision, mcc_inferido
    FROM comercios_catalogo
    WHERE bancard_id IS NULL AND codigo_comercio IS NULL
    ORDER BY nombre_normalizado
  `);
  out.push(`-- comercios_catalogo (${comercios.rows.length}) — solo filas sin bancard_id`);
  if (comercios.rows.length > 0) {
    const BATCH = 1000;
    const rows = comercios.rows as Array<Record<string, unknown>>;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      out.push(
        `INSERT INTO comercios_catalogo (nombre, nombre_normalizado, bancard_id, codigo_comercio, mcc, mcc_original, categoria_id, fuente_categoria, confianza, requiere_revision, mcc_inferido) VALUES`,
      );
      out.push(
        chunk
          .map(
            (r) =>
              '(' +
              [
                esc(r.nombre),
                esc(r.nombre_normalizado),
                'NULL',
                'NULL',
                esc(r.mcc),
                esc(r.mcc_original),
                esc(r.categoria_id),
                `${esc(r.fuente_categoria)}::fuente_categoria`,
                esc(r.confianza),
                esc(r.requiere_revision),
                esc(r.mcc_inferido),
              ].join(', ') +
              ')',
          )
          .join(',\n'),
      );
      out.push(
        `ON CONFLICT (nombre_normalizado) WHERE bancard_id IS NULL AND codigo_comercio IS NULL DO NOTHING;`,
      );
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
  console.log(`  patrones: ${pats.rows.length}`);
  console.log(`  marcas_conocidas: ${marcas.rows.length}`);
  console.log(`  comercios_catalogo: ${comercios.rows.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
