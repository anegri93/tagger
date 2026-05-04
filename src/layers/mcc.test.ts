import { describe, it, expect, vi } from 'vitest';
import { crearCapaMcc, type MccEntry } from './mcc.js';

function lookupFijo(map: Record<string, MccEntry>) {
  return { porCodigo: vi.fn(async (k: string) => map[k] ?? null) };
}

describe('capa mcc', () => {
  it('hit no ambiguo devuelve categoría', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5411': { codMcc: '5411', categoriaId: 'cat-super', ambiguo: false } }),
    );
    const r = await capa.evaluar('5411');
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.fuente).toBe('mcc');
    expect(r?.confianza).toBe(0.75);
    expect(r?.evidencia.mcc_match).toBe('5411');
  });

  it('ambiguo devuelve null (delega a IA)', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5999': { codMcc: '5999', categoriaId: 'cat-misc', ambiguo: true } }),
    );
    expect(await capa.evaluar('5999')).toBeNull();
  });

  it('no encontrado devuelve null', async () => {
    const capa = crearCapaMcc(lookupFijo({}));
    expect(await capa.evaluar('0000')).toBeNull();
  });

  it('sin categoriaId devuelve null', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5411': { codMcc: '5411', categoriaId: null, ambiguo: false } }),
    );
    expect(await capa.evaluar('5411')).toBeNull();
  });

  it('input vacío/null devuelve null', async () => {
    const capa = crearCapaMcc(lookupFijo({}));
    expect(await capa.evaluar(null)).toBeNull();
    expect(await capa.evaluar('')).toBeNull();
    expect(await capa.evaluar('   ')).toBeNull();
  });
});
