import type { FastifyPluginAsync } from 'fastify';
import { categorizarRequestSchema } from '../schemas/categorizar.js';
import type { CapasSincrono } from '../../pipeline/categorizar.js';
import { ejecutarCascada } from '../../pipeline/categorizar.js';
import { persistirMovimiento, type MovimientoRepository } from '../../pipeline/persistir.js';
import type { IaFallback } from '../../pipeline/ia-fallback.js';
import type { MovimientoInput } from '../../domain/types.js';

export interface CategoriaResolverPort {
  porId(
    id: string | null | undefined,
  ): Promise<{ id: string; slug: string; nombre: string } | null>;
}

export interface CategorizarDeps {
  capas: CapasSincrono;
  repo: MovimientoRepository;
  iaFallback: IaFallback;
  categorias: CategoriaResolverPort;
}

export const categorizarRoute =
  (deps: CategorizarDeps): FastifyPluginAsync =>
  async (app) => {
    app.post('/categorizar-movimiento', async (req, reply) => {
      const parsed = categorizarRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const body = parsed.data;
      const input: MovimientoInput = {
        descripcion: body.descripcion,
        nombreComercio: body.nombre_comercio,
        nombreBancard: body.nombre_bancard,
        mcc: body.mcc,
        bancardId: body.bancard_id,
        codigoComercio: body.codigo_comercio,
        monto: body.monto,
        rawInput: body as Record<string, unknown>,
      };

      try {
        const t0 = Date.now();
        const pipeline = await ejecutarCascada(input, deps.capas, {
          bypassCatalogo: body.bypass_catalogo === true,
          usuario: body.origen ?? null,
        });
        const latencyMs = Date.now() - t0;
        if (pipeline.resultado && body.bypass_catalogo === true) {
          pipeline.resultado.evidencia = {
            ...(pipeline.resultado.evidencia ?? {}),
            bypass_catalogo: true,
          };
        }
        const out = await persistirMovimiento(input, pipeline, deps.repo, {
          origen: body.origen ?? 'api',
          batchId: body.batch_id ?? null,
          latencyMs,
        });
        if (pipeline.requiereIa) {
          deps.iaFallback.schedule(out.movimientoId, input);
        }
        const cat = await deps.categorias.porId(out.categoriaId);
        return reply.send({
          movimiento_id: out.movimientoId,
          categoria_id: out.categoriaId,
          categoria: cat,
          fuente: out.fuente,
          confianza: out.confianza,
          requiere_revision: out.requiereRevision,
        });
      } catch (err) {
        req.log.error({ err }, 'categorizar failed');
        return reply.code(500).send({ error: 'internal' });
      }
    });
  };
