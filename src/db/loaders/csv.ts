import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { parse as parseStream } from 'csv-parse';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Db } from '../client.js';

export interface LoaderResult {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface LoaderContext {
  db: Db;
  resolveCategoria(slug: string): string | undefined;
}

export interface BatchUpsertConfig {
  target: unknown;
  targetWhere?: SQL;
  set: Record<string, SQL | unknown>;
}

export interface LoaderConfig<TRow extends Record<string, string>, TInsert> {
  table: PgTable;
  tableName: string;
  /** Path al CSV relativo a root del proyecto. Si no se pasa, usa `data` array. */
  file?: string;
  /** Delimitador. Default: tab si .tsv, coma si .csv. */
  delimiter?: string;
  /** Filas inline (alternativa a CSV). */
  data?: TRow[];
  /** Mapea fila CSV → objeto pa insert. Devolver null pa skip. */
  mapRow(row: TRow, ctx: LoaderContext): TInsert | null | Promise<TInsert | null>;
  /** Estrategia upsert por fila. Si null, hace insert simple. */
  upsert?: {
    target: unknown;
    setUpdate(row: TInsert): Record<string, unknown>;
  } | null;
  /** Insert manual custom (para casos complejos). */
  customInsert?: (row: TInsert, ctx: LoaderContext) => Promise<'inserted' | 'updated' | 'skipped'>;
  /** Si está, runLoader procesa en batches con stream. Conteo insertado/updated colapsa en `inserted`. */
  batchSize?: number;
  /** Estrategia upsert pa modo batch (set debe usar sql`excluded.<col>` refs). */
  batchUpsert?: BatchUpsertConfig;
  /** Log progreso cada N filas (modo batch). Default 1000. */
  progressEvery?: number;
}

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

export function readCsv<T extends Record<string, string>>(file: string, delimiter?: string): T[] {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    console.warn(`[loader] archivo ${path} no existe`);
    return [];
  }
  const content = readFileSync(path, 'utf8');
  const delim = delimiter ?? (file.endsWith('.tsv') ? '\t' : ',');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: delim,
    relax_quotes: true,
    relax_column_count: true,
  }) as T[];
}

export async function* readCsvStream<T extends Record<string, string>>(
  file: string,
  delimiter?: string,
): AsyncGenerator<T> {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    console.warn(`[loader] archivo ${path} no existe`);
    return;
  }
  const delim = delimiter ?? (file.endsWith('.tsv') ? '\t' : ',');
  const parser = createReadStream(path).pipe(
    parseStream({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: delim,
      relax_quotes: true,
      relax_column_count: true,
    }),
  );
  for await (const record of parser) {
    yield record as T;
  }
}

export async function runLoader<
  TRow extends Record<string, string>,
  TInsert extends Record<string, unknown>,
>(cfg: LoaderConfig<TRow, TInsert>, ctx: LoaderContext): Promise<LoaderResult> {
  const result: LoaderResult = {
    table: cfg.tableName,
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: 0,
  };

  if (cfg.batchSize && cfg.batchSize > 0) {
    return runBatched(cfg, ctx, result);
  }

  const rows: TRow[] = cfg.data ?? (cfg.file ? readCsv<TRow>(cfg.file, cfg.delimiter) : []);
  result.total = rows.length;

  for (const row of rows) {
    await processRow(row, cfg, ctx, result);
  }
  return result;
}

async function processRow<
  TRow extends Record<string, string>,
  TInsert extends Record<string, unknown>,
>(
  row: TRow,
  cfg: LoaderConfig<TRow, TInsert>,
  ctx: LoaderContext,
  result: LoaderResult,
): Promise<void> {
  const mapped = await cfg.mapRow(row, ctx);
  if (!mapped) {
    result.skipped++;
    return;
  }
  if (cfg.customInsert) {
    const r = await cfg.customInsert(mapped, ctx);
    result[r]++;
    return;
  }
  if (cfg.upsert) {
    const inserted = await ctx.db
      .insert(cfg.table)
      .values(mapped)
      .onConflictDoUpdate({
        target: cfg.upsert.target as never,
        set: cfg.upsert.setUpdate(mapped),
      })
      .returning();
    const r = inserted[0] as { createdAt?: Date; updatedAt?: Date } | undefined;
    const isInsert =
      r?.createdAt && r?.updatedAt && r.createdAt.getTime() === r.updatedAt.getTime();
    if (isInsert) result.inserted++;
    else result.updated++;
  } else {
    await ctx.db.insert(cfg.table).values(mapped);
    result.inserted++;
  }
}

async function runBatched<
  TRow extends Record<string, string>,
  TInsert extends Record<string, unknown>,
>(
  cfg: LoaderConfig<TRow, TInsert>,
  ctx: LoaderContext,
  result: LoaderResult,
): Promise<LoaderResult> {
  const batchSize = cfg.batchSize ?? 500;
  const progressEvery = cfg.progressEvery ?? 1000;
  let buffer: TInsert[] = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    if (cfg.batchUpsert) {
      const onConflict: Record<string, unknown> = {
        target: cfg.batchUpsert.target,
        set: cfg.batchUpsert.set,
      };
      if (cfg.batchUpsert.targetWhere) onConflict.targetWhere = cfg.batchUpsert.targetWhere;
      await ctx.db
        .insert(cfg.table)
        .values(buffer as Record<string, unknown>[])
        .onConflictDoUpdate(onConflict as never);
    } else {
      await ctx.db.insert(cfg.table).values(buffer as Record<string, unknown>[]);
    }
    result.inserted += buffer.length;
    buffer = [];
  };

  const source: AsyncIterable<TRow> | Iterable<TRow> = cfg.data
    ? cfg.data
    : cfg.file
      ? readCsvStream<TRow>(cfg.file, cfg.delimiter)
      : [];

  for await (const row of source as AsyncIterable<TRow>) {
    result.total++;
    const mapped = await cfg.mapRow(row, ctx);
    if (!mapped) {
      result.skipped++;
    } else {
      buffer.push(mapped);
      if (buffer.length >= batchSize) await flush();
    }
    if (result.total % progressEvery === 0) {
      console.warn(
        `[${cfg.tableName}] progreso ${result.total} (insert+buffer ${result.inserted + buffer.length}, skip ${result.skipped})`,
      );
    }
  }
  await flush();
  return result;
}

export function logResult(r: LoaderResult): void {
  console.warn(
    `[${r.table}] ${r.inserted} insertados, ${r.updated} actualizados, ${r.skipped} omitidos (total ${r.total})`,
  );
}
