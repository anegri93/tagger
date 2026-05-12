import { readFileSync, existsSync } from 'node:fs';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const SEED_PATH = './data/seed.sql';

async function main(): Promise<void> {
  if (!existsSync(SEED_PATH)) {
    console.log(`[seed] ${SEED_PATH} no existe, skip`);
    return;
  }
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM categorias');
    if (rows[0] && rows[0].n > 0) {
      console.log(`[seed] categorias ya pobladas (${rows[0].n}), skip`);
      return;
    }
    const sql = readFileSync(SEED_PATH, 'utf8');
    console.log('[seed] loading data/seed.sql...');
    await pool.query(sql);
    console.log('[seed] done');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
