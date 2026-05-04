import { describe, it, expect, vi } from 'vitest';
import { TestBatchRunner } from './runner.js';
import type { CapasSincrono } from '../pipeline/categorizar.js';
import type { MovimientoRepository } from '../pipeline/persistir.js';

function fakeCapas(): CapasSincrono {
  return {
    catalogo: { evaluar: async () => null },
    regex: { evaluar: async () => null },
    bancard: { evaluar: async () => null },
    comercio: { evaluar: async () => null },
    mcc: { evaluar: async () => null },
  };
}

function fakeRepo(): MovimientoRepository {
  let n = 0;
  return {
    insertar: vi.fn(async () => ({ id: `m${++n}` })),
  };
}

describe('TestBatchRunner', () => {
  it('start con batch_id no existente lo registra como queued/running', async () => {
    const runner = new TestBatchRunner({ capas: fakeCapas(), repo: fakeRepo() });
    const info = await runner.start('test-x', { files: [], limit: 0 });
    expect(['queued', 'running', 'done']).toContain(info.status);
    expect(info.batchId).toBe('test-x');
  });

  it('start mismo batch_id mientras corre lanza error', async () => {
    const runner = new TestBatchRunner({ capas: fakeCapas(), repo: fakeRepo() });
    await runner.start('dup', { files: ['data/no-existe.tsv'], limit: 1000 });
    runner.get('dup')!.status = 'running';
    await expect(runner.start('dup')).rejects.toThrow(/running/);
  });

  it('list devuelve batches activos', async () => {
    const runner = new TestBatchRunner({ capas: fakeCapas(), repo: fakeRepo() });
    await runner.start('a', { files: [] });
    await runner.start('b', { files: [] });
    const items = runner.list();
    expect(items.map((i) => i.batchId).sort()).toEqual(['a', 'b']);
  });

  it('stop devuelve true si batch existía running', async () => {
    const runner = new TestBatchRunner({ capas: fakeCapas(), repo: fakeRepo() });
    await runner.start('s', { files: ['data/no-existe.tsv'] });
    const r = runner.stop('s');
    expect(r).toBe(true);
  });

  it('stop devuelve false si batch no existe', () => {
    const runner = new TestBatchRunner({ capas: fakeCapas(), repo: fakeRepo() });
    expect(runner.stop('inexistente')).toBe(false);
  });
});
