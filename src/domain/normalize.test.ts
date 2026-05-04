import { describe, it, expect } from 'vitest';
import { normalize } from './normalize.js';

describe('normalize', () => {
  it('uppercase + colapsa espacios + remueve puntuación', () => {
    expect(normalize('Biggie  S.A.')).toBe('BIGGIE SA');
  });

  it('strip acentos manteniendo letras', () => {
    expect(normalize('Petróleos Paraguayos')).toBe('PETROLEOS PARAGUAYOS');
    expect(normalize('Café Martínez')).toBe('CAFE MARTINEZ');
  });

  it('preserva ñ y Ñ', () => {
    expect(normalize('señor')).toBe('SEÑOR');
    expect(normalize('PEÑA')).toBe('PEÑA');
  });

  it('preserva números', () => {
    expect(normalize('shell estación 24')).toBe('SHELL ESTACION 24');
  });

  it('trim espacios extremos', () => {
    expect(normalize('   COPETROL   ')).toBe('COPETROL');
  });

  it('remueve guiones y separadores comunes', () => {
    expect(normalize('PUNTO-FARMA')).toBe('PUNTO FARMA');
    expect(normalize('NET/COMPRA')).toBe('NET COMPRA');
  });

  it('null/undefined/empty devuelve cadena vacía', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize('')).toBe('');
  });

  it('remueve simbolos varios', () => {
    expect(normalize('TIENDA #1 (sucursal)')).toBe('TIENDA 1 SUCURSAL');
  });
});
