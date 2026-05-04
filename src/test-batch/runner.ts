import { readCsvStream } from '../db/loaders/csv.js';
import { ejecutarCascada, type CapasSincrono } from '../pipeline/categorizar.js';
import {
  persistirMovimiento,
  type MovimientoRepository,
} from '../pipeline/persistir.js';
import type { MovimientoInput } from '../domain/types.js';

export type BatchStatus = 'queued' | 'running' | 'done' | 'cancelled' | 'error';

export interface BatchOpts {
  files?: string[];
  limit?: number;
  concurrency?: number;
}

export interface BatchInfo {
  batchId: string;
  status: BatchStatus;
  total: number;
  processed: number;
  ok: number;
  errors: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorMsg: string | null;
  files: string[];
  limit: number | null;
  concurrency: number;
}

interface RawRow extends Record<string, string> {
  Nombre: string;
  BancardId: string;
  CodigoComercio: string;
  MCC: string;
}

const DEFAULT_FILES = [
  'data/comercios-bancard-staged.tsv',
  'data/mango-p2p.tsv',
];
const MCC_INVALID = new Set(['', 'SIN RUBRO', 'null', 'NULL', 'N/A', 'NA']);

function cleanMcc(v: string): string | undefined {
  const t = v?.trim() ?? '';
  if (!t) return undefined;
  if (MCC_INVALID.has(t)) return undefined;
  return t;
}

export interface RunnerDeps {
  capas: CapasSincrono;
  repo: MovimientoRepository;
}

export class TestBatchRunner {
  private active = new Map<string, { info: BatchInfo; abort: AbortController }>();

  constructor(private deps: RunnerDeps) {}

  list(): BatchInfo[] {
    return [...this.active.values()].map((v) => v.info);
  }

  get(batchId: string): BatchInfo | null {
    return this.active.get(batchId)?.info ?? null;
  }

  async start(batchId: string, opts: BatchOpts = {}): Promise<BatchInfo> {
    const existing = this.active.get(batchId);
    if (existing && existing.info.status === 'running') {
      throw new Error(`batch ${batchId} ya está running`);
    }
    const abort = new AbortController();
    const info: BatchInfo = {
      batchId,
      status: 'queued',
      total: 0,
      processed: 0,
      ok: 0,
      errors: 0,
      startedAt: null,
      finishedAt: null,
      errorMsg: null,
      files: opts.files ?? DEFAULT_FILES,
      limit: opts.limit ?? null,
      concurrency: opts.concurrency ?? 30,
    };
    this.active.set(batchId, { info, abort });
    void this.run(batchId).catch((err) => {
      info.status = 'error';
      info.errorMsg = err instanceof Error ? err.message : String(err);
      info.finishedAt = Date.now();
    });
    return info;
  }

  stop(batchId: string): boolean {
    const entry = this.active.get(batchId);
    if (!entry) return false;
    if (entry.info.status !== 'running' && entry.info.status !== 'queued') return false;
    entry.abort.abort();
    return true;
  }

  private async run(batchId: string): Promise<void> {
    const entry = this.active.get(batchId);
    if (!entry) return;
    const { info, abort } = entry;
    info.status = 'running';
    info.startedAt = Date.now();

    const concurrency = info.concurrency;
    const limit = info.limit;

    let active = 0;
    const queue: RawRow[] = [];
    let done = false;
    const waiters: Array<() => void> = [];

    const processOne = async (row: RawRow): Promise<void> => {
      const t0 = Date.now();
      try {
        const input: MovimientoInput = {
          nombreBancard: row.Nombre || undefined,
          bancardId: row.BancardId || undefined,
          codigoComercio: row.CodigoComercio || undefined,
          mcc: cleanMcc(row.MCC),
          rawInput: row,
        };
        const pipeline = await ejecutarCascada(input, this.deps.capas);
        const latencyMs = Date.now() - t0;
        await persistirMovimiento(input, pipeline, this.deps.repo, {
          origen: 'test_masivo',
          batchId,
          latencyMs,
        });
        info.ok++;
      } catch {
        info.errors++;
      }
      info.processed++;
    };

    const worker = async (): Promise<void> => {
      while (!abort.signal.aborted) {
        const row = queue.shift();
        if (!row) {
          if (done) return;
          await new Promise<void>((r) => waiters.push(r));
          continue;
        }
        await processOne(row);
      }
    };

    const wakeWorkers = (): void => {
      while (waiters.length > 0) {
        const w = waiters.shift();
        if (w) w();
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());

    try {
      outer: for (const file of info.files) {
        for await (const row of readCsvStream<RawRow>(file)) {
          if (abort.signal.aborted) break outer;
          if (limit !== null && info.total >= limit) break outer;
          info.total++;
          queue.push(row);
          if (queue.length > concurrency * 4) {
            // backpressure: dejá que workers consuman
            wakeWorkers();
            while (queue.length > concurrency * 2 && !abort.signal.aborted) {
              await new Promise((r) => setTimeout(r, 5));
            }
          } else {
            wakeWorkers();
          }
          active++;
        }
      }
    } finally {
      done = true;
      wakeWorkers();
      await Promise.all(workers);
      void active;
      info.status = abort.signal.aborted ? 'cancelled' : 'done';
      info.finishedAt = Date.now();
    }
  }
}
