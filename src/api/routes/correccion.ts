import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paramsSchema = z.object({ id: z.string().regex(UUID_RE) });
const bodySchema = z.object({
  categoria_id_nueva: z.string().regex(UUID_RE),
  motivo: z.string().max(500).optional(),
  usuario: z.string().max(120).optional(),
});

export interface CorreccionService {
  aplicar(input: {
    movimientoId: string;
    categoriaIdNueva: string;
    motivo?: string | undefined;
    usuario?: string | undefined;
  }): Promise<
    | { ok: true; correccionId: string; categoriaAnteriorId: string | null }
    | { ok: false; error: 'movimiento_no_encontrado' | 'categoria_invalida' }
  >;
}

export interface CategoriaResolverPort {
  porIds(
    ids: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, { id: string; slug: string; nombre: string }>>;
}

export const correccionRoute =
  (svc: CorreccionService, categorias: CategoriaResolverPort): FastifyPluginAsync =>
  async (app) => {
    app.post('/movimientos/:id/correccion', async (req, reply) => {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'invalid_id' });
      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: body.error.flatten() });
      }
      const r = await svc.aplicar({
        movimientoId: params.data.id,
        categoriaIdNueva: body.data.categoria_id_nueva,
        motivo: body.data.motivo,
        usuario: body.data.usuario,
      });
      if (!r.ok) {
        const code = r.error === 'movimiento_no_encontrado' ? 404 : 400;
        return reply.code(code).send({ error: r.error });
      }
      const map = await categorias.porIds([r.categoriaAnteriorId, body.data.categoria_id_nueva]);
      return reply.send({
        correccion_id: r.correccionId,
        categoria_anterior_id: r.categoriaAnteriorId,
        categoria_anterior: r.categoriaAnteriorId ? map.get(r.categoriaAnteriorId) ?? null : null,
        categoria_nueva_id: body.data.categoria_id_nueva,
        categoria_nueva: map.get(body.data.categoria_id_nueva) ?? null,
      });
    });
  };
