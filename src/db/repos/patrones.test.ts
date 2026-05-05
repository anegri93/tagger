import { describe, it, expect } from 'vitest';
import { validarRegex } from './patrones.js';

describe('patrones repo helpers', () => {
  describe('validarRegex', () => {
    it('acepta regex válida', () => {
      expect(validarRegex('\\bBIGGIE\\b')).toBe(true);
      expect(validarRegex('CIAL|HIPER')).toBe(true);
      expect(validarRegex('(?:^|\\s)mercado')).toBe(true);
    });

    it('rechaza regex inválida', () => {
      expect(validarRegex('[unclosed')).toBe(false);
      expect(validarRegex('(unclosed')).toBe(false);
      expect(validarRegex('*invalid')).toBe(false);
    });
  });
});
