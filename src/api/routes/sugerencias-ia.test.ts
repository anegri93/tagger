import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { sugerenciasIaRoute, _resetIaRunState } from './sugerencias-ia.js';
import type { OllamaClient } from '../../lib/ollama.js';
import type { PatronWriter } from '../../db/repos/patrones.js';

function fakeDb() {
  return { execute: vi.fn(async () => ({ rows: [] })) };
}

function fakeOllama(resp = '{}'): OllamaClient {
  return { generate: vi.fn(async () => resp), ping: vi.fn(async () => true) };
}

function fakeWriter(): PatronWriter {
  return {
    listar: vi.fn(async () => []),
    obtener: vi.fn(async () => null),
    crear: vi.fn(async (input) => ({
      id: `p_${input.valor}`,
      tipo: input.tipo,
      valor: input.valor,
      categoriaId: 'c',
      categoriaSlug: input.categoriaSlug,
      prioridad: input.prioridad ?? 100,
      activo: true,
      fuente: 'manual',
      descripcion: input.descripcion ?? null,
    })),
    actualizar: vi.fn(async () => null),
    eliminar: vi.fn(async () => true),
  };
}

describe('sugerencias-ia route', () => {
  beforeEach(() => {
    _resetIaRunState();
  });

  it('POST run dispara y devuelve 202', async () => {
    const app = Fastify();
    await app.register(sugerenciasIaRoute(fakeDb() as never, fakeOllama(), fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias-ia/run',
      payload: {},
    });
    expect(r.statusCode).toBe(202);
    expect(r.json().run_id).toMatch(/^iarun_/);
  });

  it('POST run 409 si hay run en progreso', async () => {
    const app = Fastify();
    // db con al menos 1 sin-cat para que el service no termine temprano
    const db = {
      execute: vi.fn(async (q: unknown) => {
        const text = JSON.stringify(q);
        if (text.includes('categoria_nueva_id IS NULL')) {
          return { rows: [{ nombre: 'X' }] };
        }
        if (text.includes('FROM categorias')) return { rows: [{ slug: 's' }] };
        return { rows: [] };
      }),
    };
    const ollamaLento: OllamaClient = {
      generate: vi.fn(() => new Promise((res) => setTimeout(() => res('{}'), 300))),
      ping: vi.fn(async () => true),
    };
    await app.register(sugerenciasIaRoute(db as never, ollamaLento, fakeWriter()));
    const r1 = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias-ia/run',
      payload: {},
    });
    expect(r1.statusCode).toBe(202);
    const r2 = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias-ia/run',
      payload: {},
    });
    expect(r2.statusCode).toBe(409);
  });

  it('GET status sin run → null', async () => {
    const app = Fastify();
    await app.register(sugerenciasIaRoute(fakeDb() as never, fakeOllama(), fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/patrones/sugerencias-ia/status' });
    expect(r.json().run).toBeNull();
  });

  it('POST aplicar crea N patrones', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(sugerenciasIaRoute(fakeDb() as never, fakeOllama(), w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias-ia/aplicar',
      payload: {
        items: [{ tipo: 'contiene', valor: 'GIMNASIO', categoria_slug: 'salud' }],
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().creados).toBe(1);
  });
});
