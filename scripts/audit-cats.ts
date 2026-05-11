import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const r = await db.execute(sql`
    SELECT c.slug, c.nombre,
      (SELECT count(*) FROM patrones WHERE categoria_id = c.id)::int AS patrones,
      (SELECT count(*) FROM mcc_catalogo WHERE categoria_id = c.id)::int AS mccs,
      (SELECT count(*) FROM comercios_catalogo WHERE categoria_id = c.id)::int AS comercios
    FROM categorias c
    ORDER BY c.slug
  `);
  console.log(`slug                pat  mcc  comercios`);
  console.log('-'.repeat(50));
  for (const c of r.rows as Array<{ slug: string; nombre: string; patrones: number; mccs: number; comercios: number }>) {
    const cold = c.patrones === 0 && c.mccs === 0 && c.comercios === 0;
    console.log(`${cold ? '⚠️ ' : '   '}${c.slug.padEnd(18)} ${String(c.patrones).padStart(3)}  ${String(c.mccs).padStart(3)}  ${String(c.comercios).padStart(6)}`);
  }
  process.exit(0);
}
main();
