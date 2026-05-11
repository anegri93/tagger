import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

/**
 * Mide aporte real capa `comercio` (fuzzy nombre).
 *
 * Mediciones:
 * 1. Comercios actualmente con fuente='nombre' en comercios_catalogo.
 * 2. Movimientos históricos con fuente='nombre' en movimientos.
 * 3. Simulación: cuántos del recat reciente fueron resueltos por capa comercio.
 */
async function main() {
  // 1. Catálogo actual
  const cat = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE fuente_categoria = 'nombre')::int AS fuente_nombre,
      count(*) FILTER (WHERE fuente_nueva = 'nombre')::int AS nueva_nombre,
      count(*)::int AS total
    FROM comercios_catalogo
  `);
  console.log('comercios_catalogo:');
  console.log(JSON.stringify(cat.rows[0], null, 2));

  // 2. Movimientos
  const mov = await db.execute(sql`
    SELECT fuente_categoria, count(*)::int AS c
    FROM movimientos
    WHERE fuente_categoria IS NOT NULL
    GROUP BY fuente_categoria
    ORDER BY c DESC
  `);
  console.log('\nmovimientos por fuente:');
  for (const r of mov.rows as Array<{ fuente_categoria: string; c: number }>) {
    console.log(`  ${r.fuente_categoria.padEnd(15)} ${r.c.toLocaleString().padStart(8)}`);
  }

  // 3. Aporte exclusivo: comercios donde fuente_nueva='nombre' (la capa comercio resolvió)
  const exclusivo = await db.execute(sql`
    SELECT count(*)::int AS c
    FROM comercios_catalogo
    WHERE fuente_nueva = 'nombre'
  `);
  console.log(`\ncomercios donde capa comercio resolvió: ${(exclusivo.rows[0] as { c: number }).c}`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
