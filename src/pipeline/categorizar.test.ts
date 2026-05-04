import { describe, it, expect, vi } from 'vitest';
import { ejecutarCascada, type CapasSincrono } from './categorizar.js';
import type { ResultadoCapa } from '../domain/types.js';

const HIT_REGEX: ResultadoCapa = {
  categoriaId: 'c-regex',
  confianza: 0.95,
  fuente: 'regex',
  evidencia: { regla_id: 'r1', patron: 'X' },
};
const HIT_BANCARD: ResultadoCapa = {
  categoriaId: 'c-bancard',
  confianza: 0.9,
  fuente: 'bancard',
  evidencia: { comercio_id: 'c1', match_type: 'bancard' },
};
const HIT_COMERCIO: ResultadoCapa = {
  categoriaId: 'c-comercio',
  confianza: 0.8,
  fuente: 'nombre',
  evidencia: { comercio_id: 'c2', match_type: 'nombre_parcial', match_score: 0.5 },
};
const HIT_MCC: ResultadoCapa = {
  categoriaId: 'c-mcc',
  confianza: 0.75,
  fuente: 'mcc',
  evidencia: { mcc_match: '5411' },
};

function stubCapas(overrides: Partial<Record<keyof CapasSincrono, ResultadoCapa | null>> = {}): CapasSincrono {
  return {
    regex: { evaluar: vi.fn().mockResolvedValue(overrides.regex ?? null) },
    bancard: { evaluar: vi.fn().mockResolvedValue(overrides.bancard ?? null) },
    comercio: { evaluar: vi.fn().mockResolvedValue(overrides.comercio ?? null) },
    mcc: { evaluar: vi.fn().mockResolvedValue(overrides.mcc ?? null) },
  };
}

describe('pipeline cascada', () => {
  it('regex acierta → no llama otras capas', async () => {
    const capas = stubCapas({ regex: HIT_REGEX });
    const r = await ejecutarCascada({ descripcion: 'BIGGIE' }, capas);
    expect(r.resultado).toEqual(HIT_REGEX);
    expect(r.requiereRevision).toBe(false);
    expect(r.requiereIa).toBe(false);
    expect(capas.bancard.evaluar).not.toHaveBeenCalled();
  });

  it('regex falla, bancard acierta', async () => {
    const capas = stubCapas({ bancard: HIT_BANCARD });
    const r = await ejecutarCascada({ nombreBancard: 'X' }, capas);
    expect(r.resultado).toEqual(HIT_BANCARD);
    expect(capas.comercio.evaluar).not.toHaveBeenCalled();
  });

  it('regex y bancard fallan, comercio acierta', async () => {
    const capas = stubCapas({ comercio: HIT_COMERCIO });
    const r = await ejecutarCascada({ nombreComercio: 'COPETROL' }, capas);
    expect(r.resultado).toEqual(HIT_COMERCIO);
    expect(capas.mcc.evaluar).not.toHaveBeenCalled();
  });

  it('todo síncrono falla, mcc acierta', async () => {
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

  it('input vacío salta capas de texto pero llama mcc', async () => {
    const capas = stubCapas();
    await ejecutarCascada({ mcc: '5411' }, capas);
    expect(capas.regex.evaluar).not.toHaveBeenCalled();
    expect(capas.bancard.evaluar).toHaveBeenCalled();
    expect(capas.comercio.evaluar).not.toHaveBeenCalled();
    expect(capas.mcc.evaluar).toHaveBeenCalledWith('5411');
  });
});
