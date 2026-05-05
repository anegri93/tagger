import { describe, it, expect } from 'vitest';
import { patrones, patronTipo, patronFuente } from './patrones.js';

describe('patrones schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(patrones);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'tipo',
        'valor',
        'categoriaId',
        'prioridad',
        'activo',
        'fuente',
        'descripcion',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('tipo, valor y categoriaId son notNull', () => {
    expect(patrones.tipo.notNull).toBe(true);
    expect(patrones.valor.notNull).toBe(true);
    expect(patrones.categoriaId.notNull).toBe(true);
  });

  it('prioridad default 100', () => {
    expect(patrones.prioridad.default).toBe(100);
  });

  it('activo default true', () => {
    expect(patrones.activo.default).toBe(true);
  });

  it('fuente default manual', () => {
    expect(patrones.fuente.default).toBe('manual');
  });

  it('enum tipo expone valores esperados', () => {
    expect(patronTipo.enumValues).toEqual(['regex', 'literal', 'prefijo', 'contiene']);
  });

  it('enum fuente expone valores esperados', () => {
    expect(patronFuente.enumValues).toEqual(['manual', 'catalogo_bancard', 'auto']);
  });
});
