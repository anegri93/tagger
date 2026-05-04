import { describe, it, expect, vi } from 'vitest';
import { crearIaFallback } from './ia-fallback.js';
import type { CapaIa } from '../layers/ia.js';

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function flushImmediate() {
  return new Promise((r) => setImmediate(r));
}

describe('ia-fallback', () => {
  it('schedule no bloquea (sincrónico) y eventualmente actualiza DB', async () => {
    const capa: CapaIa = {
      evaluar: vi.fn().mockResolvedValue({
        categoriaId: 'cat-x',
        confianza: 0.65,
        fuente: 'ia',
        evidencia: { ia_prompt: 'p', ia_response: 'r' },
      }),
    };
    const updater = { actualizarPrediccion: vi.fn().mockResolvedValue(undefined) };
    const fb = crearIaFallback({ capa, updater, logger: noopLogger });

    fb.schedule('mov-1', { descripcion: 'X' });
    expect(updater.actualizarPrediccion).not.toHaveBeenCalled();

    await flushImmediate();
    await flushImmediate();

    expect(updater.actualizarPrediccion).toHaveBeenCalledWith(
      'mov-1',
      expect.objectContaining({ categoriaId: 'cat-x', fuente: 'ia', confianza: 0.65 }),
    );
  });

  it('si capa devuelve null, no llama updater pero loggea warn', async () => {
    const capa: CapaIa = { evaluar: vi.fn().mockResolvedValue(null) };
    const updater = { actualizarPrediccion: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fb = crearIaFallback({ capa, updater, logger });

    fb.schedule('mov-2', { descripcion: 'Y' });
    await flushImmediate();
    await flushImmediate();

    expect(updater.actualizarPrediccion).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('error en capa no propaga, loggea error', async () => {
    const capa: CapaIa = { evaluar: vi.fn().mockRejectedValue(new Error('boom')) };
    const updater = { actualizarPrediccion: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fb = crearIaFallback({ capa, updater, logger });

    expect(() => fb.schedule('mov-3', {})).not.toThrow();
    await flushImmediate();
    await flushImmediate();

    expect(logger.error).toHaveBeenCalled();
    expect(updater.actualizarPrediccion).not.toHaveBeenCalled();
  });
});
