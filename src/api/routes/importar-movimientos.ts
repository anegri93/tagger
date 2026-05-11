import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { CapasSincrono } from '../../pipeline/categorizar.js';
import { ejecutarCascada } from '../../pipeline/categorizar.js';
import { persistirMovimiento, type MovimientoRepository } from '../../pipeline/persistir.js';
import type { MovimientoInput } from '../../domain/types.js';

interface ImportStats {
  total: number;
  procesados: number;
  ok: number;
  con_categoria: number;
  sin_categoria: number;
  errores: number;
  ultimo_error?: string;
  por_fuente: Record<string, number>;
}

interface ImportState {
  importId: string;
  startedAt: string;
  finishedAt: string | null;
  stats: ImportStats;
  estado: 'running' | 'done' | 'error';
  batchId: string;
  error?: string;
}

let current: ImportState | null = null;

function nuevoId(): string {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const rowSchema = z.object({
  nombre: z.string().min(1).max(500),
  mcc: z.string().max(10).optional().nullable(),
  monto: z.number().finite().optional().nullable(),
  bancard_id: z.string().max(100).optional().nullable(),
  codigo_comercio: z.string().max(50).optional().nullable(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(200000),
  batch_id: z.string().min(1).max(100).optional(),
});

function cleanMcc(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (!t || /^(sin\s*rubro|null|na|n\/a)$/i.test(t)) return undefined;
  if (!/^\d{2,4}$/.test(t)) return undefined;
  return t;
}

async function ejecutarImport(
  capas: CapasSincrono,
  repo: MovimientoRepository,
  rows: z.infer<typeof rowSchema>[],
  batchId: string,
): Promise<void> {
  if (!current) return;
  current.stats.total = rows.length;
  for (const r of rows) {
    const t0 = Date.now();
    try {
      const input: MovimientoInput = {
        nombreBancard: r.nombre.trim(),
        mcc: cleanMcc(r.mcc),
        bancardId: r.bancard_id ?? undefined,
        codigoComercio: r.codigo_comercio ?? undefined,
        monto: r.monto ?? undefined,
        rawInput: r as Record<string, unknown>,
      };
      const pipeline = await ejecutarCascada(input, capas);
      const latency = Date.now() - t0;
      const out = await persistirMovimiento(input, pipeline, repo, {
        origen: 'import',
        batchId,
        latencyMs: latency,
      });
      current.stats.ok++;
      if (out.categoriaId) current.stats.con_categoria++;
      else current.stats.sin_categoria++;
      const f = out.fuente ?? 'sin_cat';
      current.stats.por_fuente[f] = (current.stats.por_fuente[f] ?? 0) + 1;
    } catch (err) {
      current.stats.errores++;
      current.stats.ultimo_error = err instanceof Error ? err.message : String(err);
    }
    current.stats.procesados++;
  }
}

export const importarMovimientosRoute =
  (capas: CapasSincrono, repo: MovimientoRepository): FastifyPluginAsync =>
  async (app) => {
    app.post('/movimientos/importar', async (req, reply) => {
      if (current?.estado === 'running') {
        return reply.code(409).send({ error: 'import_en_progreso', import_id: current.importId });
      }
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const importId = nuevoId();
      const batchId = parsed.data.batch_id ?? `import_${Date.now()}`;
      current = {
        importId,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stats: {
          total: parsed.data.rows.length,
          procesados: 0,
          ok: 0,
          con_categoria: 0,
          sin_categoria: 0,
          errores: 0,
          por_fuente: {},
        },
        estado: 'running',
        batchId,
      };
      void ejecutarImport(capas, repo, parsed.data.rows, batchId)
        .then(() => {
          if (current) {
            current.estado = 'done';
            current.finishedAt = new Date().toISOString();
          }
        })
        .catch((err: unknown) => {
          if (current) {
            current.estado = 'error';
            current.error = err instanceof Error ? err.message : String(err);
            current.finishedAt = new Date().toISOString();
          }
        });
      return reply.code(202).send({ import_id: importId, batch_id: batchId });
    });

    app.get('/movimientos/importar/status', async (_req, reply) => {
      return reply.send({ run: current });
    });
  };
