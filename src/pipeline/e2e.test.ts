// E2E pipeline con repos/capas in-memory. Verifica integración entre orquestador,
// cascada, persistencia y fallback IA sin requerir Postgres.
import { describe, it, expect, vi } from 'vitest';
import { ejecutarCascada } from './categorizar.js';
import { persistirMovimiento } from './persistir.js';
import { crearIaFallback } from './ia-fallback.js';
import { crearCapaReglas } from '../layers/reglas.js';
import type { ReglaCargada } from '../db/repos/reglas.js';
import { crearCapaMcc } from '../layers/mcc.js';
import { crearCapaIa } from '../layers/ia.js';
import type { LlmClient } from '../lib/llm.js';

const noopLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function flushImmediate() {
  return new Promise((r) => setImmediate(r));
}

function mkCapas(opts: {
  reglas?: Array<{ id: string; patron: string; categoriaId: string; prioridad: number }>;
  mcc?: Record<string, { codMcc: string; categoriaId: string | null; ambiguo: boolean }>;
  mccPorNombre?: Record<string, { mcc: string; categoriaId: string; requiereRevision: boolean }>;
}) {
  const reglasCargadas: ReglaCargada[] = (opts.reglas ?? []).map((r) => ({
    id: r.id,
    scope: 'global',
    tipo: 'regex',
    valor: r.patron,
    valorNormalizado: r.patron.toUpperCase(),
    categoriaId: r.categoriaId,
    prioridad: r.prioridad,
    origen: 'manual',
  }));
  return {
    reglas: crearCapaReglas({ porScope: async () => reglasCargadas }),
    mcc: crearCapaMcc(
      { porCodigo: async (k) => opts.mcc?.[k] ?? null },
      opts.mccPorNombre
        ? {
            porNombre: async (n) => opts.mccPorNombre?.[n.toUpperCase()] ?? null,
          }
        : undefined,
    ),
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

  it('MCC inferido por nombre (mcc_por_nombre) → fuente mcc + evidencia mcc_inferido_por_nombre', async () => {
    const capas = mkCapas({
      mccPorNombre: {
        'BRISTOL-YPANE': { mcc: '5399', categoriaId: 'cat-ropa', requiereRevision: false },
      },
      mcc: { '5399': { codMcc: '5399', categoriaId: 'cat-ropa', ambiguo: false } },
    });
    const repo = mkRepo();
    const input = { nombreBancard: 'BRISTOL-YPANE' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);
    expect(out.fuente).toBe('mcc');
    expect(out.categoriaId).toBe('cat-ropa');
    expect(out.requiereRevision).toBe(false);
  });

  it('reglas globales ganan sobre MCC por nombre', async () => {
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

  it('regex AZAR matchea sin MCC por nombre', async () => {
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

  it('input con MCC directo gana sobre fallback por nombre', async () => {
    const capas = mkCapas({
      mccPorNombre: {
        'X': { mcc: '5399', categoriaId: 'cat-ropa', requiereRevision: false },
      },
      mcc: { '5411': { codMcc: '5411', categoriaId: 'cat-super', ambiguo: false } },
    });
    const repo = mkRepo();
    const input = { nombreBancard: 'X', mcc: '5411' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);
    expect(out.fuente).toBe('mcc');
    expect(out.categoriaId).toBe('cat-super');
  });

  it('nada matchea → requiere_revision + IA fallback actualiza row async', async () => {
    const capas = mkCapas({});
    const repo = mkRepo();
    const input = { descripcion: 'movimiento desconocido' };
    const pipeline = await ejecutarCascada(input, capas);
    const out = await persistirMovimiento(input, pipeline, repo);

    expect(out.requiereRevision).toBe(true);
    expect(out.categoriaId).toBeNull();

    const llm: LlmClient = {
      generate: vi.fn().mockResolvedValue('{"categoria_slug":"otros","confianza":0.6}'),
      ping: vi.fn(),
    };
    const capaIa = crearCapaIa(llm, {
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
