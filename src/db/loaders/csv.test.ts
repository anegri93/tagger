import { describe, it, expect } from 'vitest';
import { readCsv } from './csv.js';

describe('readCsv', () => {
  it('retorna [] si archivo no existe', () => {
    const rows = readCsv('data/no-existe.tsv');
    expect(rows).toEqual([]);
  });
});
