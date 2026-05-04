import { describe, it, expect, vi } from 'vitest';
import { persistirMovimiento } from './persistir.js';
import type { ResultadoCapa } from '../domain/types.js';

function repoStub(id = 'mov-1') {
  return { insertar: vi.fn().mockResolvedValue({ id }) };
}

const HIT_REGEX: ResultadoCapa = {
  categoriaId: 'c-1',
  confianza: 0.95,
  fuente: 'regex',
  evidencia: { regla_id: 'r1', patron: 'X' },
};

describe('persistir movimiento', () => {
  it('persiste con resultado y no requiere revisión cuando confianza alta', async () => {
    const repo = repoStub();
    const r = await persistirMovimiento(
      { descripcion: 'BIGGIE', monto: 100 },
      { resultado: HIT_REGEX, requiereRevision: false, requiereIa: false },
      repo,
    );
    expect(r.movimientoId).toBe('mov-1');
    expect(r.requiereRevision).toBe(false);
    expect(r.fuente).toBe('regex');
    expect(repo.insertar).toHaveBeenCalledWith(
      expect.objectContaining({
        descripcion: 'BIGGIE',
        monto: '100.00',
        categoriaPredichaId: 'c-1',
        fuenteCategoria: 'regex',
        confianza: '0.95',
        requiereRevision: false,
      }),
    );
  });

  it('requiereRevision=true cuando confianza < THRESHOLD', async () => {
    const repo = repoStub();
    const lowConf: ResultadoCapa = { ...HIT_REGEX, confianza: 0.5 };
    const r = await persistirMovimiento(
      { descripcion: 'X' },
      { resultado: lowConf, requiereRevision: false, requiereIa: false },
      repo,
    );
    expect(r.requiereRevision).toBe(true);
  });

  it('sin resultado → requiere revisión + campos null', async () => {
    const repo = repoStub('mov-2');
    const r = await persistirMovimiento(
      { descripcion: 'desconocido' },
      { resultado: null, requiereRevision: true, requiereIa: true },
      repo,
    );
    expect(r.requiereRevision).toBe(true);
    expect(r.categoriaId).toBeNull();
    expect(r.fuente).toBeNull();
    expect(r.confianza).toBeNull();
  });

  it('monto undefined → null en repo', async () => {
    const repo = repoStub();
    await persistirMovimiento(
      { descripcion: 'X' },
      { resultado: HIT_REGEX, requiereRevision: false, requiereIa: false },
      repo,
    );
    expect(repo.insertar).toHaveBeenCalledWith(expect.objectContaining({ monto: null }));
  });
});
