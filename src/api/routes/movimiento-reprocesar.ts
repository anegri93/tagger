import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ejecutarCascada, type CapasSincrono } from '../../pipeline/categorizar.js';
import type { MovimientoInput } from '../../domain/types.js';
import type { IaFallback } from '../../pipeline/ia-fallback.js';
import type { MovimientoInputReader, MovimientoReprocesador } from '../../db/repos/movimientos.js';
import type { CategoriaResolver } from '../../db/repos/categorias.js';
import type { Evidencia, FuenteCategoria } from '../../db/schema/movimientos.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paramsSchema = z.object({ id: z.string().regex(UUID_RE) });
const bodySchema = z.object({ bypass_catalogo: z.boolean().optional() }).optional();

export interface ReprocesarDeps {
  capas: CapasSincrono;
  reader: MovimientoInputReader;
  reprocesador: MovimientoReprocesador;
  iaFallback: IaFallback;
  categorias: CategoriaResolver;
}

export const movimientoReprocesarRoute =
  (deps: ReprocesarDeps): FastifyPluginAsync =>
  async (app) => {
    app.post<{ Params: { id: string } }>('/movimientos/:id/reprocesar', async (req, reply) => {
      const p = paramsSchema.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'invalid_id' });
      const b = bodySchema.safeParse(req.body ?? {});
      const bypassCatalogo = b.success ? b.data?.bypass_catalogo === true : false;

      const stored = await deps.reader.porIdInput(p.data.id);
      if (!stored) return reply.code(404).send({ error: 'no_existe' });

      const input: MovimientoInput = {
        descripcion: stored.descripcion ?? undefined,
        nombreComercio: stored.nombreComercio ?? undefined,
        nombreBancard: stored.nombreBancard ?? undefined,
        mcc: stored.mcc ?? undefined,
        bancardId: stored.bancardId ?? undefined,
        codigoComercio: stored.codigoComercio ?? undefined,
        monto: stored.monto ? Number(stored.monto) : undefined,
        rawInput: (stored.rawInput as Record<string, unknown> | null) ?? undefined,
      };

      const pipeline = await ejecutarCascada(input, deps.capas, { bypassCatalogo });

      const r = pipeline.resultado;
      await deps.reprocesador.reprocesar(p.data.id, {
        categoriaPredichaId: r?.categoriaId ?? null,
        fuenteCategoria: (r?.fuente ?? null) as FuenteCategoria | null,
        confianza: r?.confianza != null ? r.confianza.toFixed(2) : null,
        requiereRevision: pipeline.requiereRevision,
        evidencia: (r?.evidencia ?? null) as Evidencia | null,
      });

      if (pipeline.requiereIa) {
        deps.iaFallback.schedule(p.data.id, input);
      }

      const cat = r?.categoriaId ? await deps.categorias.porId(r.categoriaId) : null;

      return reply.send({
        movimiento_id: p.data.id,
        categoria_id: r?.categoriaId ?? null,
        categoria: cat,
        fuente: r?.fuente ?? null,
        confianza: r?.confianza ?? null,
        requiere_revision: pipeline.requiereRevision,
        ia_disparada: pipeline.requiereIa,
      });
    });
  };
