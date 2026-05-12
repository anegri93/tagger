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

  it('acepta origen y batch_id opcionales', () => {
    const r = categorizarRequestSchema.safeParse({
      nombre_bancard: 'BIGGIE',
      origen: 'test_masivo',
      batch_id: 'baseline-v1',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.origen).toBe('test_masivo');
      expect(r.data.batch_id).toBe('baseline-v1');
    }
  });

  it('rechaza batch_id muy largo', () => {
    const r = categorizarRequestSchema.safeParse({
      nombre_bancard: 'X',
      batch_id: 'x'.repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it('acepta bypass_catalogo bool', () => {
    const r = categorizarRequestSchema.safeParse({
      nombre_bancard: 'X',
      bypass_catalogo: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bypass_catalogo).toBe(true);
  });

  it('monto debe ser finito', () => {
    expect(categorizarRequestSchema.safeParse({ descripcion: 'X', monto: Infinity }).success).toBe(
      false,
    );
  });
});
