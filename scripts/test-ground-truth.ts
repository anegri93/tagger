import 'dotenv/config';
import { createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Args {
  groundTruthBatchId: string;
  testBatchId: string;
  baseUrl: string;
  apiKey: string;
  concurrency: number;
  limit: number | null;
  soloNombre: boolean;
  bypassCatalogo: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, def?: string): string | undefined => {
    const idx = argv.indexOf(`--${k}`);
    if (idx === -1) return def;
    return argv[idx + 1];
  };
  const has = (k: string): boolean => argv.includes(`--${k}`);
  const gt = get('ground-truth-batch', 'datamayo-2026-05')!;
  const limitArg = get('limit');
  const mode = has('solo-nombre') ? 'realista' : 'full';
  return {
    groundTruthBatchId: gt,
    testBatchId: get('test-batch-id', `${gt}-${mode}-${new Date().toISOString().slice(0, 10)}`)!,
    baseUrl: get('base-url', 'http://localhost:3000')!,
    apiKey: get('api-key', process.env.API_KEY ?? '')!,
    concurrency: Number(get('concurrency', '20')),
    limit: limitArg ? Number(limitArg) : null,
    soloNombre: has('solo-nombre'),
    bypassCatalogo: has('bypass-catalogo'),
  };
}

interface Row {
  nombre: string;
  bancard_id: string | null;
  codigo_comercio: string | null;
  mcc: string | null;
}

interface Result {
  ok: boolean;
  status: number;
  latency_ms: number;
  body: Record<string, unknown> | null;
  error: string | null;
  request: Record<string, unknown>;
}

async function postOne(args: Args, row: Row): Promise<Result> {
  const t0 = Date.now();
  const reqBody: Record<string, unknown> = {
    nombre_bancard: row.nombre,
    origen: 'ground_truth_test',
    batch_id: args.testBatchId,
  };
  if (!args.soloNombre) {
    if (row.bancard_id) reqBody.bancard_id = row.bancard_id;
    if (row.codigo_comercio) reqBody.codigo_comercio = row.codigo_comercio;
    if (row.mcc) reqBody.mcc = row.mcc;
  }
  if (args.bypassCatalogo) reqBody.bypass_catalogo = true;
  try {
    const res = await fetch(`${args.baseUrl}/categorizar-movimiento`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': args.apiKey },
      body: JSON.stringify(reqBody),
    });
    const text = await res.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
    return {
      ok: res.ok,
      status: res.status,
      latency_ms: Date.now() - t0,
      body,
      error: res.ok ? null : ((body?.error as string) ?? `http_${res.status}`),
      request: reqBody,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - t0,
      body: null,
      error: e instanceof Error ? e.message : 'unknown',
      request: reqBody,
    };
  }
}

async function runConcurrent(
  rows: Row[],
  args: Args,
  onResult: (r: Result) => void,
): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: args.concurrency }, async () => {
    while (true) {
      const i = idx++;
      if (i >= rows.length) return;
      const r = await postOne(args, rows[i]!);
      onResult(r);
    }
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.apiKey) {
    console.error('Falta API_KEY (env o --api-key)');
    process.exit(1);
  }
  console.log(`ground_truth_batch_id: ${args.groundTruthBatchId}`);
  console.log(`test_batch_id: ${args.testBatchId}`);
  console.log(`base_url: ${args.baseUrl}`);
  console.log(`concurrency: ${args.concurrency}`);
  console.log(`solo_nombre: ${args.soloNombre}, bypass_catalogo: ${args.bypassCatalogo}`);

  const limitClause = args.limit ? sql`LIMIT ${args.limit}` : sql``;
  const result = await db.execute(sql`
    SELECT nombre, bancard_id, codigo_comercio, mcc
    FROM test_ground_truth
    WHERE batch_id = ${args.groundTruthBatchId}
    ORDER BY cantidad DESC NULLS LAST
    ${limitClause}
  `);
  const rows = result.rows as Row[];
  console.log(`rows a procesar: ${rows.length}`);

  const outPath = resolve(root, `data/test-results-${args.testBatchId}.ndjson`);
  const out = createWriteStream(outPath);
  let total = 0;
  let ok = 0;
  let err = 0;
  const fuentes: Record<string, number> = {};
  const t0 = Date.now();

  const onResult = (r: Result): void => {
    total++;
    if (r.ok) {
      ok++;
      const f = (r.body?.fuente as string) ?? 'unknown';
      fuentes[f] = (fuentes[f] ?? 0) + 1;
    } else {
      err++;
    }
    out.write(JSON.stringify(r) + '\n');
    if (total % 250 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rps = (total / elapsed).toFixed(1);
      console.log(`progreso ${total}/${rows.length} (ok ${ok} err ${err}) — ${rps} req/s`);
    }
  };

  await runConcurrent(rows, args, onResult);

  out.end();
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\n=== Done ===`);
  console.log(`total: ${total}, ok: ${ok}, err: ${err}`);
  console.log(`elapsed: ${elapsed.toFixed(1)}s, rps: ${(total / elapsed).toFixed(1)}`);
  console.log(`fuentes:`, fuentes);
  console.log(`output: ${outPath}`);
  console.log(`\nNext: curl localhost:3000/test-batch/${args.testBatchId}/agreement`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
