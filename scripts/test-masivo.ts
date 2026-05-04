import 'dotenv/config';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Args {
  files: string[];
  baseUrl: string;
  apiKey: string;
  concurrency: number;
  limit: number | null;
  batchId: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, def?: string): string | undefined => {
    const idx = argv.indexOf(`--${k}`);
    if (idx === -1) return def;
    return argv[idx + 1];
  };
  const filesArg = get('files', 'data/comercios-bancard-staged.tsv,data/mango-p2p.tsv');
  const files = (filesArg ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  const limitArg = get('limit');
  return {
    files,
    baseUrl: get('base-url', 'http://localhost:3000') ?? 'http://localhost:3000',
    apiKey: get('api-key', process.env.API_KEY ?? '') ?? '',
    concurrency: Number(get('concurrency', '30')),
    limit: limitArg ? Number(limitArg) : null,
    batchId: get('batch-id', `baseline-${new Date().toISOString().replace(/[:.]/g, '-')}`)!,
  };
}

interface RawRow {
  Nombre: string;
  BancardId: string;
  CodigoComercio: string;
  MCC: string;
}

async function* readRows(file: string): AsyncGenerator<RawRow> {
  const path = resolve(root, file);
  if (!existsSync(path)) {
    console.error(`[skip] ${file} no existe`);
    return;
  }
  const parser = createReadStream(path).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: '\t',
      relax_quotes: true,
      relax_column_count: true,
    }),
  );
  for await (const record of parser) {
    yield record as RawRow;
  }
}

interface Result {
  ok: boolean;
  status: number;
  latency_ms: number;
  body: Record<string, unknown> | null;
  error: string | null;
  request: { nombre_bancard: string; bancard_id: string; codigo_comercio: string; mcc: string };
}

async function postOne(args: Args, row: RawRow): Promise<Result> {
  const t0 = Date.now();
  const reqBody: Record<string, unknown> = {
    nombre_bancard: row.Nombre,
    bancard_id: row.BancardId,
    codigo_comercio: row.CodigoComercio,
    origen: 'test_masivo',
    batch_id: args.batchId,
  };
  if (row.MCC) reqBody.mcc = row.MCC;
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
      error: res.ok ? null : (body?.error as string) ?? `http_${res.status}`,
      request: {
        nombre_bancard: row.Nombre,
        bancard_id: row.BancardId,
        codigo_comercio: row.CodigoComercio,
        mcc: row.MCC,
      },
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - t0,
      body: null,
      error: e instanceof Error ? e.message : 'unknown',
      request: {
        nombre_bancard: row.Nombre,
        bancard_id: row.BancardId,
        codigo_comercio: row.CodigoComercio,
        mcc: row.MCC,
      },
    };
  }
}

async function runConcurrent<T>(
  iter: AsyncIterable<RawRow>,
  worker: (row: RawRow) => Promise<T>,
  concurrency: number,
  onResult: (r: T) => void,
  limit: number | null,
): Promise<number> {
  let processed = 0;
  let active = 0;
  let done = false;
  const iterator = iter[Symbol.asyncIterator]();

  return new Promise((resolveP, rejectP) => {
    const launch = (): void => {
      while (active < concurrency && !done) {
        active++;
        iterator
          .next()
          .then(async ({ value, done: d }) => {
            if (d || (limit !== null && processed >= limit)) {
              done = true;
              active--;
              if (active === 0) resolveP(processed);
              return;
            }
            processed++;
            try {
              const r = await worker(value);
              onResult(r);
            } catch (e) {
              rejectP(e);
              return;
            }
            active--;
            launch();
          })
          .catch(rejectP);
      }
      if (done && active === 0) resolveP(processed);
    };
    launch();
  });
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.apiKey) {
    console.error('Falta API_KEY (env o --api-key)');
    process.exit(1);
  }
  console.log(`batch_id: ${args.batchId}`);
  console.log(`base_url: ${args.baseUrl}`);
  console.log(`concurrency: ${args.concurrency}`);
  console.log(`files: ${args.files.join(', ')}`);
  if (args.limit) console.log(`limit: ${args.limit}`);

  const outPath = resolve(root, `data/test-results-${args.batchId}.ndjson`);
  const out = createWriteStream(outPath);

  let total = 0;
  let ok = 0;
  let err = 0;
  const t0 = Date.now();

  const onResult = (r: Result): void => {
    total++;
    if (r.ok) ok++;
    else err++;
    out.write(JSON.stringify(r) + '\n');
    if (total % 5000 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rps = (total / elapsed).toFixed(1);
      console.log(`progreso ${total} (ok ${ok} err ${err}) — ${rps} req/s`);
    }
  };

  for (const file of args.files) {
    if (args.limit !== null && total >= args.limit) break;
    await runConcurrent(
      readRows(file),
      (row) => postOne(args, row),
      args.concurrency,
      onResult,
      args.limit,
    );
  }

  out.end();
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\n=== Done ===`);
  console.log(`total: ${total}, ok: ${ok}, err: ${err}`);
  console.log(`elapsed: ${elapsed.toFixed(1)}s, rps: ${(total / elapsed).toFixed(1)}`);
  console.log(`output: ${outPath}`);
  console.log(`\nNext: node scripts/analyze-test-batch.mjs ${args.batchId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
