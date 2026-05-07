import { describe, it, expect, vi } from 'vitest';
import { recategorizarCatalogo } from './recategorizar-catalogo.js';
import type { CapasSincrono } from '../pipeline/categorizar.js';

function fakeDb(rows: Array<{ id: string; nombre: string; categoriaActual: string }>) {
  let updateCount = 0;
  const db = {
    execute: () => Promise.resolve({ rows: [{ c: rows.length }] }),
    select: () => ({
      from: () => ({
        // primer select: total
        // segundo select: con limit/offset/orderBy
        orderBy: () => ({
          limit: () => ({
            offset: (off: number) => Promise.resolve(rows.slice(off, off + 500)),
          }),
        }),
        // sin orderBy → primera llamada de total count
        then: (resolve: (v: { id: string }[]) => unknown) =>
          resolve(rows.map((r) => ({ id: r.id }))),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          updateCount++;
          return Promise.resolve();
        },
      }),
    }),
    _updateCount: () => updateCount,
  };
  return db;
}

function stubCapas(
  match: (texto: string) => { categoriaId: string; fuente: string; confianza: number } | null,
): CapasSincrono {
  return {
    regex: { evaluar: vi.fn(async () => null) },
    bancard: { evaluar: vi.fn(async () => null) },
    comercio: { evaluar: vi.fn(async () => null) },
    patrones: {
      evaluar: vi.fn(async (texto: string) => {
        const r = match(texto);
        if (!r) return null;
        return {
          categoriaId: r.categoriaId,
          confianza: r.confianza,
          fuente: r.fuente as never,
          evidencia: { regla_id: 'p1', patron: 'X' },
        };
      }),
    },
    mcc: { evaluar: vi.fn(async () => null) },
  };
}

describe('recategorizarCatalogo', () => {
  it('estadística con DB stub vacía', async () => {
    const db = fakeDb([]);
    const r = await recategorizarCatalogo({ db: db as never, capas: stubCapas(() => null) });
    expect(r).toEqual({ total: 0, procesados: 0, match: 0, diff: 0, sinCategoria: 0 });
  });

  it('cuenta match/diff/sin_categoria correctamente', async () => {
    const rows = [
      { id: '1', nombre: 'BIGGIE', categoriaActual: 'super' },
      { id: '2', nombre: 'JOYERIA RUBI', categoriaActual: 'otros' },
      { id: '3', nombre: 'XXXX', categoriaActual: 'otros' },
    ];
    const db = fakeDb(rows);
    const capas = stubCapas((t) => {
      if (t.includes('BIGGIE')) return { categoriaId: 'super', fuente: 'literal', confianza: 0.95 };
      if (t.includes('JOYERIA')) return { categoriaId: 'ropa', fuente: 'contiene', confianza: 0.9 };
      return null;
    });
    const r = await recategorizarCatalogo({ db: db as never, capas });
    expect(r.total).toBe(3);
    expect(r.procesados).toBe(3);
    expect(r.match).toBe(1); // BIGGIE → super = super
    expect(r.diff).toBe(1); // JOYERIA → ropa ≠ otros
    expect(r.sinCategoria).toBe(1); // XXXX → null
  });
});
