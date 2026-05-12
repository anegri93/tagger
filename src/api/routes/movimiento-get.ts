import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paramsSchema = z.object({ id: z.string().regex(UUID_RE) });

export interface MovimientoGetData {
  id: string;
  descripcion: string | null;
  nombreComercio: string | null;
  nombreBancard: string | null;
  mcc: string | null;
  monto: string | null;
  categoriaPredichaId: string | null;
  categoriaConfirmadaId: string | null;
  fuenteCategoria: string | null;
  confianza: string | null;
  requiereRevision: boolean;
  evidencia: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MovimientoReader {
  porId(id: string): Promise<MovimientoGetData | null>;
}

export interface CategoriaResolverPort {
  porIds(
    ids: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, { id: string; slug: string; nombre: string }>>;
}

export const movimientoGetRoute =
  (reader: MovimientoReader, categorias: CategoriaResolverPort): FastifyPluginAsync =>
  async (app) => {
    app.get('/movimientos/:id', async (req, reply) => {
      const parsed = paramsSchema.safeParse(req.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_id' });
      }
      const m = await reader.porId(parsed.data.id);
      if (!m) return reply.code(404).send({ error: 'not_found' });
      const map = await categorias.porIds([m.categoriaPredichaId, m.categoriaConfirmadaId]);
      const predicha = m.categoriaPredichaId ? (map.get(m.categoriaPredichaId) ?? null) : null;
      const confirmada = m.categoriaConfirmadaId
        ? (map.get(m.categoriaConfirmadaId) ?? null)
        : null;
      return reply.send({
        id: m.id,
        descripcion: m.descripcion,
        nombre_comercio: m.nombreComercio,
        nombre_bancard: m.nombreBancard,
        mcc: m.mcc,
        monto: m.monto,
        categoria_predicha_id: m.categoriaPredichaId,
        categoria_predicha: predicha,
        categoria_confirmada_id: m.categoriaConfirmadaId,
        categoria_confirmada: confirmada,
        fuente_categoria: m.fuenteCategoria,
        confianza: m.confianza,
        requiere_revision: m.requiereRevision,
        evidencia: m.evidencia,
        created_at: m.createdAt,
        updated_at: m.updatedAt,
      });
    });
  };
