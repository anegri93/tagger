import type { FastifyPluginAsync } from 'fastify';
import { categorizarRequestSchema } from '../schemas/categorizar.js';
import type { CapasSincrono, ResultadoPipeline } from '../../pipeline/categorizar.js';
import { ejecutarCascada } from '../../pipeline/categorizar.js';
import { persistirMovimiento, type MovimientoRepository } from '../../pipeline/persistir.js';
import type { IaFallback } from '../../pipeline/ia-fallback.js';
import type { MovimientoInput } from '../../domain/types.js';
import { normalize } from '../../domain/normalize.js';
import type { CorreccionMemoriaWriter } from '../../db/repos/correccion.js';
import type { DescripcionUsoRepo } from '../../db/repos/descripcion-uso.js';
import type { CategoriaUsuarioRepo } from '../../db/repos/categorias-usuario.js';
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
  /** Opcional. Si se provee + body.descripcion + body.origen, registra uso para autocomplete. */
  descripcionUso?: DescripcionUsoRepo;
  /** Opcional. Si se provee + body.subcategoria_usuario_id, resuelve canónica padre + valida pertenencia al usuario. */
  categoriasUsuario?: CategoriaUsuarioRepo;
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

        // Si vino subcategoria_usuario_id, resolvemos canon padre y la usamos como
        // categoria efectiva. Si vino ADEMÁS categoria_id, debe coincidir con la canon padre.
        let subcategoriaUsuarioId: string | null = null;
        if (body.subcategoria_usuario_id) {
          if (!deps.categoriasUsuario) {
            return reply.code(400).send({ error: 'subcategoria_no_soportada' });
          }
          const sub = await deps.categoriasUsuario.porId(body.subcategoria_usuario_id);
          if (!sub || !sub.activo) {
            return reply.code(400).send({ error: 'subcategoria_invalida' });
          }
          if (body.origen && sub.usuario_id !== body.origen) {
            return reply.code(403).send({ error: 'subcategoria_no_pertenece_al_usuario' });
          }
          subcategoriaUsuarioId = sub.id;
          // Forzar categoria_id = canon padre (override silencioso si caller mandó otra).
          body.categoria_id = sub.canonica_id;
        }

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
          subcategoriaUsuarioId,
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

        // Fire-and-forget: registrar descripción para autocomplete per-user.
        // Falla silenciosa, no bloquea response.
        if (deps.descripcionUso && body.descripcion && body.origen) {
          void deps.descripcionUso
            .upsert({
              usuarioId: body.origen,
              descripcion: body.descripcion,
              categoriaId: out.categoriaId ?? null,
            })
            .catch((err: unknown) => req.log.warn({ err }, 'descripcion_uso upsert failed'));
        }

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
