import { describe, it, expect, vi } from 'vitest';
import { crearCapaComercio, type ComercioCandidato } from './comercio.js';

function lookupFijo(candidatos: ComercioCandidato[]) {
  return { candidatosPorTexto: vi.fn().mockResolvedValue(candidatos) };
}

describe('capa comercio', () => {
  it('match exacto', async () => {
    const capa = crearCapaComercio(
      lookupFijo([{ id: 'c1', nombreNormalizado: 'COPETROL', categoriaId: 'cat-comb' }]),
    );
    const r = await capa.evaluar('copetrol');
    expect(r?.categoriaId).toBe('cat-comb');
    expect(r?.evidencia.match_type).toBe('nombre_exacto');
    expect(r?.fuente).toBe('nombre');
    expect(r?.confianza).toBe(0.8);
  });

  it('match parcial (substring) con score >=0.75', async () => {
    const capa = crearCapaComercio(
      lookupFijo([{ id: 'c1', nombreNormalizado: 'COPETROL CENTRO', categoriaId: 'cat-comb' }]),
    );
    const r = await capa.evaluar('COPETROL CENTRO 1');
    expect(r?.categoriaId).toBe('cat-comb');
    expect(r?.evidencia.match_type).toBe('nombre_parcial');
  });

  it('múltiples matches → mejor score (más cercano en longitud)', async () => {
    const capa = crearCapaComercio(
      lookupFijo([
        { id: 'corto', nombreNormalizado: 'PETRO', categoriaId: 'cat-corto' },
        { id: 'mejor', nombreNormalizado: 'PETROBRAS PARAGUAY', categoriaId: 'cat-mejor' },
      ]),
    );
    const r = await capa.evaluar('PETROBRAS PARAGUAY');
    expect(r?.categoriaId).toBe('cat-mejor');
  });

  it('no match devuelve null', async () => {
    const capa = crearCapaComercio(lookupFijo([]));
    expect(await capa.evaluar('XXX')).toBeNull();
  });

  it('input vacío devuelve null', async () => {
    const capa = crearCapaComercio(lookupFijo([]));
    expect(await capa.evaluar('')).toBeNull();
    expect(await capa.evaluar(null)).toBeNull();
  });

  it('match exacto con fuente/confianza pre-computada → propaga del catálogo', async () => {
    const capa = crearCapaComercio(
      lookupFijo([
        {
          id: 'c1',
          nombreNormalizado: 'AZAR LATINO',
          categoriaId: 'cat-azar',
          fuentePrev: 'regex',
          confianzaPrev: 0.95,
          evidenciaPrev: { regla_id: 'r-azar', patron: 'AZAR' },
        },
      ]),
    );
    const r = await capa.evaluar('Azar Latino');
    expect(r?.fuente).toBe('regex');
    expect(r?.confianza).toBe(0.95);
    expect(r?.evidencia.regla_id).toBe('r-azar');
    expect(r?.evidencia.comercio_id).toBe('c1');
  });

  it('input <5 chars devuelve null (skip CIT, GAB, NGO)', async () => {
    const capa = crearCapaComercio(
      lookupFijo([{ id: 'c1', nombreNormalizado: 'COPETROL', categoriaId: 'x' }]),
    );
    expect(await capa.evaluar('CIT')).toBeNull();
    expect(await capa.evaluar('GAB')).toBeNull();
    expect(await capa.evaluar('AB')).toBeNull();
    expect(await capa.evaluar('AB CD')).toBeNull();
  });

  it('score parcial < 0.75 → null (skip falso positivo SAN CAYETANO en COMERC SAN CAYETANO)', async () => {
    const capa = crearCapaComercio(
      lookupFijo([
        { id: 'c1', nombreNormalizado: 'SAN CAYETANO', categoriaId: 'cat-super' },
      ]),
    );
    const r = await capa.evaluar('COMERC SAN CAYETANO');
    expect(r).toBeNull();
  });

  it('score parcial >= 0.75 sigue funcionando', async () => {
    const capa = crearCapaComercio(
      lookupFijo([
        { id: 'c1', nombreNormalizado: 'COPETROL CENTRO', categoriaId: 'cat-comb' },
      ]),
    );
    const r = await capa.evaluar('COPETROL CENTRO PY');
    expect(r?.categoriaId).toBe('cat-comb');
  });

  it('match parcial NO propaga fuente del catálogo (usa nombre 0.8)', async () => {
    const capa = crearCapaComercio(
      lookupFijo([
        {
          id: 'c1',
          nombreNormalizado: 'COPETROL CENTRO',
          categoriaId: 'cat-comb',
          fuentePrev: 'mcc',
          confianzaPrev: 0.75,
        },
      ]),
    );
    const r = await capa.evaluar('COPETROL CENTRO 2');
    expect(r?.fuente).toBe('nombre');
    expect(r?.confianza).toBe(0.8);
  });
});
