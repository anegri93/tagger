import { describe, it, expect, vi } from 'vitest';
import { crearCapaCatalogo, type CatalogoHit } from './catalogo.js';

function lookup(hit: CatalogoHit | null, hitNombre: CatalogoHit | null = null) {
  return {
    porBancardCodigo: vi.fn().mockResolvedValue(hit),
    porNombre: vi.fn().mockResolvedValue(hitNombre),
  };
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

  it('hit con requiereRevision propaga (no skip) — confianza baja activará revisión en persistir', async () => {
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
    const r = await capa.evaluar('X', 'Y');
    expect(r?.fuente).toBe('mcc');
    expect(r?.confianza).toBe(0.3);
    expect(r?.categoriaId).toBe('cat-otros');
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
