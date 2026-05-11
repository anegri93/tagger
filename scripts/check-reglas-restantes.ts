import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const r = await db.execute(sql`
    SELECT r.id, r.patron, r.prioridad, r.activo, r.descripcion, c.slug
    FROM reglas_regex r
    JOIN categorias c ON c.id = r.categoria_id
    LEFT JOIN patrones p ON p.tipo = 'regex'::patron_tipo AND p.valor = r.patron
    WHERE p.id IS NULL
    ORDER BY c.slug, r.patron
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
}
main();
