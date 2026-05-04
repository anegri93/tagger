import { describe, it, expect } from 'vitest';
import { movimientos, fuenteCategoriaEnum } from './movimientos.js';

describe('movimientos schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(movimientos);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'descripcion',
        'nombreComercio',
        'nombreBancard',
        'mcc',
        'monto',
        'categoriaPredichaId',
        'categoriaConfirmadaId',
        'fuenteCategoria',
        'confianza',
        'requiereRevision',
        'rawInput',
        'evidencia',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('id primary key', () => {
    expect(movimientos.id.primary).toBe(true);
  });

  it('requiereRevision default false notNull', () => {
    expect(movimientos.requiereRevision.default).toBe(false);
    expect(movimientos.requiereRevision.notNull).toBe(true);
  });

  it('fuenteCategoria enum incluye todos los valores', () => {
    expect(fuenteCategoriaEnum.enumValues).toEqual([
      'regex',
      'bancard',
      'nombre',
      'mcc',
      'ia',
      'manual',
    ]);
  });

  it('categorias predicha/confirmada nullable', () => {
    expect(movimientos.categoriaPredichaId.notNull).toBe(false);
    expect(movimientos.categoriaConfirmadaId.notNull).toBe(false);
  });
});
