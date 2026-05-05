import { describe, it, expect } from 'vitest';
import { CONFIANZA, THRESHOLD_REVISION, confianzaPorFuente, requiereRevision } from './confianza.js';

describe('confianza', () => {
  it('valores fijos por fuente', () => {
    expect(CONFIANZA.regex).toBe(0.95);
    expect(CONFIANZA.bancard).toBe(0.9);
    expect(CONFIANZA.nombre).toBe(0.8);
    expect(CONFIANZA.mcc).toBe(0.75);
    expect(CONFIANZA.ia_max).toBe(0.7);
    expect(CONFIANZA.manual).toBe(1.0);
    expect(CONFIANZA.literal).toBe(0.95);
    expect(CONFIANZA.prefijo).toBe(0.9);
    expect(CONFIANZA.contiene).toBe(0.9);
  });

  it('THRESHOLD_REVISION = 0.70', () => {
    expect(THRESHOLD_REVISION).toBe(0.7);
  });

  it('frozen', () => {
    expect(Object.isFrozen(CONFIANZA)).toBe(true);
  });

  it('confianzaPorFuente cubre todos los casos', () => {
    expect(confianzaPorFuente('regex')).toBe(0.95);
    expect(confianzaPorFuente('bancard')).toBe(0.9);
    expect(confianzaPorFuente('nombre')).toBe(0.8);
    expect(confianzaPorFuente('mcc')).toBe(0.75);
    expect(confianzaPorFuente('ia')).toBe(0.7);
    expect(confianzaPorFuente('manual')).toBe(1.0);
    expect(confianzaPorFuente('patrones')).toBe(0.9);
    expect(confianzaPorFuente('literal')).toBe(0.95);
    expect(confianzaPorFuente('prefijo')).toBe(0.9);
    expect(confianzaPorFuente('contiene')).toBe(0.9);
  });

  it('requiereRevision aplica threshold', () => {
    expect(requiereRevision(0.69)).toBe(true);
    expect(requiereRevision(0.7)).toBe(false);
    expect(requiereRevision(0.95)).toBe(false);
  });
});
