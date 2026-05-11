import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const r = await db.execute(sql`SELECT count(*)::int AS c FROM reglas_regex`);
  console.log('reglas_regex:', (r.rows[0] as {c:number}).c);
  const p = await db.execute(sql`SELECT count(*)::int AS c FROM patrones WHERE tipo='regex'::patron_tipo`);
  console.log('patrones tipo=regex:', (p.rows[0] as {c:number}).c);
  const overlap = await db.execute(sql`
    SELECT count(*)::int AS c FROM reglas_regex r
    JOIN patrones p ON p.tipo='regex'::patron_tipo AND p.valor = r.patron
  `);
  console.log('overlap (mismo patrón en ambas):', (overlap.rows[0] as {c:number}).c);
  process.exit(0);
}
main();
