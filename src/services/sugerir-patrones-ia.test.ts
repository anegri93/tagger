import { describe, it, expect, vi } from 'vitest';
import { sugerirPatronesIa, construirPrompt } from './sugerir-patrones-ia.js';
import type { OllamaClient } from '../lib/ollama.js';

function fakeDb({
  seed = [],
  sinCat = [],
  categorias = [],
  patrones = [],
}: {
  seed?: Array<{ nombre: string; cat_slug: string; fuente_nueva: string }>;
  sinCat?: Array<{ nombre: string }>;
  categorias?: Array<{ slug: string }>;
  patrones?: Array<{ tipo: string; valor: string }>;
}) {
  return {
    execute: vi.fn(async (q: unknown) => {
      const text = JSON.stringify(q);
      if (text.includes('PARTITION BY')) return { rows: seed };
      if (text.includes('categoria_nueva_id IS NULL')) return { rows: sinCat };
      if (text.includes('FROM categorias')) return { rows: categorias };
      if (text.includes('FROM patrones')) return { rows: patrones };
      return { rows: [] };
    }),
  };
}

function fakeOllama(response: string): OllamaClient {
  return {
    generate: vi.fn(async () => response),
    ping: vi.fn(async () => true),
  };
}

describe('construirPrompt', () => {
  it('incluye seed agrupado, sin-cat, categorías y patrones existentes', () => {
    const p = construirPrompt(
      [
        { nombre: 'JOYERIA RUBI', cat_slug: 'ropa', fuente_nueva: 'contiene' },
        { nombre: 'JOYERIA PEREZ', cat_slug: 'ropa', fuente_nueva: 'contiene' },
        { nombre: 'BURGER KING', cat_slug: 'restaurante', fuente_nueva: 'contiene' },
      ],
      [{ nombre: 'GIMNASIO ATLAS' }, { nombre: 'GIMNASIO PUMA' }],
      ['ropa', 'restaurante', 'salud'],
      [{ tipo: 'contiene', valor: 'JOYERIA' }],
    );
    expect(p).toContain('Categoría=ropa');
    expect(p).toContain('JOYERIA RUBI');
    expect(p).toContain('Categoría=restaurante');
    expect(p).toContain('GIMNASIO ATLAS');
    expect(p).toContain('contiene:JOYERIA');
    expect(p).toContain('ropa, restaurante, salud');
  });
});

describe('sugerirPatronesIa', () => {
  it('parsea JSON y devuelve sugerencias filtradas', async () => {
    const ollamaResp = JSON.stringify({
      sugerencias: [
        {
          token: 'GIMNASIO',
          tipo: 'contiene',
          valor: 'GIMNASIO',
          categoria_slug: 'salud',
          ejemplos: ['GIMNASIO ATLAS', 'GIMNASIO PUMA'],
          confianza: 0.9,
          razonamiento: 'fitness',
        },
        {
          token: 'AMBIGUO',
          tipo: 'contiene',
          valor: 'AMBIGUO',
          categoria_slug: 'salud',
          confianza: 0.5, // bajo, debe descartarse
        },
      ],
    });
    const db = fakeDb({
      sinCat: [{ nombre: 'GIMNASIO ATLAS' }],
      categorias: [{ slug: 'salud' }, { slug: 'ropa' }],
    });
    const r = await sugerirPatronesIa({ db: db as never, ollama: fakeOllama(ollamaResp) });
    expect(r).toHaveLength(1);
    expect(r[0]!.token).toBe('GIMNASIO');
    expect(r[0]!.confianza).toBe(0.9);
  });

  it('descarta sugerencias con valor ya en patrones existentes', async () => {
    const ollamaResp = JSON.stringify({
      sugerencias: [
        {
          token: 'JOYERIA',
          tipo: 'contiene',
          valor: 'JOYERIA',
          categoria_slug: 'ropa',
          confianza: 0.95,
        },
      ],
    });
    const db = fakeDb({
      sinCat: [{ nombre: 'JOYERIA NUEVA' }],
      categorias: [{ slug: 'ropa' }],
      patrones: [{ tipo: 'contiene', valor: 'JOYERIA' }],
    });
    const r = await sugerirPatronesIa({ db: db as never, ollama: fakeOllama(ollamaResp) });
    expect(r).toHaveLength(0);
  });

  it('descarta categoría inexistente', async () => {
    const ollamaResp = JSON.stringify({
      sugerencias: [
        {
          token: 'X',
          tipo: 'contiene',
          valor: 'X',
          categoria_slug: 'inexistente',
          confianza: 0.95,
        },
      ],
    });
    const db = fakeDb({
      sinCat: [{ nombre: 'X COMERCIO' }],
      categorias: [{ slug: 'ropa' }],
    });
    const r = await sugerirPatronesIa({ db: db as never, ollama: fakeOllama(ollamaResp) });
    expect(r).toHaveLength(0);
  });

  it('lista vacía si IA devuelve JSON inválido', async () => {
    const db = fakeDb({ sinCat: [{ nombre: 'X' }], categorias: [{ slug: 'r' }] });
    const r = await sugerirPatronesIa({
      db: db as never,
      ollama: fakeOllama('texto no json'),
    });
    expect(r).toEqual([]);
  });

  it('lista vacía si no hay sin-cat', async () => {
    const db = fakeDb({ sinCat: [], categorias: [{ slug: 'r' }] });
    const r = await sugerirPatronesIa({
      db: db as never,
      ollama: fakeOllama('{}'),
    });
    expect(r).toEqual([]);
  });

  it('ordena por confianza desc', async () => {
    const ollamaResp = JSON.stringify({
      sugerencias: [
        { token: 'A', tipo: 'contiene', valor: 'A', categoria_slug: 's', confianza: 0.75 },
        { token: 'B', tipo: 'contiene', valor: 'B', categoria_slug: 's', confianza: 0.95 },
        { token: 'C', tipo: 'contiene', valor: 'C', categoria_slug: 's', confianza: 0.85 },
      ],
    });
    const db = fakeDb({ sinCat: [{ nombre: 'X' }], categorias: [{ slug: 's' }] });
    const r = await sugerirPatronesIa({ db: db as never, ollama: fakeOllama(ollamaResp) });
    expect(r.map((x) => x.token)).toEqual(['B', 'C', 'A']);
  });
});
