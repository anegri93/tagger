import { describe, it, expect, vi } from 'vitest';
import { ejecutarCascada, type CapasSincrono } from './categorizar.js';
import type { ResultadoCapa } from '../domain/types.js';

const HIT_MCC: ResultadoCapa = {
  categoriaId: 'c-mcc',
  confianza: 0.75,
  fuente: 'mcc',
  evidencia: { mcc_match: '5411' },
};
const HIT_PATRONES: ResultadoCapa = {
  categoriaId: 'c-patrones',
  confianza: 0.9,
  fuente: 'patrones',
  evidencia: { regla_id: 'p1', patron: 'CIAL' },
};

function stubCapas(overrides: Partial<Record<keyof CapasSincrono, ResultadoCapa | null>> = {}): CapasSincrono {
  return {
    patrones: { evaluar: vi.fn().mockResolvedValue(overrides.patrones ?? null) },
    mcc: { evaluar: vi.fn().mockResolvedValue(overrides.mcc ?? null) },
  };
}

describe('pipeline cascada', () => {
  it('patrones acierta → no llama mcc', async () => {
    const capas = stubCapas({ patrones: HIT_PATRONES });
    const r = await ejecutarCascada({ descripcion: 'BIGGIE' }, capas);
    expect(r.resultado).toEqual(HIT_PATRONES);
    expect(r.requiereRevision).toBe(false);
    expect(r.requiereIa).toBe(false);
    expect(capas.mcc.evaluar).not.toHaveBeenCalled();
  });

  it('patrones falla, mcc acierta', async () => {
    const capas = stubCapas({ mcc: HIT_MCC });
    const r = await ejecutarCascada({ nombreComercio: 'X', mcc: '5411' }, capas);
    expect(r.resultado).toEqual(HIT_MCC);
  });

  it('patrones gana sobre mcc', async () => {
    const capas = stubCapas({ patrones: HIT_PATRONES, mcc: HIT_MCC });
    const r = await ejecutarCascada({ nombreComercio: 'CIAL', mcc: '5411' }, capas);
    expect(r.resultado).toEqual(HIT_PATRONES);
    expect(capas.mcc.evaluar).not.toHaveBeenCalled();
  });

  it('solo mcc, sin texto, mcc acierta', async () => {
    const capas = stubCapas({ mcc: HIT_MCC });
    const r = await ejecutarCascada({ mcc: '5411' }, capas);
    expect(r.resultado).toEqual(HIT_MCC);
  });

  it('ninguna capa acierta → requiere_revision + requiere_ia', async () => {
    const capas = stubCapas();
    const r = await ejecutarCascada({ descripcion: 'X', mcc: '0000' }, capas);
    expect(r.resultado).toBeNull();
    expect(r.requiereRevision).toBe(true);
    expect(r.requiereIa).toBe(true);
  });

  it('input vacío salta capa patrones pero llama mcc', async () => {
    const capas = stubCapas();
    await ejecutarCascada({ mcc: '5411' }, capas);
    expect(capas.patrones?.evaluar).not.toHaveBeenCalled();
    expect(capas.mcc.evaluar).toHaveBeenCalledWith('5411');
  });
});
