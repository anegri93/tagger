import { describe, it, expect } from 'vitest';
import { correccionesUsuario } from './correcciones_usuario.js';

describe('correcciones_usuario schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(correccionesUsuario);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'movimientoId',
        'categoriaAnteriorId',
        'categoriaNuevaId',
        'usuario',
        'motivo',
        'createdAt',
      ]),
    );
  });

  it('movimientoId y categoriaNuevaId notNull', () => {
    expect(correccionesUsuario.movimientoId.notNull).toBe(true);
    expect(correccionesUsuario.categoriaNuevaId.notNull).toBe(true);
  });

  it('categoriaAnteriorId nullable', () => {
    expect(correccionesUsuario.categoriaAnteriorId.notNull).toBe(false);
  });
});
