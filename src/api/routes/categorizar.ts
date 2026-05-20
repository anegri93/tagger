import type { FastifyPluginAsync } from 'fastify';
import { categorizarRequestSchema } from '../schemas/categorizar.js';
import type { CapasSincrono, ResultadoPipeline } from '../../pipeline/categorizar.js';
import { ejecutarCascada } from '../../pipeline/categorizar.js';
import { persistirMovimiento, type MovimientoRepository } from '../../pipeline/persistir.js';
import type { IaFallback } from '../../pipeline/ia-fallback.js';
import type { MovimientoInput } from '../../domain/types.js';
import { normalize } from '../../domain/normalize.js';
import type { CorreccionMemoriaWriter } from '../../db/repos/correccion.js';
import { CONFIANZA } from '../../domain/confianza.js';

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
  /** Opcional. Si se provee + body.aprender=true + origen, upsert regla user-scope. */
  memoria?: CorreccionMemoriaWriter;
  /** Para invalidar cache de reglas tras upsert. */
  invalidarReglas?: (scope: string) => void;
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

        let pipeline: ResultadoPipeline;
        let saltearCascada = false;

        // Modo manual: el caller mandó una categoría predefinida. Skip cascada.
        if (body.categoria_id) {
          const catManual = await deps.categorias.porId(body.categoria_id);
          if (!catManual) {
            return reply.code(400).send({ error: 'categoria_id_invalida' });
          }
          saltearCascada = true;
          pipeline = {
            resultado: {
              categoriaId: catManual.id,
              fuente: 'manual',
              confianza: CONFIANZA.manual,
              evidencia: { origen: 'usuario_manual' },
            },
            requiereRevision: false,
            requiereIa: false,
          };
        } else {
          pipeline = await ejecutarCascada(input, deps.capas, {
            bypassCatalogo: body.bypass_catalogo === true,
            usuario: body.origen ?? null,
          });
        }

        const latencyMs = Date.now() - t0;
        if (pipeline.resultado && body.bypass_catalogo === true && !saltearCascada) {
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

        // Modo manual + aprender=true + origen: guardar regla user-scope
        // para que próximos movs con el mismo nombre caigan acá automático.
        if (saltearCascada && body.aprender === true && body.origen && deps.memoria) {
          const textoCompleto = [body.nombre_bancard, body.nombre_comercio, body.descripcion]
            .filter((v): v is string => Boolean(v))
            .join(' ')
            .trim();
          const normalizado = normalize(textoCompleto);
          if (textoCompleto && normalizado) {
            const scope = `usuario:${body.origen}`;
            try {
              await deps.memoria.upsert({
                scope,
                valor: textoCompleto,
                valorNormalizado: normalizado,
                categoriaId: body.categoria_id as string,
              });
              deps.invalidarReglas?.(scope);
            } catch {
              // No bloquear si falla guardado de memoria.
            }
          }
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
