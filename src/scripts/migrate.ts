import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env.js';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);
  console.log('[migrate] applying migrations...');
  await migrate(db, { migrationsFolder: './dist/migrations' });
  console.log('[migrate] done');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
