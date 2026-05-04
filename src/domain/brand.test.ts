import { describe, it, expect } from 'vitest';
import { extractBrand } from './brand.js';

describe('extractBrand', () => {
  it('separa por guion: BRISTOL-YPANE → BRISTOL', () => {
    expect(extractBrand('BRISTOL-YPANE')).toBe('BRISTOL');
    expect(extractBrand('BRISTOL-VAQUERIA')).toBe('BRISTOL');
  });

  it('quita sufijo numérico: ENERGY 2 → ENERGY', () => {
    expect(extractBrand('ENERGY 2')).toBe('ENERGY');
    expect(extractBrand('UPAY S2')).toBe('UPAY S');
  });

  it('mantiene marca multi-palabra: EL CACIQUE-ITAUGUA → EL CACIQUE', () => {
    expect(extractBrand('EL CACIQUE-ITAUGUA')).toBe('EL CACIQUE');
    expect(extractBrand('EL CACIQUE-LUQUE')).toBe('EL CACIQUE');
  });

  it('una palabra: COPETROL → COPETROL', () => {
    expect(extractBrand('COPETROL')).toBe('COPETROL');
  });

  it('quita números romanos suffix: KAMPERS II → KAMPERS', () => {
    expect(extractBrand('KAMPERS II')).toBe('KAMPERS');
  });

  it('quita S.A./SRL/LTDA: BIGGIE S.A. → BIGGIE', () => {
    expect(extractBrand('BIGGIE S.A.')).toBe('BIGGIE');
    expect(extractBrand('TIGO S.A.')).toBe('TIGO');
  });

  it('quita SUCURSAL/CENTRO: SUPER X CENTRO → SUPER X', () => {
    expect(extractBrand('SUPER X CENTRO')).toBe('SUPER X');
    expect(extractBrand('FARMACENTER SUCURSAL')).toBe('FARMACENTER');
  });

  it('input vacío/null → null', () => {
    expect(extractBrand('')).toBeNull();
    expect(extractBrand(null)).toBeNull();
    expect(extractBrand(undefined)).toBeNull();
  });

  it('marca corta (<4 chars) → null', () => {
    expect(extractBrand('ABC')).toBeNull();
    expect(extractBrand('XY-CENTRO')).toBeNull();
  });

  it('quita slash: FOO/BAR → FOO', () => {
    expect(extractBrand('TIGO/PARAGUAY')).toBe('TIGO');
  });
});
