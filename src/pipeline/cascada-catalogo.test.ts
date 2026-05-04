import { describe, it, expect } from 'vitest';
import { categorizarComercio, type CascadaCtx, type PatronNombre } from './cascada-catalogo.js';

const CTX: CascadaCtx = {
  reglas: [
    { id: 'r1', patron: '^MANGO\\b', categoriaId: 'cat-transferencia', prioridad: 1 },
    { id: 'r2', patron: 'AZAR|SLOTS', categoriaId: 'cat-azar', prioridad: 2 },
  ],
  mccPorCodigo: new Map([
    ['5411', { codMcc: '5411', categoriaId: 'cat-supermercado', ambiguo: false }],
    ['7299', { codMcc: '7299', categoriaId: null, ambiguo: false }],
  ]),
  patronesNombre: [
    {
      re: /FARMACI/i,
      categoriaSlug: 'farmacia',
      categoriaId: 'cat-farmacia',
      nombre: 'farmacia',
    } satisfies PatronNombre,
  ],
  categoriaOtrosId: 'cat-otros',
};

describe('categorizarComercio', () => {
  it('regla regex MANGO → transferencia', () => {
    const r = categorizarComercio(
      { nombre: 'MANGO-PEREZ JOSE', bancardId: 'X', codigoComercio: '1', mcc: '7299' },
      CTX,
    );
    expect(r.fuente).toBe('regex');
    expect(r.categoriaId).toBe('cat-transferencia');
  });

  it('MCC mapeado → categoría correspondiente', () => {
    const r = categorizarComercio(
      { nombre: 'COMERCIAL X', bancardId: 'X', codigoComercio: '2', mcc: '5411' },
      CTX,
    );
    expect(r.fuente).toBe('mcc');
    expect(r.categoriaId).toBe('cat-supermercado');
  });

  it('MCC sin mapeo → patron nombre', () => {
    const r = categorizarComercio(
      { nombre: 'FARMACITY CENTRO', bancardId: 'F', codigoComercio: '3', mcc: '7299' },
      CTX,
    );
    expect(r.fuente).toBe('nombre');
    expect(r.categoriaId).toBe('cat-farmacia');
  });

  it('fallback otros + requiere revisión', () => {
    const r = categorizarComercio(
      { nombre: 'COMERCIO RARO', bancardId: 'R', codigoComercio: '4', mcc: '7299' },
      CTX,
    );
    expect(r.categoriaId).toBe('cat-otros');
    expect(r.requiereRevision).toBe(true);
  });

  it('MCC inferido → categoria con confianza 0.6 + revisión', () => {
    const r = categorizarComercio(
      {
        nombre: 'BRISTOL YPANE',
        bancardId: 'B',
        codigoComercio: '99',
        mcc: '5411',
        marca: 'BRISTOL',
        mccInferido: true,
      },
      CTX,
    );
    expect(r.fuente).toBe('mcc');
    expect(r.confianza).toBe(0.6);
    expect(r.requiereRevision).toBe(true);
    expect(r.evidencia.mcc_inferido).toBe(true);
    expect(r.evidencia.marca).toBe('BRISTOL');
  });

  it('MCC directo (no inferido) sigue confianza 0.75', () => {
    const r = categorizarComercio(
      { nombre: 'COMERCIAL X', bancardId: 'X', codigoComercio: '2', mcc: '5411' },
      CTX,
    );
    expect(r.confianza).toBe(0.75);
    expect(r.requiereRevision).toBe(false);
    expect(r.evidencia.mcc_inferido).toBeUndefined();
  });

  it('regex tiene prioridad sobre MCC', () => {
    const r = categorizarComercio(
      { nombre: 'AZAR LATINO', bancardId: 'A', codigoComercio: '5', mcc: '5411' },
      CTX,
    );
    expect(r.fuente).toBe('regex');
    expect(r.categoriaId).toBe('cat-azar');
  });
});
