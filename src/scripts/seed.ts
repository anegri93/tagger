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
    const { rows } = await pool.query<{ cats: number; mcc_pn: number }>(`
      SELECT
        (SELECT COUNT(*)::int FROM categorias) AS cats,
        (SELECT COUNT(*)::int FROM mcc_por_nombre) AS mcc_pn
    `);
    const r = rows[0];
    if (r && r.cats > 0 && r.mcc_pn > 0) {
      console.log(`[seed] ya poblado (categorias=${r.cats}, mcc_por_nombre=${r.mcc_pn}), skip`);
      return;
    }
    const sql = readFileSync(SEED_PATH, 'utf8');
    console.log(`[seed] loading data/seed.sql (categorias=${r?.cats ?? 0}, mcc_por_nombre=${r?.mcc_pn ?? 0})...`);
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
