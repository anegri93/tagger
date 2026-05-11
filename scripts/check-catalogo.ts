import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const r = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE categoria_id IS NOT NULL)::int AS con_cat,
      count(*) FILTER (WHERE categoria_id IS NULL)::int AS sin_cat,
      count(*) FILTER (WHERE recategorizado_at IS NOT NULL)::int AS recat,
      count(*) FILTER (WHERE categoria_nueva_id IS NOT NULL)::int AS con_cat_nueva,
      max(updated_at) AS last_update,
      max(recategorizado_at) AS last_recat
    FROM comercios_catalogo
  `);
  console.log(JSON.stringify(r.rows[0], null, 2));

  const byFuente = await db.execute(sql`
    SELECT fuente_categoria, count(*)::int AS c FROM comercios_catalogo
    GROUP BY fuente_categoria ORDER BY c DESC
  `);
  console.log('\npor fuente:');
  for (const x of byFuente.rows as Array<{ fuente_categoria: string | null; c: number }>) {
    console.log(`  ${(x.fuente_categoria ?? 'NULL').padEnd(15)} ${x.c.toLocaleString()}`);
  }

  const byFuenteNueva = await db.execute(sql`
    SELECT fuente_nueva, count(*)::int AS c FROM comercios_catalogo
    WHERE recategorizado_at IS NOT NULL
    GROUP BY fuente_nueva ORDER BY c DESC
  `);
  console.log('\npor fuente_nueva (último recat):');
  for (const x of byFuenteNueva.rows as Array<{ fuente_nueva: string | null; c: number }>) {
    console.log(`  ${(x.fuente_nueva ?? 'NULL').padEnd(15)} ${x.c.toLocaleString()}`);
  }
  process.exit(0);
}
main();
