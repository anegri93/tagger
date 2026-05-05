import { describe, it, expect } from 'vitest';
import { comerciosCatalogo } from './comercios_catalogo.js';

describe('comercios_catalogo schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(comerciosCatalogo);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'nombre',
        'nombreBancard',
        'nombreNormalizado',
        'categoriaId',
        'mcc',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('nombre y nombreNormalizado notNull', () => {
    expect(comerciosCatalogo.nombre.notNull).toBe(true);
    expect(comerciosCatalogo.nombreNormalizado.notNull).toBe(true);
  });

  it('nombreBancard y mcc son nullable', () => {
    expect(comerciosCatalogo.nombreBancard.notNull).toBe(false);
    expect(comerciosCatalogo.mcc.notNull).toBe(false);
  });

  it('categoriaId notNull', () => {
    expect(comerciosCatalogo.categoriaId.notNull).toBe(true);
  });

  it('columnas recategorización (categoriaNuevaId, fuenteNueva, confianzaNueva, recategorizadoAt) nullable', () => {
    expect(comerciosCatalogo.categoriaNuevaId.notNull).toBe(false);
    expect(comerciosCatalogo.fuenteNueva.notNull).toBe(false);
    expect(comerciosCatalogo.confianzaNueva.notNull).toBe(false);
    expect(comerciosCatalogo.recategorizadoAt.notNull).toBe(false);
  });
});
