import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { testBatchControlRoute } from './test-batch-control.js';
import type { TestBatchRunner } from '../../test-batch/runner.js';

function fakeRunner(): TestBatchRunner {
  const items: Array<{ batchId: string; status: string }> = [];
  return {
    start: vi.fn(async (batchId: string) => {
      const info = { batchId, status: 'running', total: 0, processed: 0, ok: 0, errors: 0 };
      items.push(info);
      return info;
    }),
    stop: vi.fn((batchId: string) => items.some((i) => i.batchId === batchId)),
    list: vi.fn(() => items as never),
    get: vi.fn(),
  } as unknown as TestBatchRunner;
}

describe('test-batch-control routes', () => {
  it('POST /test-batch/start arranca worker', async () => {
    const runner = fakeRunner();
    const app = Fastify();
    await app.register(testBatchControlRoute(runner));
    const r = await app.inject({
      method: 'POST',
      url: '/test-batch/start',
      payload: { batch_id: 'foo', limit: 100 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    expect(runner.start).toHaveBeenCalledWith('foo', { limit: 100 });
  });

  it('POST /test-batch/start rechaza body inválido', async () => {
    const runner = fakeRunner();
    const app = Fastify();
    await app.register(testBatchControlRoute(runner));
    const r = await app.inject({
      method: 'POST',
      url: '/test-batch/start',
      payload: { batch_id: '' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST /test-batch/stop ok=true si encontró', async () => {
    const runner = fakeRunner();
    const app = Fastify();
    await app.register(testBatchControlRoute(runner));
    await app.inject({
      method: 'POST',
      url: '/test-batch/start',
      payload: { batch_id: 'x' },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/test-batch/stop',
      payload: { batch_id: 'x' },
    });
    expect(r.json().ok).toBe(true);
  });

  it('GET /test-batch/list devuelve activos', async () => {
    const runner = fakeRunner();
    const app = Fastify();
    await app.register(testBatchControlRoute(runner));
    await app.inject({
      method: 'POST',
      url: '/test-batch/start',
      payload: { batch_id: 'a' },
    });
    const r = await app.inject({ method: 'GET', url: '/test-batch/list' });
    expect(r.json().items).toHaveLength(1);
  });
});
