import { describe, it, expect } from 'vitest';
import { categorias } from './categorias.js';

describe('categorias schema', () => {
  it('expone columnas esperadas', () => {
    const cols = Object.keys(categorias);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'slug',
        'nombre',
        'descripcion',
        'activo',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('id es primary key', () => {
    expect(categorias.id.primary).toBe(true);
  });

  it('slug es notNull y unique', () => {
    expect(categorias.slug.notNull).toBe(true);
    expect(categorias.slug.isUnique).toBe(true);
  });

  it('activo default true', () => {
    expect(categorias.activo.default).toBe(true);
    expect(categorias.activo.notNull).toBe(true);
  });

  it('descripcion es nullable', () => {
    expect(categorias.descripcion.notNull).toBe(false);
  });
});
