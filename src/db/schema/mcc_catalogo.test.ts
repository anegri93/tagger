import { describe, it, expect } from 'vitest';
import { mccCatalogo } from './mcc_catalogo.js';

describe('mcc_catalogo schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(mccCatalogo);
    expect(cols).toEqual(
      expect.arrayContaining([
        'codMcc',
        'codRubro',
        'descRubro',
        'descripcion',
        'categoriaId',
        'ambiguo',
        'source',
      ]),
    );
  });

  it('codMcc es primary key', () => {
    expect(mccCatalogo.codMcc.primary).toBe(true);
  });

  it('categoriaId nullable (set null on delete)', () => {
    expect(mccCatalogo.categoriaId.notNull).toBe(false);
  });

  it('ambiguo default false', () => {
    expect(mccCatalogo.ambiguo.default).toBe(false);
    expect(mccCatalogo.ambiguo.notNull).toBe(true);
  });
});
