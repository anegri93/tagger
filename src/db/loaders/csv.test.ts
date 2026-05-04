import { describe, it, expect } from 'vitest';
import { readCsv } from './csv.js';

describe('readCsv', () => {
  it('lee TSV existente con headers', () => {
    const rows = readCsv<{ MCC: string; 'MCC Descripción': string }>('data/mcc-general.tsv');
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first?.MCC).toBeTruthy();
  });

  it('retorna [] si archivo no existe', () => {
    const rows = readCsv('data/no-existe.tsv');
    expect(rows).toEqual([]);
  });
});
