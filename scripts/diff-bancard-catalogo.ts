import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

/**
 * Hallazgo previo: NO existe tabla "bancard" separada. Las 3 capas
 * (catalogo, bancard, comercio) leen TODAS de `comercios_catalogo`.
 *
 * - catalogo: lookup por (bancard_id, codigo_comercio).
 * - bancard:  lookup por nombre_bancard exacto.
 * - comercio: fuzzy LIKE por nombre_normalizado.
 *
 * Este script mide cuántos comercios fuente_categoria='bancard' existen,
 * y si esos casos podrían resolverse por las otras capas.
 */
async function main() {
  const total = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE fuente_categoria = 'bancard')::int AS bancard,
      count(*) FILTER (WHERE fuente_nueva = 'bancard')::int AS bancard_nueva
    FROM comercios_catalogo
  `);
  console.log('Conteos comercios_catalogo:');
  console.log(JSON.stringify(total.rows[0], null, 2));

  // Movimientos por fuente histórica
  const movs = await db.execute(sql`
    SELECT fuente_categoria, count(*)::int AS c
    FROM movimientos
    WHERE fuente_categoria IS NOT NULL
    GROUP BY fuente_categoria
    ORDER BY c DESC
  `);
  console.log('\nMovimientos por fuente:');
  for (const r of movs.rows as Array<{ fuente_categoria: string; c: number }>) {
    console.log(`  ${r.fuente_categoria.padEnd(15)} ${r.c.toLocaleString()}`);
  }
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
