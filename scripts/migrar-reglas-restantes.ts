import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const apply = process.argv.includes('--apply');

  const viejo = '\\b(PANADERIA|HELADERIA|CONFITERIA|RESTAURANT|PIZZERIA|HAMBURG|PARRILLA|LOMITERIA)\\b';
  const nuevo = '\\b(PANADERIA|HELADERIA|CONFITERIA|RESTAURANT|PIZZERIA|HAMBURG|PARRILLA|LOMITERIA|CAFE|PIZZA)\\b';

  const r = await db.execute(sql`
    SELECT p.id, p.valor, c.slug
    FROM patrones p JOIN categorias c ON c.id = p.categoria_id
    WHERE p.tipo = 'regex'::patron_tipo AND p.valor = ${viejo} AND c.slug = 'restaurante'
  `);
  console.log('patrón existente:', r.rows);
  console.log('valor nuevo:', nuevo);

  if (!apply) {
    console.log('\n(dry-run; agregá --apply para ejecutar)');
    process.exit(0);
  }

  const upd = await db.execute(sql`
    UPDATE patrones SET valor = ${nuevo}, updated_at = now()
    FROM categorias c
    WHERE patrones.categoria_id = c.id
      AND patrones.tipo = 'regex'::patron_tipo
      AND patrones.valor = ${viejo}
      AND c.slug = 'restaurante'
  `);
  console.log('actualizados:', upd.rowCount);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
