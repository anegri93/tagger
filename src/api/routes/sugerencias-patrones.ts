import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { sugerirPatrones } from '../../services/sugerir-patrones.js';
import type { PatronWriter, PatronTipo } from '../../db/repos/patrones.js';

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

export const sugerenciasPatronesRoute =
  (db: Db, writer: PatronWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{
      Querystring: {
        freq_min?: string;
        pureza_min?: string;
        longitud_min?: string;
        impacto_min?: string;
      };
    }>('/patrones/sugerencias', async (req, reply) => {
      const opts: Parameters<typeof sugerirPatrones>[1] = {};
      if (req.query.freq_min) opts.freqMin = Number(req.query.freq_min);
      if (req.query.pureza_min) opts.purezaMin = Number(req.query.pureza_min);
      if (req.query.longitud_min) opts.longitudMin = Number(req.query.longitud_min);
      if (req.query.impacto_min) opts.impactoMin = Number(req.query.impacto_min);
      const sugs = await sugerirPatrones(db, opts);
      return reply.send({ items: sugs });
    });

    app.post('/patrones/sugerencias/aplicar', async (req, reply) => {
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
            descripcion: 'auto-sugerido',
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
