import { describe, it, expect } from 'vitest';
import { categorizarRequestSchema } from './categorizar.js';

describe('categorizar request schema', () => {
  it('acepta input mínimo (solo descripcion)', () => {
    const r = categorizarRequestSchema.safeParse({ descripcion: 'BIGGIE' });
    expect(r.success).toBe(true);
  });

  it('rechaza input vacío (sin ningún campo de match)', () => {
    const r = categorizarRequestSchema.safeParse({ monto: 10 });
    expect(r.success).toBe(false);
  });

  it('valida formato mcc (2-4 dígitos)', () => {
    expect(categorizarRequestSchema.safeParse({ mcc: '5411' }).success).toBe(true);
    expect(categorizarRequestSchema.safeParse({ mcc: 'abcd' }).success).toBe(false);
    expect(categorizarRequestSchema.safeParse({ mcc: '1' }).success).toBe(false);
  });

  it('mcc vacío/SIN RUBRO/null/N/A → undefined (válido si hay otro campo)', () => {
    const cases = ['', 'SIN RUBRO', 'sin rubro', 'null', 'NULL', 'N/A', 'na', '   '];
    for (const v of cases) {
      const r = categorizarRequestSchema.safeParse({ nombre_bancard: 'BIGGIE', mcc: v });
      expect(r.success, `caso ${JSON.stringify(v)}`).toBe(true);
      if (r.success) expect(r.data.mcc).toBeUndefined();
    }
  });

  it('mcc con espacios alrededor → trim ok', () => {
    const r = categorizarRequestSchema.safeParse({ mcc: '  5411  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mcc).toBe('5411');
  });

  it('monto debe ser finito', () => {
    expect(
      categorizarRequestSchema.safeParse({ descripcion: 'X', monto: Infinity }).success,
    ).toBe(false);
  });
});
