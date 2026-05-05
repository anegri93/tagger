import { describe, it, expect } from 'vitest';
import { migrarReglasAPatrones } from './migrar-reglas-a-patrones.js';

describe('migrarReglasAPatrones', () => {
  it('exporta función con signature esperada', () => {
    expect(typeof migrarReglasAPatrones).toBe('function');
  });

  it('devuelve {total, insertadas, skip} con DB stub vacía', async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };
    const r = await migrarReglasAPatrones(fakeDb as never);
    expect(r).toEqual({ total: 0, insertadas: 0, skip: 0 });
  });

  it('cuenta insertadas y skip según returning', async () => {
    const reglas = [
      { patron: 'A', categoriaId: 'c1', prioridad: 10, descripcion: null },
      { patron: 'B', categoriaId: 'c1', prioridad: 20, descripcion: null },
      { patron: 'C', categoriaId: 'c1', prioridad: 30, descripcion: null },
    ];
    let insertCalls = 0;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(reglas),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => {
              insertCalls++;
              // primera regla insertada, las otras dos chocan
              return Promise.resolve(insertCalls === 1 ? [{ id: 'p1' }] : []);
            },
          }),
        }),
      }),
    };
    const r = await migrarReglasAPatrones(fakeDb as never);
    expect(r.total).toBe(3);
    expect(r.insertadas).toBe(1);
    expect(r.skip).toBe(2);
  });
});
