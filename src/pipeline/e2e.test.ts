// E2E pipeline con repos/capas in-memory. Verifica integración entre orquestador,
// cascada, persistencia y fallback IA sin requerir Postgres.
// Variante con DB real (testcontainers) queda como TODO post-MVP.
import { describe, it, expect, vi } from 'vitest';
import { ejecutarCascada } from './categorizar.js';
import { persistirMovimiento } from './persistir.js';
import { crearIaFallback } from './ia-fallback.js';
import { crearCapaRegex } from '../layers/regex.js';
import { crearCapaBancard } from '../layers/bancard.js';
import { crearCapaComercio } from '../layers/comercio.js';
import { crearCapaMcc } from '../layers/mcc.js';
import { crearCapaCatalogo, type CatalogoHit } from '../layers/catalogo.js';
import { crearCapaIa } from '../layers/ia.js';
import type { OllamaClient } from '../lib/ollama.js';

const noopLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function flushImmediate() {
  return new Promise((r) => setImmediate(r));
}

function mkCapas(opts: {
  reglas?: Array<{ id: string; patron: string; categoriaId: string; prioridad: number }>;
  bancard?: Record<string, { id: string; nombreBancard: string; categoriaId: string }>;
  comercio?: Array<{ id: string; nombreNormalizado: string; categoriaId: string }>;
  mcc?: Record<string, { codMcc: string; categoriaId: string | null; ambiguo: boolean }>;
  catalogo?: Record<string, CatalogoHit>;
}) {
  return {
    catalogo: crearCapaCatalogo({
      porBancardCodigo: async (b, c) => {
        if (!b || !c) return null;
        return opts.catalogo?.[`${b}|${c}`] ?? null;
      },
    }),
    regex: crearCapaRegex({ cargar: async () => opts.reglas ?? [] }),
    bancard: crearCapaBancard({ porNombreBancard: async (n) => opts.bancard?.[n] ?? null }),
    comercio: crearCapaComercio({ candidatosPorTexto: async () => opts.comercio ?? [] }),
    mcc: crearCapaMcc({ porCodigo: async (k) => opts.mcc?.[k] ?? null }),
  };
}

interface Row {
  id: string;
  categoriaPredichaId: string | null;
  fuenteCategoria: string | null;
  confianza: string | null;
  requiereRevision: boolean;
  evidencia: unknown;
}

function mkRepo() {
  const rows = new Map<string, Row>();
  let n = 0;
  return {
    rows,
    insertar: vi.fn(async (data: Omit<Row, 'id'>) => {
      const id = `m${++n}`;
      rows.set(id, { id, ...data });
      return { id };
    }),
    actualizarPrediccion: vi.fn(
      async (
        id: string,
        d: { categoriaId: string; fuente: 'ia'; confianza: number; evidencia: unknown },
      ) => {
        const cur = rows.get(id);
        if (!cur) return;
        rows.set(id, {
          ...cur,
          categoriaPredichaId: d.categoriaId,
          fuenteCategoria: d.fuente,
          confianza: d.confianza.toFixed(2),
          evidencia: d.evidencia,
        });
      },
    ),
  };
}

describe('pipeline e2e (in-memory)', () => {
  it('input matchea regex → guardado con fuente=regex', async () => {
    const capas = mkCapas({
      reglas: [{ id: 'r1', patron: 'BIGGIE', categoriaId: 'cat-super', prioridad: 1 }],
    });
    const repo = mkRepo();
    const input = { descripcion: 'COMPRA BIGGIE', monto: 50 };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);

    expect(out.fuente).toBe('regex');
    expect(out.categoriaId).toBe('cat-super');
    expect(out.requiereRevision).toBe(false);
    const row = repo.rows.get(out.movimientoId);
    expect(row?.fuenteCategoria).toBe('regex');
    expect(row?.confianza).toBe('0.95');
  });

  it('input solo MCC no ambiguo → fuente=mcc', async () => {
    const capas = mkCapas({
      mcc: { '5411': { codMcc: '5411', categoriaId: 'cat-super', ambiguo: false } },
    });
    const repo = mkRepo();
    const input = { mcc: '5411', monto: 10 };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);

    expect(out.fuente).toBe('mcc');
    expect(out.confianza).toBe(0.75);
    expect(out.requiereRevision).toBe(false);
  });

  it('catálogo hit por bancardId+codigo → propaga fuente sin más capas', async () => {
    const capas = mkCapas({
      catalogo: {
        'BRISTOL-YPANE|99': {
          id: 'c1',
          categoriaId: 'cat-ropa',
          fuente: 'mcc',
          confianza: 0.75,
          requiereRevision: false,
          evidencia: { mcc_match: '5399' },
        },
      },
    });
    const repo = mkRepo();
    const input = {
      bancardId: 'BRISTOL-YPANE',
      codigoComercio: '99',
      nombreBancard: 'BRISTOL-YPANE',
    };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);
    expect(out.fuente).toBe('mcc');
    expect(out.categoriaId).toBe('cat-ropa');
    expect(out.requiereRevision).toBe(false);
  });

  it('catálogo MISS + regex MANGO → transferencia', async () => {
    const capas = mkCapas({
      reglas: [{ id: 'mango', patron: '^MANGO\\b', categoriaId: 'cat-transfer', prioridad: 5 }],
    });
    const repo = mkRepo();
    const input = { nombreBancard: 'MANGO PEREZ JUAN' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);
    expect(out.fuente).toBe('regex');
    expect(out.categoriaId).toBe('cat-transfer');
  });

  it('catálogo MISS + regex AZAR → azar', async () => {
    const capas = mkCapas({
      reglas: [
        {
          id: 'azar',
          patron: '\\b(AZAR|SLOTS?)\\b',
          categoriaId: 'cat-azar',
          prioridad: 10,
        },
      ],
    });
    const repo = mkRepo();
    const input = { nombreBancard: 'AZAR LATINO' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);
    expect(out.fuente).toBe('regex');
    expect(out.categoriaId).toBe('cat-azar');
  });

  it('catálogo con requiereRevision=true → propaga hit (conservador), persiste con revision', async () => {
    const capas = mkCapas({
      catalogo: {
        'X|1': {
          id: 'c1',
          categoriaId: 'cat-otros',
          fuente: 'mcc',
          confianza: 0.3,
          requiereRevision: true,
          evidencia: null,
        },
      },
      mcc: { '5411': { codMcc: '5411', categoriaId: 'cat-super', ambiguo: false } },
    });
    const repo = mkRepo();
    const input = { bancardId: 'X', codigoComercio: '1', mcc: '5411' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);
    expect(out.fuente).toBe('mcc');
    expect(out.categoriaId).toBe('cat-otros');
    expect(out.confianza).toBe(0.3);
    expect(out.requiereRevision).toBe(true);
  });

  it('nada matchea → requiere_revision + IA fallback actualiza row async', async () => {
    const capas = mkCapas({});
    const repo = mkRepo();
    const input = { descripcion: 'movimiento desconocido' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);

    expect(out.requiereRevision).toBe(true);
    expect(out.categoriaId).toBeNull();

    const ollama: OllamaClient = {
      generate: vi.fn().mockResolvedValue('{"categoria_slug":"otros","confianza":0.6}'),
      ping: vi.fn(),
    };
    const capaIa = crearCapaIa(ollama, {
      activas: async () => [{ id: 'cat-otros', slug: 'otros', nombre: 'Otros' }],
    });
    const fb = crearIaFallback({ capa: capaIa, updater: repo, logger: noopLogger });

    fb.schedule(out.movimientoId, input);
    await flushImmediate();
    await flushImmediate();
    await flushImmediate();

    const row = repo.rows.get(out.movimientoId);
    expect(row?.fuenteCategoria).toBe('ia');
    expect(row?.categoriaPredichaId).toBe('cat-otros');
  });
});
