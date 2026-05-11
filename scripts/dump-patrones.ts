import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const r = await db.execute(sql`
    SELECT p.id, p.tipo, p.valor, p.prioridad, p.activo, p.fuente, p.descripcion, c.slug
    FROM patrones p JOIN categorias c ON c.id = p.categoria_id
    ORDER BY c.slug, p.tipo, p.valor
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
}
main();
