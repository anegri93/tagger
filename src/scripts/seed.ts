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
    // Skip solo si todas las tablas base están pobladas.
    // Si falta alguna (ej: tabla nueva agregada al seed), correr — es idempotente vía ON CONFLICT.
    const { rows } = await pool.query<{ cats: number; comercios: number }>(`
      SELECT
        (SELECT COUNT(*)::int FROM categorias) AS cats,
        (SELECT COUNT(*)::int FROM comercios_catalogo WHERE bancard_id IS NULL AND codigo_comercio IS NULL) AS comercios
    `);
    const r = rows[0];
    if (r && r.cats > 0 && r.comercios > 0) {
      console.log(`[seed] ya poblado (categorias=${r.cats}, comercios=${r.comercios}), skip`);
      return;
    }
    const sql = readFileSync(SEED_PATH, 'utf8');
    console.log(`[seed] loading data/seed.sql (categorias=${r?.cats ?? 0}, comercios=${r?.comercios ?? 0})...`);
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
