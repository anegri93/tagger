import { describe, it, expect, vi } from 'vitest';
import { crearCapaMcc, type MccEntry, type MccPorNombreLookup } from './mcc.js';

function lookupFijo(map: Record<string, MccEntry>) {
  return { porCodigo: vi.fn(async (k: string) => map[k] ?? null) };
}

describe('capa mcc — MCC directo', () => {
  it('hit no ambiguo devuelve categoría', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5411': { codMcc: '5411', categoriaId: 'cat-super', ambiguo: false } }),
    );
    const r = await capa.evaluar({ mcc: '5411' });
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.fuente).toBe('mcc');
    expect(r?.confianza).toBe(0.75);
    expect(r?.evidencia?.mcc_match).toBe('5411');
  });

  it('ambiguo matchea con confianza baja + evidencia mcc_ambiguo', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5999': { codMcc: '5999', categoriaId: 'cat-misc', ambiguo: true } }),
    );
    const r = await capa.evaluar({ mcc: '5999' });
    expect(r?.categoriaId).toBe('cat-misc');
    expect(r?.fuente).toBe('mcc');
    expect(r?.confianza).toBe(0.5);
    expect(r?.evidencia?.mcc_ambiguo).toBe(true);
  });

  it('no encontrado devuelve null', async () => {
    const capa = crearCapaMcc(lookupFijo({}));
    expect(await capa.evaluar({ mcc: '0000' })).toBeNull();
  });

  it('sin categoriaId devuelve null', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5411': { codMcc: '5411', categoriaId: null, ambiguo: false } }),
    );
    expect(await capa.evaluar({ mcc: '5411' })).toBeNull();
  });

  it('input vacío sin nombre ni mcc devuelve null', async () => {
    const capa = crearCapaMcc(lookupFijo({}));
    expect(await capa.evaluar({})).toBeNull();
    expect(await capa.evaluar({ mcc: '' })).toBeNull();
    expect(await capa.evaluar({ mcc: '   ' })).toBeNull();
  });
});

describe('capa mcc — MCC inferido por nombre', () => {
  function porNombreFijo(map: Record<string, { mcc: string; categoriaId: string }>): MccPorNombreLookup {
    return {
      porNombre: vi.fn(async (nombre: string) => {
        const hit = map[nombre.toUpperCase()];
        return hit ? { ...hit, requiereRevision: false } : null;
      }),
    };
  }

  it('input sin MCC pero con nombre conocido → infiere MCC', async () => {
    const capa = crearCapaMcc(
      lookupFijo({}),
      porNombreFijo({ 'SHELL LDM': { mcc: '5541', categoriaId: 'cat-gas' } }),
    );
    const r = await capa.evaluar({ nombreBancard: 'SHELL LDM' });
    expect(r?.categoriaId).toBe('cat-gas');
    expect(r?.fuente).toBe('mcc');
    expect(r?.evidencia?.mcc_inferido_por_nombre).toBe(true);
  });

  it('input con MCC directo gana sobre fallback por nombre', async () => {
    const capa = crearCapaMcc(
      lookupFijo({ '5411': { codMcc: '5411', categoriaId: 'cat-super', ambiguo: false } }),
      porNombreFijo({ 'SHELL LDM': { mcc: '5541', categoriaId: 'cat-gas' } }),
    );
    const r = await capa.evaluar({ mcc: '5411', nombreBancard: 'SHELL LDM' });
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.evidencia?.mcc_inferido_por_nombre).toBeUndefined();
  });

  it('nombre no en catálogo devuelve null', async () => {
    const capa = crearCapaMcc(lookupFijo({}), porNombreFijo({}));
    expect(await capa.evaluar({ nombreBancard: 'desconocido' })).toBeNull();
  });
});
