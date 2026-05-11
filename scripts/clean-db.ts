import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const apply = process.argv.includes('--apply');

  const plan = [
    { op: 'DROP', target: 'dataset_comercios' },
    { op: 'DROP', target: 'datasets' },
    { op: 'DROP', target: 'reglas_regex' },
    { op: 'TRUNCATE', target: 'correcciones_usuario' },
    { op: 'TRUNCATE', target: 'movimientos' },
    { op: 'TRUNCATE', target: 'comercios_catalogo' },
  ];

  console.log('Plan:');
  for (const p of plan) console.log(`  ${p.op.padEnd(10)} ${p.target}`);

  if (!apply) {
    console.log('\n(dry-run; agregá --apply para ejecutar)');
    process.exit(0);
  }

  console.log('\n>>> EJECUTANDO');

  // Order matters: TRUNCATE referenced tables first (CASCADE para FKs)
  await db.execute(sql`TRUNCATE TABLE correcciones_usuario CASCADE`);
  console.log('TRUNCATE correcciones_usuario');

  await db.execute(sql`TRUNCATE TABLE movimientos CASCADE`);
  console.log('TRUNCATE movimientos');

  await db.execute(sql`TRUNCATE TABLE comercios_catalogo CASCADE`);
  console.log('TRUNCATE comercios_catalogo');

  await db.execute(sql`DROP TABLE IF EXISTS dataset_comercios CASCADE`);
  console.log('DROP dataset_comercios');

  await db.execute(sql`DROP TABLE IF EXISTS datasets CASCADE`);
  console.log('DROP datasets');

  await db.execute(sql`DROP TABLE IF EXISTS reglas_regex CASCADE`);
  console.log('DROP reglas_regex');

  console.log('\nVerificación:');
  const r = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name
  `);
  for (const x of r.rows as Array<{ table_name: string }>) {
    const c = await db.execute(sql.raw(`SELECT count(*)::int AS c FROM "${x.table_name}"`));
    const cnt = (c.rows[0] as { c: number }).c;
    console.log(`  ${x.table_name.padEnd(30)} rows=${cnt}`);
  }
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
