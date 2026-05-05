import { sql } from 'drizzle-orm';
import { comerciosCatalogo } from '../db/schema/index.js';
import { loadComerciosBancardMasivo } from '../db/loaders/comercios-bancard-masivo.js';
import type { LoaderContext } from '../db/loaders/csv.js';

export type CatalogoStatus = 'idle' | 'running' | 'done' | 'error';

export interface CatalogoRunInfo {
  status: CatalogoStatus;
  startedAt: number | null;
  finishedAt: number | null;
  total: number;
  porFuente: Record<string, number> | null;
  revision: number;
  truncated: boolean;
  errorMsg: string | null;
}

export class CatalogoMassiveRunner {
  private current: CatalogoRunInfo = {
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    total: 0,
    porFuente: null,
    revision: 0,
    truncated: false,
    errorMsg: null,
  };
  private mutex = false;

  constructor(private ctx: LoaderContext) {}

  get info(): CatalogoRunInfo {
    return { ...this.current };
  }

  start(opts: { truncateFirst?: boolean; file?: string } = {}): CatalogoRunInfo {
    if (this.mutex) throw new Error('reproceso_en_curso');
    this.mutex = true;
    this.current = {
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      total: 0,
      porFuente: null,
      revision: 0,
      truncated: opts.truncateFirst === true,
      errorMsg: null,
    };
    void this.run(opts).catch((err) => {
      this.current = {
        ...this.current,
        status: 'error',
        finishedAt: Date.now(),
        errorMsg: err instanceof Error ? err.message : String(err),
      };
      this.mutex = false;
    });
    return this.info;
  }

  private async run(opts: { truncateFirst?: boolean; file?: string }): Promise<void> {
    try {
      if (opts.truncateFirst) {
        await this.ctx.db.execute(sql`TRUNCATE ${comerciosCatalogo} CASCADE`);
      }
      const r = await loadComerciosBancardMasivo(
        this.ctx,
        opts.file ?? 'data/comercios-bancard-staged.tsv',
      );
      this.current = {
        ...this.current,
        status: 'done',
        finishedAt: Date.now(),
        total: r.total,
        porFuente: r.porFuente,
        revision: r.revisión,
      };
    } finally {
      this.mutex = false;
    }
  }
}
