import { describe, it, expect, vi } from 'vitest';
import { sugerirPatrones, tokenizar } from './sugerir-patrones.js';

describe('tokenizar (sugerir)', () => {
  it('filtra stopwords y tokens cortos', () => {
    expect(tokenizar('Farmacia San Pedro Asuncion', 4)).toEqual(['FARMACIA', 'PEDRO']);
    expect(tokenizar('A B CD EFG HIJK', 4)).toEqual(['HIJK']);
  });
});

function fakeDb({
  seed = [],
  patrones = [],
  sinCat = [],
}: {
  seed?: Array<{ nombre: string; cat_id: string; cat_slug: string }>;
  patrones?: Array<{ tipo: string; valor: string; categoria_id: string }>;
  sinCat?: Array<{ nombre: string }>;
}) {
  const queries: string[] = [];
  return {
    execute: vi.fn(async (q: { strings?: string[] } | unknown) => {
      const text = JSON.stringify(q);
      queries.push(text);
      if (text.includes('comercios_catalogo cc') && text.includes('confianza')) {
        return { rows: seed };
      }
      if (text.includes('FROM patrones')) {
        return { rows: patrones };
      }
      if (text.includes('categoria_nueva_id IS NULL')) {
        return { rows: sinCat };
      }
      return { rows: [] };
    }),
  };
}

describe('sugerirPatrones', () => {
  it('descarta token con pureza baja', async () => {
    const db = fakeDb({
      seed: [
        { nombre: 'EXPRESS UNO', cat_id: 'super', cat_slug: 'super' },
        { nombre: 'EXPRESS DOS', cat_id: 'super', cat_slug: 'super' },
        { nombre: 'EXPRESS TRES', cat_id: 'super', cat_slug: 'super' },
        { nombre: 'EXPRESS CUATRO', cat_id: 'restaurante', cat_slug: 'restaurante' },
        { nombre: 'EXPRESS CINCO', cat_id: 'restaurante', cat_slug: 'restaurante' },
        { nombre: 'EXPRESS SEIS', cat_id: 'transporte', cat_slug: 'transporte' },
      ],
      sinCat: [{ nombre: 'EXPRESS NUEVE' }],
    });
    const r = await sugerirPatrones(db as never, {
      freqMin: 5,
      purezaMin: 0.8,
      impactoMin: 1,
    });
    expect(r.find((s) => s.token === 'EXPRESS')).toBeUndefined();
  });

  it('acepta token con pureza alta', async () => {
    const db = fakeDb({
      seed: [
        { nombre: 'FARMACIA SAN PEDRO', cat_id: 'farma-id', cat_slug: 'farmacia' },
        { nombre: 'FARMACIA CENTRAL', cat_id: 'farma-id', cat_slug: 'farmacia' },
        { nombre: 'FARMACIA NORTE', cat_id: 'farma-id', cat_slug: 'farmacia' },
        { nombre: 'FARMACIA SUR', cat_id: 'farma-id', cat_slug: 'farmacia' },
        { nombre: 'FARMACIA OESTE', cat_id: 'farma-id', cat_slug: 'farmacia' },
      ],
      sinCat: [
        { nombre: 'FARMACIA RUBI' },
        { nombre: 'FARMACIA LUNA' },
        { nombre: 'FARMACIA SOL' },
      ],
    });
    const r = await sugerirPatrones(db as never, {
      freqMin: 3,
      purezaMin: 0.8,
      impactoMin: 2,
    });
    const farma = r.find((s) => s.token === 'FARMACIA');
    expect(farma).toBeDefined();
    expect(farma?.tipo).toBe('contiene');
    expect(farma?.categoriaSlug).toBe('farmacia');
    expect(farma?.pureza).toBe(1.0);
    expect(farma?.impactoSinCat).toBe(3);
  });

  it('token corto → tipo regex con \\b', async () => {
    const db = fakeDb({
      seed: Array(5)
        .fill(0)
        .map((_, i) => ({ nombre: `KFC ${i}`, cat_id: 'rest', cat_slug: 'restaurante' })),
      sinCat: [{ nombre: 'KFC LUQUE' }, { nombre: 'KFC SAN LORENZO' }, { nombre: 'KFC CDE' }],
    });
    const r = await sugerirPatrones(db as never, {
      freqMin: 3,
      purezaMin: 0.8,
      longitudMin: 3,
      impactoMin: 2,
    });
    const kfc = r.find((s) => s.token === 'KFC');
    expect(kfc?.tipo).toBe('regex');
    expect(kfc?.valor).toBe('\\bKFC\\b');
  });

  it('descarta si patrón existente (mismo valor)', async () => {
    const db = fakeDb({
      seed: Array(5)
        .fill(0)
        .map((_, i) => ({
          nombre: `JOYERIA ${i}`,
          cat_id: 'ropa-id',
          cat_slug: 'ropa',
        })),
      patrones: [{ tipo: 'contiene', valor: 'JOYERIA', categoria_id: 'ropa-id' }],
      sinCat: [{ nombre: 'JOYERIA NUEVA' }, { nombre: 'JOYERIA OTRA' }, { nombre: 'JOYERIA TRES' }],
    });
    const r = await sugerirPatrones(db as never, { freqMin: 3, impactoMin: 2 });
    expect(r.find((s) => s.token === 'JOYERIA')).toBeUndefined();
  });

  it('descarta si freq baja', async () => {
    const db = fakeDb({
      seed: [{ nombre: 'PIZZERIA UNO', cat_id: 'rest', cat_slug: 'restaurante' }],
      sinCat: [
        { nombre: 'PIZZERIA OTRA' },
        { nombre: 'PIZZERIA TRES' },
        { nombre: 'PIZZERIA CUATRO' },
      ],
    });
    const r = await sugerirPatrones(db as never, { freqMin: 5, impactoMin: 2 });
    expect(r.find((s) => s.token === 'PIZZERIA')).toBeUndefined();
  });

  it('ordena por freqSeed desc', async () => {
    const db = fakeDb({
      seed: [
        ...Array(10)
          .fill(0)
          .map((_, i) => ({ nombre: `FARMA ${i}`, cat_id: 'fc', cat_slug: 'farmacia' })),
        ...Array(5)
          .fill(0)
          .map((_, i) => ({ nombre: `BURGER ${i}`, cat_id: 'rc', cat_slug: 'restaurante' })),
      ],
      sinCat: [
        ...Array(2)
          .fill(0)
          .map((_, i) => ({ nombre: `FARMA SUC ${i}` })),
        ...Array(10)
          .fill(0)
          .map((_, i) => ({ nombre: `BURGER X ${i}` })),
      ],
    });
    const r = await sugerirPatrones(db as never, { freqMin: 3, impactoMin: 1 });
    expect(r[0]!.token).toBe('FARMA');
    expect(r[0]!.freqSeed).toBe(10);
    expect(r[1]!.token).toBe('BURGER');
    expect(r[1]!.freqSeed).toBe(5);
  });
});
