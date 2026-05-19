// Reporte tabular de categorías con uso. Entregable para discusión con directorio.
//
// Uso: pnpm tsx scripts/categorias-report.ts [--csv]

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

const CSV = process.argv.includes('--csv');

const r = await db.execute(sql`
  SELECT cat.slug, cat.nombre, cat.descripcion, cat.activo,
    (SELECT count(*)::int FROM reglas WHERE categoria_id = cat.id) AS reglas,
    (SELECT count(*)::int FROM mcc_catalogo WHERE categoria_id = cat.id) AS mcc_catalogo,
    (SELECT count(*)::int FROM mcc_por_nombre WHERE categoria_id = cat.id) AS mcc_por_nombre,
    (SELECT count(*)::int FROM marcas_conocidas WHERE categoria_id = cat.id) AS marcas,
    (SELECT count(*)::int FROM movimientos WHERE categoria_predicha_id = cat.id) AS movs_predichos,
    (SELECT count(*)::int FROM categorias_alias WHERE categoria_id = cat.id) AS aliases,
    cat.reemplazada_por_id
  FROM categorias cat
  ORDER BY mcc_por_nombre DESC, cat.slug
`);

type Row = {
  slug: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  reglas: number;
  mcc_catalogo: number;
  mcc_por_nombre: number;
  marcas: number;
  movs_predichos: number;
  aliases: number;
  reemplazada_por_id: string | null;
};

const rows = r.rows as unknown as Row[];

if (CSV) {
  console.log('slug,nombre,activo,reglas,mcc_cat,mcc_nombre,marcas,movs,aliases,reemplazada');
  for (const x of rows) {
    console.log(
      [
        x.slug,
        JSON.stringify(x.nombre),
        x.activo,
        x.reglas,
        x.mcc_catalogo,
        x.mcc_por_nombre,
        x.marcas,
        x.movs_predichos,
        x.aliases,
        x.reemplazada_por_id ?? '',
      ].join(','),
    );
  }
  process.exit(0);
}

const totalCats = rows.length;
const activas = rows.filter((x) => x.activo).length;
const sinUso = rows.filter(
  (x) => x.activo && x.reglas + x.mcc_por_nombre + x.marcas + x.mcc_catalogo === 0,
);

console.log(`Categorías: ${totalCats} total · ${activas} activas · ${rows.length - activas} soft-deleted`);
console.log(`Sin uso (activas pero 0 refs): ${sinUso.length}`);
console.log('');
console.log(
  'Slug             | Nombre               | Act | Reglas | MCC_cat | MCC_nombre | Marcas | Aliases | Reemplazada',
);
console.log('─'.repeat(120));
for (const x of rows) {
  console.log(
    `${x.slug.padEnd(16)} | ${(x.nombre ?? '').padEnd(20)} | ${(x.activo ? 'sí' : 'NO').padEnd(3)} | ${String(x.reglas).padStart(6)} | ${String(x.mcc_catalogo).padStart(7)} | ${String(x.mcc_por_nombre).padStart(10)} | ${String(x.marcas).padStart(6)} | ${String(x.aliases).padStart(7)} | ${x.reemplazada_por_id ? 'sí' : ''}`,
  );
}
console.log('');
if (sinUso.length > 0) {
  console.log('Candidatas a borrar (sin refs):');
  console.log('  ' + sinUso.map((x) => x.slug).join(', '));
}
process.exit(0);
