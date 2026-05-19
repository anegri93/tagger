import { describe, it, expect, vi } from 'vitest';
import { ejecutarCascada, type CapasSincrono } from './categorizar.js';
import type { ResultadoCapa } from '../domain/types.js';

const HIT_MCC: ResultadoCapa = {
  categoriaId: 'c-mcc',
  confianza: 0.75,
  fuente: 'mcc',
  evidencia: { mcc_match: '5411' },
};
const HIT_REGLAS: ResultadoCapa = {
  categoriaId: 'c-reglas',
  confianza: 0.9,
  fuente: 'contiene',
  evidencia: { regla_id: 'p1', patron: 'CIAL' },
};

function stubCapas(
  overrides: { reglas?: ResultadoCapa | null; mcc?: ResultadoCapa | null } = {},
): CapasSincrono {
  return {
    reglas: { evaluar: vi.fn().mockResolvedValue(overrides.reglas ?? null) },
    mcc: { evaluar: vi.fn().mockResolvedValue(overrides.mcc ?? null) },
  };
}

describe('pipeline cascada', () => {
  it('reglas globales aciertan → no llama mcc', async () => {
    const capas = stubCapas({ reglas: HIT_REGLAS });
    const r = await ejecutarCascada({ descripcion: 'BIGGIE' }, capas);
    expect(r.resultado).toEqual(HIT_REGLAS);
    expect(r.requiereRevision).toBe(false);
    expect(r.requiereIa).toBe(false);
    expect(capas.mcc.evaluar).not.toHaveBeenCalled();
  });

  it('reglas fallan, mcc acierta', async () => {
    const capas = stubCapas({ mcc: HIT_MCC });
    const r = await ejecutarCascada({ nombreComercio: 'X', mcc: '5411' }, capas);
    expect(r.resultado).toEqual(HIT_MCC);
  });

  it('reglas globales ganan sobre mcc', async () => {
    const capas = stubCapas({ reglas: HIT_REGLAS, mcc: HIT_MCC });
    const r = await ejecutarCascada({ nombreComercio: 'CIAL', mcc: '5411' }, capas);
    expect(r.resultado).toEqual(HIT_REGLAS);
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

  it('reglas user-scope con usuario presente disparan antes que globales', async () => {
    const HIT_USER: ResultadoCapa = {
      categoriaId: 'c-user',
      confianza: 1.0,
      fuente: 'manual',
      evidencia: { regla_id: 'r1', patron: 'X' },
    };
    const evaluar = vi
      .fn()
      .mockImplementation((_input, scope: string) =>
        Promise.resolve(scope === 'usuario:u1' ? HIT_USER : null),
      );
    const capas: CapasSincrono = {
      reglas: { evaluar },
      mcc: { evaluar: vi.fn().mockResolvedValue(null) },
    };
    const r = await ejecutarCascada(
      { nombreComercio: 'CIAL' },
      capas,
      { usuario: 'u1' },
    );
    expect(r.resultado).toEqual(HIT_USER);
    expect(evaluar).toHaveBeenCalledWith(expect.anything(), 'usuario:u1');
  });
});
