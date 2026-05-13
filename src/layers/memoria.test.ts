import { describe, it, expect, vi } from 'vitest';
import { crearCapaMemoria, extraerDestinatarioTransferencia } from './memoria.js';
import type { MovimientoInput } from '../domain/types.js';

describe('extraerDestinatarioTransferencia', () => {
  it('extrae destinatario de MANGO-NOMBRE', () => {
    const r = extraerDestinatarioTransferencia('MANGO-PEREZ JUAN');
    expect(r?.raw).toBe('PEREZ JUAN');
    expect(r?.normalizado).toBe('PEREZ JUAN');
  });

  it('extrae con espacios al inicio/final', () => {
    const r = extraerDestinatarioTransferencia('  MANGO-AGUILERA NAHOMI  ');
    expect(r?.raw).toBe('AGUILERA NAHOMI');
  });

  it('soporta MANGO con espacio en vez de guion', () => {
    const r = extraerDestinatarioTransferencia('MANGO GONZALEZ MARIA');
    expect(r?.raw).toBe('GONZALEZ MARIA');
  });

  it('case-insensitive', () => {
    const r = extraerDestinatarioTransferencia('mango-ruiz');
    expect(r?.raw).toBe('ruiz');
  });

  it('null si no es transferencia', () => {
    expect(extraerDestinatarioTransferencia('BIGGIE-SHOPPING')).toBeNull();
    expect(extraerDestinatarioTransferencia('SHELL LDM')).toBeNull();
  });

  it('null para input vacío o sin destinatario', () => {
    expect(extraerDestinatarioTransferencia(null)).toBeNull();
    expect(extraerDestinatarioTransferencia(undefined)).toBeNull();
    expect(extraerDestinatarioTransferencia('')).toBeNull();
    expect(extraerDestinatarioTransferencia('MANGO-')).toBeNull();
    expect(extraerDestinatarioTransferencia('MANGO- ')).toBeNull();
  });

  it('normaliza diacríticos', () => {
    const r = extraerDestinatarioTransferencia('MANGO-PEÑA RODRÍGUEZ');
    expect(r?.normalizado).toBe('PEÑA RODRIGUEZ');
  });
});

describe('crearCapaMemoria', () => {
  function lookup(hit: { categoriaId: string } | null) {
    return {
      buscar: vi
        .fn()
        .mockResolvedValue(
          hit
            ? {
                ...hit,
                categoriaSlug: 'alquiler',
                categoriaNombre: 'Alquiler',
                destinatario: 'X',
                hits: 1,
              }
            : null,
        ),
    };
  }

  const input: MovimientoInput = { nombreBancard: 'MANGO-PEREZ JUAN' };

  it('devuelve null sin usuario', async () => {
    const capa = crearCapaMemoria(lookup({ categoriaId: 'cat-a' }));
    expect(await capa.evaluar(input, null)).toBeNull();
  });

  it('devuelve null si no es transferencia', async () => {
    const capa = crearCapaMemoria(lookup({ categoriaId: 'cat-a' }));
    expect(await capa.evaluar({ nombreBancard: 'BIGGIE' }, 'u1')).toBeNull();
  });

  it('devuelve null si no hay hit', async () => {
    const capa = crearCapaMemoria(lookup(null));
    expect(await capa.evaluar(input, 'u1')).toBeNull();
  });

  it('devuelve resultado con fuente=manual + confianza 1.00 + evidencia memoria_destinatario', async () => {
    const capa = crearCapaMemoria(lookup({ categoriaId: 'cat-alquiler' }));
    const r = await capa.evaluar(input, 'u1');
    expect(r).toEqual({
      categoriaId: 'cat-alquiler',
      confianza: 1.0,
      fuente: 'manual',
      evidencia: { memoria_destinatario: 'PEREZ JUAN' },
    });
  });

  it('llama lookup con usuario y destinatario normalizado', async () => {
    const lk = lookup({ categoriaId: 'cat-a' });
    const capa = crearCapaMemoria(lk);
    await capa.evaluar({ nombreBancard: 'MANGO-PEÑA RODRÍGUEZ' }, 'usuario_42');
    expect(lk.buscar).toHaveBeenCalledWith('usuario_42', 'PEÑA RODRIGUEZ');
  });
});
