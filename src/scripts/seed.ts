import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const SEED_PATH = './data/seed.sql';

async function main(): Promise<void> {
  if (!existsSync(SEED_PATH)) {
    console.log(`[seed] ${SEED_PATH} no existe, skip`);
    return;
  }

  const sqlText = readFileSync(SEED_PATH, 'utf8');
  const hash = createHash('sha256').update(sqlText).digest('hex').slice(0, 16);
  const strategy = process.env.SEED_STRATEGY ?? 'auto';

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    // Tabla de metadata para tracking del último seed aplicado.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seed_metadata (
        id int PRIMARY KEY DEFAULT 1,
        hash text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT seed_metadata_singleton CHECK (id = 1)
      )
    `);

    const { rows: metaRows } = await pool.query<{ hash: string }>(
      `SELECT hash FROM seed_metadata WHERE id = 1`,
    );
    const lastHash = metaRows[0]?.hash;

    // Estrategias:
    //   'always'       → siempre corre (útil testing local)
    //   'never'        → nunca corre (seed manual)
    //   'auto'         → corre si hash cambió o DB está vacía (default)
    //   'skip-poblado' → corre solo si DB vacía (modo conservador legacy)
    let shouldRun = false;
    if (strategy === 'always') {
      shouldRun = true;
      console.log('[seed] strategy=always, forzando corrida');
    } else if (strategy === 'never') {
      shouldRun = false;
      console.log('[seed] strategy=never, skip');
    } else if (strategy === 'skip-poblado') {
      const { rows } = await pool.query<{ cats: number }>(
        `SELECT (SELECT COUNT(*)::int FROM categorias) AS cats`,
      );
      shouldRun = (rows[0]?.cats ?? 0) === 0;
      console.log(
        `[seed] strategy=skip-poblado, ${shouldRun ? 'corriendo (DB vacía)' : 'skip (poblado)'}`,
      );
    } else {
      // auto: corre si hash cambió o DB vacía
      const { rows } = await pool.query<{ cats: number }>(
        `SELECT (SELECT COUNT(*)::int FROM categorias) AS cats`,
      );
      const vacia = (rows[0]?.cats ?? 0) === 0;
      const cambio = lastHash !== hash;
      shouldRun = vacia || cambio;
      console.log(
        `[seed] strategy=auto, hash=${hash} last=${lastHash ?? '(ninguno)'} vacia=${vacia} cambio=${cambio} → ${shouldRun ? 'CORRER' : 'skip'}`,
      );
    }

    if (!shouldRun) return;

    console.log(`[seed] aplicando data/seed.sql...`);
    await pool.query(sqlText);
    await pool.query(
      `INSERT INTO seed_metadata (id, hash, applied_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET hash = excluded.hash, applied_at = excluded.applied_at`,
      [hash],
    );
    console.log(`[seed] done · hash registrado: ${hash}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
