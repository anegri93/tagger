import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';

interface Args {
  batchId: string;
  baseUrl: string;
  apiKey: string;
  concurrency: number;
  bypassCatalogo: boolean;
  limit: number | null;
  soloPendientes: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, def?: string): string | undefined => {
    const idx = argv.indexOf(`--${k}`);
    if (idx === -1) return def;
    return argv[idx + 1];
  };
  const has = (k: string): boolean => argv.includes(`--${k}`);
  const batchId = get('batch-id');
  if (!batchId) {
    console.error('Falta --batch-id');
    process.exit(1);
  }
  const limit = get('limit');
  return {
    batchId,
    baseUrl: get('base-url', 'http://localhost:3000')!,
    apiKey: get('api-key', process.env.API_KEY ?? '')!,
    concurrency: Number(get('concurrency', '4')),
    bypassCatalogo: has('bypass-catalogo'),
    limit: limit ? Number(limit) : null,
    soloPendientes: !has('todos'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.apiKey) {
    console.error('Falta API_KEY');
    process.exit(1);
  }
  console.log(`batch_id: ${args.batchId}`);
  console.log(`solo_pendientes: ${args.soloPendientes}`);
  console.log(`bypass_catalogo: ${args.bypassCatalogo}`);
  console.log(`concurrency: ${args.concurrency}`);

  const filterPendiente = args.soloPendientes
    ? sql`AND fuente_categoria IS NULL`
    : sql``;
  const limitClause = args.limit ? sql`LIMIT ${args.limit}` : sql``;
  const res = await db.execute(sql`
    SELECT id FROM movimientos
    WHERE batch_id = ${args.batchId} ${filterPendiente}
    ORDER BY created_at ASC
    ${limitClause}
  `);
  const ids = (res.rows as Array<{ id: string }>).map((r) => r.id);
  console.log(`a reprocesar: ${ids.length}`);
  if (ids.length === 0) {
    await pool.end();
    return;
  }

  let processed = 0;
  let okCount = 0;
  let errCount = 0;
  const fuentes: Record<string, number> = {};
  let iaDisparadas = 0;
  const t0 = Date.now();

  async function postOne(id: string): Promise<void> {
    try {
      const res = await fetch(`${args.baseUrl}/movimientos/${id}/reprocesar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': args.apiKey },
        body: JSON.stringify({ bypass_catalogo: args.bypassCatalogo }),
      });
      if (!res.ok) {
        errCount++;
        return;
      }
      const body = (await res.json()) as { fuente: string | null; ia_disparada: boolean };
      okCount++;
      const f = body.fuente ?? 'pendiente_ia';
      fuentes[f] = (fuentes[f] ?? 0) + 1;
      if (body.ia_disparada) iaDisparadas++;
    } catch {
      errCount++;
    } finally {
      processed++;
      if (processed % 200 === 0 || processed === ids.length) {
        const elapsed = (Date.now() - t0) / 1000;
        const rps = (processed / elapsed).toFixed(1);
        console.log(
          `progreso ${processed}/${ids.length} (ok ${okCount} err ${errCount}) — ${rps} req/s`,
        );
      }
    }
  }

  let idx = 0;
  const workers = Array.from({ length: args.concurrency }, async () => {
    while (true) {
      const i = idx++;
      if (i >= ids.length) return;
      await postOne(ids[i]!);
    }
  });
  await Promise.all(workers);

  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\n=== Done ===`);
  console.log(`total: ${processed}, ok: ${okCount}, err: ${errCount}`);
  console.log(`ia disparadas: ${iaDisparadas}`);
  console.log(`fuentes:`, fuentes);
  console.log(`elapsed: ${elapsed.toFixed(1)}s`);
  console.log(`\nIA fallback async sigue procesando. Verificar con SQL:`);
  console.log(
    `  SELECT fuente_categoria, COUNT(*) FROM movimientos WHERE batch_id='${args.batchId}' GROUP BY fuente_categoria;`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
