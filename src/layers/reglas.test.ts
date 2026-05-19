import { describe, it, expect, vi } from 'vitest';
import { crearCapaReglas } from './reglas.js';
import type { ReglaCargada } from '../db/repos/reglas.js';

function loaderConFilas(porScopeMap: Record<string, ReglaCargada[]>) {
  return {
    porScope: vi.fn(async (scope: string) => porScopeMap[scope] ?? []),
  };
}

const HIT_REGLA: ReglaCargada = {
  id: 'r1',
  scope: 'global',
  tipo: 'contiene',
  valor: 'BIGGIE',
  valorNormalizado: 'BIGGIE',
  categoriaId: 'cat-super',
  prioridad: 100,
  origen: 'manual',
};

describe('crearCapaReglas', () => {
  it('matchea regla contiene y devuelve resultado', async () => {
    const capa = crearCapaReglas(loaderConFilas({ global: [HIT_REGLA] }));
    const r = await capa.evaluar({ descripcion: 'COMPRA BIGGIE STOCK' }, 'global');
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.fuente).toBe('contiene');
    expect(r?.confianza).toBe(0.8);
  });

  it('user-scope con origen=correccion devuelve fuente=manual conf 1.0', async () => {
    const regla: ReglaCargada = {
      ...HIT_REGLA,
      scope: 'usuario:u1',
      tipo: 'literal',
      valor: 'PEREZ JUAN',
      valorNormalizado: 'PEREZ JUAN',
      origen: 'correccion',
    };
    const capa = crearCapaReglas(loaderConFilas({ 'usuario:u1': [regla] }));
    const r = await capa.evaluar({ nombreBancard: 'PEREZ JUAN' }, 'usuario:u1');
    expect(r?.fuente).toBe('manual');
    expect(r?.confianza).toBe(1.0);
  });

  it('cache hit: 2da llamada al mismo scope no consulta loader', async () => {
    const loader = loaderConFilas({ global: [HIT_REGLA] });
    const capa = crearCapaReglas(loader, { maxEntries: 100 });
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'global');
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'global');
    expect(loader.porScope).toHaveBeenCalledTimes(1);
  });

  it('TTL expira → recarga', async () => {
    const loader = loaderConFilas({ global: [HIT_REGLA] });
    let t = 1000;
    const capa = crearCapaReglas(loader, { ttlMs: 100, now: () => t });
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'global');
    t = 1500; // > 1000 + 100
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'global');
    expect(loader.porScope).toHaveBeenCalledTimes(2);
  });

  it('LRU evict: cuando size > capacity, descarta el más viejo', async () => {
    const loader = loaderConFilas({
      a: [{ ...HIT_REGLA, scope: 'a' }],
      b: [{ ...HIT_REGLA, scope: 'b' }],
      c: [{ ...HIT_REGLA, scope: 'c' }],
    });
    const capa = crearCapaReglas(loader, { maxEntries: 2 });
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a');
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'b');
    expect(capa.stats().size).toBe(2);
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'c'); // evict 'a'
    expect(capa.stats().size).toBe(2);
    // 'a' fue descartado → vuelta a cargar de loader
    loader.porScope.mockClear();
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a');
    expect(loader.porScope).toHaveBeenCalledTimes(1);
  });

  it('LRU touch: get mueve el scope al final (most recent)', async () => {
    const loader = loaderConFilas({
      a: [{ ...HIT_REGLA, scope: 'a' }],
      b: [{ ...HIT_REGLA, scope: 'b' }],
      c: [{ ...HIT_REGLA, scope: 'c' }],
    });
    const capa = crearCapaReglas(loader, { maxEntries: 2 });
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a');
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'b');
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a'); // touch 'a'
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'c'); // evict 'b' (no 'a')
    loader.porScope.mockClear();
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a'); // a sigue en cache
    expect(loader.porScope).toHaveBeenCalledTimes(0);
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'b'); // b fue evict
    expect(loader.porScope).toHaveBeenCalledTimes(1);
  });

  it('invalidar(scope) borra solo ese scope', async () => {
    const loader = loaderConFilas({
      a: [{ ...HIT_REGLA, scope: 'a' }],
      b: [{ ...HIT_REGLA, scope: 'b' }],
    });
    const capa = crearCapaReglas(loader);
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a');
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'b');
    capa.invalidar('a');
    loader.porScope.mockClear();
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'a'); // recarga
    await capa.evaluar({ descripcion: 'BIGGIE' }, 'b'); // sigue en cache
    expect(loader.porScope).toHaveBeenCalledTimes(1);
  });

  it('stats() reporta size/capacity/ttl', async () => {
    const capa = crearCapaReglas(loaderConFilas({}), { maxEntries: 42, ttlMs: 5000 });
    const s = capa.stats();
    expect(s.capacity).toBe(42);
    expect(s.ttlMs).toBe(5000);
    expect(s.size).toBe(0);
  });
});
