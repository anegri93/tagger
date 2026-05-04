import { describe, it, expect, vi } from 'vitest';
import { crearCapaCatalogo, type CatalogoHit } from './catalogo.js';

function lookup(hit: CatalogoHit | null) {
  return { porBancardCodigo: vi.fn().mockResolvedValue(hit) };
}

describe('capa catalogo', () => {
  it('hit con fuente/confianza propaga', async () => {
    const capa = crearCapaCatalogo(
      lookup({
        id: 'c1',
        categoriaId: 'cat-azar',
        fuente: 'regex',
        confianza: 0.95,
        requiereRevision: false,
        evidencia: { regla_id: 'r1', patron: 'AZAR' },
      }),
    );
    const r = await capa.evaluar('AZAR LATINO', '1428694');
    expect(r?.fuente).toBe('regex');
    expect(r?.confianza).toBe(0.95);
    expect(r?.evidencia.regla_id).toBe('r1');
    expect(r?.evidencia.comercio_id).toBe('c1');
  });

  it('hit con requiereRevision → null (no usa)', async () => {
    const capa = crearCapaCatalogo(
      lookup({
        id: 'c1',
        categoriaId: 'cat-otros',
        fuente: 'mcc',
        confianza: 0.3,
        requiereRevision: true,
        evidencia: null,
      }),
    );
    expect(await capa.evaluar('X', 'Y')).toBeNull();
  });

  it('sin bancardId → null', async () => {
    const capa = crearCapaCatalogo(lookup(null));
    expect(await capa.evaluar(null, '1')).toBeNull();
  });

  it('miss → null', async () => {
    const capa = crearCapaCatalogo(lookup(null));
    expect(await capa.evaluar('X', 'Y')).toBeNull();
  });
});
