import { describe, it, expect, vi } from 'vitest';
import { crearCapaBancard, type ComercioBancard } from './bancard.js';

const COMERCIO: ComercioBancard = {
  id: 'c1',
  nombreBancard: 'BIGGIE EXPRESS',
  categoriaId: 'cat-supermercado',
};

function lookupFijo(map: Record<string, ComercioBancard>) {
  return {
    porNombreBancard: vi.fn(async (n: string) => map[n] ?? null),
  };
}

describe('capa bancard', () => {
  it('hit por nombre exacto normalizado', async () => {
    const capa = crearCapaBancard(lookupFijo({ 'BIGGIE EXPRESS': COMERCIO }));
    const r = await capa.evaluar('Biggie Express');
    expect(r?.categoriaId).toBe('cat-supermercado');
    expect(r?.fuente).toBe('bancard');
    expect(r?.confianza).toBe(0.9);
    expect(r?.evidencia.comercio_id).toBe('c1');
  });

  it('miss devuelve null', async () => {
    const capa = crearCapaBancard(lookupFijo({}));
    expect(await capa.evaluar('SHELL')).toBeNull();
  });

  it('normaliza acentos antes lookup', async () => {
    const lookup = lookupFijo({ 'COMERCIO PEREZ': { ...COMERCIO, nombreBancard: 'COMERCIO PEREZ' } });
    const capa = crearCapaBancard(lookup);
    const r = await capa.evaluar('Comércio Pérez');
    expect(r).not.toBeNull();
    expect(lookup.porNombreBancard).toHaveBeenCalledWith('COMERCIO PEREZ');
  });

  it('input null/undefined/empty devuelve null', async () => {
    const capa = crearCapaBancard(lookupFijo({}));
    expect(await capa.evaluar(null)).toBeNull();
    expect(await capa.evaluar(undefined)).toBeNull();
    expect(await capa.evaluar('')).toBeNull();
  });
});
