import { describe, it, expect } from 'vitest';
import { reglasRegex } from './reglas_regex.js';

describe('reglas_regex schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(reglasRegex);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'patron',
        'categoriaId',
        'prioridad',
        'activo',
        'descripcion',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('patron y categoriaId son notNull', () => {
    expect(reglasRegex.patron.notNull).toBe(true);
    expect(reglasRegex.categoriaId.notNull).toBe(true);
  });

  it('prioridad default 100', () => {
    expect(reglasRegex.prioridad.default).toBe(100);
  });

  it('activo default true', () => {
    expect(reglasRegex.activo.default).toBe(true);
  });
});
