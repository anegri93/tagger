import { sql } from 'drizzle-orm';
import { readCsvStream } from '../db/loaders/csv.js';
import { ejecutarCascada, type CapasSincrono } from '../pipeline/categorizar.js';
import {
  persistirMovimiento,
  type MovimientoRepository,
} from '../pipeline/persistir.js';
import type { MovimientoInput } from '../domain/types.js';
import type { Db } from '../db/client.js';

export type BatchStatus = 'queued' | 'running' | 'done' | 'cancelled' | 'error';

export interface BatchOpts {
  files?: string[];
  limit?: number;
  concurrency?: number;
  bypassCatalogo?: boolean;
  /** 'tsv' (default), 'catalogo', o 'datasets:<slug>' */
  source?: string;
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
  bypassCatalogo: boolean;
  source: string;
}

interface RawRow extends Record<string, string> {
  Nombre: string;
  BancardId: string;
  CodigoComercio: string;
  MCC: string;
}

interface SourceRow {
  raw: RawRow;
  /** Si la row viene de DB, su id + tabla destino para writeback */
  writeback?: { table: 'comercios_catalogo' | 'dataset_comercios'; id: string };
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
  db?: Db;
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
      bypassCatalogo: opts.bypassCatalogo === true,
      source: opts.source ?? 'tsv',
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

  private async *streamRows(info: BatchInfo): AsyncGenerator<SourceRow> {
    const src = info.source;
    if (src === 'tsv' || !src) {
      for (const file of info.files) {
        for await (const row of readCsvStream<RawRow>(file)) {
          yield { raw: row };
        }
      }
      return;
    }
    const db = this.deps.db;
    if (!db) throw new Error('DB no disponible para source DB');
    const PAGE = 1000;
    if (src === 'catalogo' || src === 'comercios_catalogo') {
      let offset = 0;
      while (true) {
        const r = await db.execute(
          sql`SELECT id, nombre FROM comercios_catalogo ORDER BY id LIMIT ${PAGE} OFFSET ${offset}`,
        );
        if (r.rows.length === 0) return;
        for (const row of r.rows as { id: string; nombre: string }[]) {
          yield {
            raw: { Nombre: row.nombre, BancardId: '', CodigoComercio: '', MCC: '' } as RawRow,
            writeback: { table: 'comercios_catalogo', id: row.id },
          };
        }
        offset += PAGE;
      }
    }
    const m = src.match(/^datasets:(.+)$/);
    if (!m) throw new Error(`source desconocido: ${src}`);
    const slug = m[1];
    const ds = await db.execute(sql`SELECT id FROM datasets WHERE slug = ${slug}`);
    if (ds.rows.length === 0) throw new Error(`dataset no existe: ${slug}`);
    const datasetId = (ds.rows[0] as { id: string }).id;
    let offset = 0;
    while (true) {
      const r = await db.execute(
        sql`SELECT id, nombre FROM dataset_comercios WHERE dataset_id = ${datasetId} ORDER BY id LIMIT ${PAGE} OFFSET ${offset}`,
      );
      if (r.rows.length === 0) return;
      for (const row of r.rows as { id: string; nombre: string }[]) {
        yield {
          raw: { Nombre: row.nombre, BancardId: '', CodigoComercio: '', MCC: '' } as RawRow,
          writeback: { table: 'dataset_comercios', id: row.id },
        };
      }
      offset += PAGE;
    }
  }

  private async escribirCategoriaEnSource(
    wb: NonNullable<SourceRow['writeback']>,
    categoriaId: string | null,
    categoriaSlug: string | null,
    fuenteNueva: string | null,
    confianza: number | null,
  ): Promise<void> {
    const db = this.deps.db;
    if (!db) return;
    const conf = confianza !== null ? String(confianza) : null;
    if (wb.table === 'comercios_catalogo') {
      // catalogo ya tiene categoria_id baseline (NOT NULL); no sobreescribir desde test-monitor
      void fuenteNueva;
      void conf;
      void categoriaId;
      return;
    }
    // dataset_comercios: test-monitor escribe baseline (categoria_id/categoria_slug),
    // recat escribe categoria_nueva_*
    await db.execute(sql`
      UPDATE dataset_comercios
      SET categoria_id = ${categoriaId},
          categoria_slug = ${categoriaSlug}
      WHERE id = ${wb.id}
    `);
  }

  private async run(batchId: string): Promise<void> {
    const entry = this.active.get(batchId);
    if (!entry) return;
    const { info, abort } = entry;
    info.status = 'running';
    info.startedAt = Date.now();

    if (this.deps.db) {
      await this.deps.db.execute(sql`DELETE FROM movimientos WHERE batch_id = ${batchId}`);
    }

    const concurrency = info.concurrency;
    const limit = info.limit;

    // Mapa categoriaId → slug para writeback en datasets
    const slugById = new Map<string, string>();
    if (this.deps.db && info.source !== 'tsv') {
      const cats = await this.deps.db.execute(sql`SELECT id, slug FROM categorias`);
      for (const c of cats.rows as { id: string; slug: string }[]) {
        slugById.set(c.id, c.slug);
      }
    }

    let active = 0;
    const queue: SourceRow[] = [];
    let done = false;
    const waiters: Array<() => void> = [];

    const processOne = async (sr: SourceRow): Promise<void> => {
      const row = sr.raw;
      const t0 = Date.now();
      try {
        const input: MovimientoInput = {
          nombreBancard: row.Nombre || undefined,
          bancardId: row.BancardId || undefined,
          codigoComercio: row.CodigoComercio || undefined,
          mcc: cleanMcc(row.MCC),
          rawInput: row,
        };
        const pipeline = await ejecutarCascada(input, this.deps.capas, {
          bypassCatalogo: info.bypassCatalogo,
        });
        if (pipeline.resultado && info.bypassCatalogo) {
          pipeline.resultado.evidencia = {
            ...(pipeline.resultado.evidencia ?? {}),
            bypass_catalogo: true,
          };
        }
        const latencyMs = Date.now() - t0;
        await persistirMovimiento(input, pipeline, this.deps.repo, {
          origen: 'test_masivo',
          batchId,
          latencyMs,
        });
        if (sr.writeback) {
          const catId = pipeline.resultado?.categoriaId ?? null;
          const fuente = pipeline.resultado?.fuente ?? null;
          const conf = pipeline.resultado?.confianza ?? null;
          const slug = catId ? slugById.get(catId) ?? null : null;
          await this.escribirCategoriaEnSource(sr.writeback, catId, slug, fuente, conf);
        }
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

    const rowStream = this.streamRows(info);
    try {
      for await (const row of rowStream) {
        if (abort.signal.aborted) break;
        if (limit !== null && info.total >= limit) break;
        info.total++;
        queue.push(row);
        if (queue.length > concurrency * 4) {
          wakeWorkers();
          while (queue.length > concurrency * 2 && !abort.signal.aborted) {
            await new Promise((r) => setTimeout(r, 5));
          }
        } else {
          wakeWorkers();
        }
        active++;
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
