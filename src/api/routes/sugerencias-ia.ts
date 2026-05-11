import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { OllamaClient } from '../../lib/ollama.js';
import {
  sugerirPatronesIa,
  type SugerenciaIa,
  type ProgresoIa,
} from '../../services/sugerir-patrones-ia.js';
import type { PatronWriter, PatronTipo } from '../../db/repos/patrones.js';

interface RunState {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  estado: 'running' | 'done' | 'error';
  error?: string;
  sugerencias: SugerenciaIa[];
  progreso: ProgresoIa | null;
}

let currentRun: RunState | null = null;

function nuevoRunId(): string {
  return `iarun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const aplicarSchema = z.object({
  items: z
    .array(
      z.object({
        tipo: z.enum(['regex', 'literal', 'prefijo', 'contiene']),
        valor: z.string().min(1).max(500),
        categoria_slug: z.string().min(1).max(50),
        prioridad: z.number().int().min(0).max(10000).default(35),
      }),
    )
    .min(1)
    .max(200),
});

export const sugerenciasIaRoute =
  (db: Db, ollama: OllamaClient, writer: PatronWriter): FastifyPluginAsync =>
  async (app) => {
    app.post<{
      Body: {
        lote_size?: number;
        confianza_min?: number;
        min_sugerencias?: number;
        max_iteraciones?: number;
      };
    }>(
      '/patrones/sugerencias-ia/run',
      async (req, reply) => {
        if (currentRun?.estado === 'running') {
          return reply.code(409).send({ error: 'run_en_progreso', run_id: currentRun.runId });
        }
        const runId = nuevoRunId();
        currentRun = {
          runId,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          estado: 'running',
          sugerencias: [],
          progreso: null,
        };
        const opts: Parameters<typeof sugerirPatronesIa>[1] = {};
        if (req.body?.lote_size) opts.loteSize = Number(req.body.lote_size);
        if (req.body?.confianza_min) opts.confianzaMin = Number(req.body.confianza_min);
        if (req.body?.min_sugerencias) opts.minSugerencias = Number(req.body.min_sugerencias);
        if (req.body?.max_iteraciones) opts.maxIteraciones = Number(req.body.max_iteraciones);
        opts.onProgreso = (p) => {
          if (currentRun) currentRun.progreso = p;
        };
        void sugerirPatronesIa({ db, ollama }, opts)
          .then((sugs) => {
            if (currentRun) {
              currentRun.sugerencias = sugs;
              currentRun.estado = 'done';
              currentRun.finishedAt = new Date().toISOString();
            }
          })
          .catch((err: unknown) => {
            if (currentRun) {
              currentRun.estado = 'error';
              currentRun.error = err instanceof Error ? err.message : String(err);
              currentRun.finishedAt = new Date().toISOString();
            }
          });
        return reply.code(202).send({ run_id: runId });
      },
    );

    app.get('/patrones/sugerencias-ia/status', async (_req, reply) => {
      if (!currentRun) return reply.send({ run: null });
      return reply.send({ run: currentRun });
    });

    app.post('/patrones/sugerencias-ia/aplicar', async (req, reply) => {
      const parsed = aplicarSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const creados: string[] = [];
      const errores: Array<{ valor: string; error: string }> = [];
      for (const it of parsed.data.items) {
        try {
          const p = await writer.crear({
            tipo: it.tipo as PatronTipo,
            valor: it.valor,
            categoriaSlug: it.categoria_slug,
            prioridad: it.prioridad,
            descripcion: 'auto-sugerido-ia',
          });
          creados.push(p.id);
        } catch (err) {
          errores.push({
            valor: it.valor,
            error: err instanceof Error ? err.message : 'error',
          });
        }
      }
      return reply.send({ creados: creados.length, errores });
    });
  };

export function _resetIaRunState(): void {
  currentRun = null;
}
