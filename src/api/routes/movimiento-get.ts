import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paramsSchema = z.object({ id: z.string().regex(UUID_RE) });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  origen: z.string().min(1).max(200).optional(),
  usuario: z.string().min(1).max(200).optional(),
});

export interface MovimientoListItem {
  id: string;
  descripcion: string | null;
  nombreComercio: string | null;
  monto: string | null;
  categoriaPredichaId: string | null;
  categoriaConfirmadaId: string | null;
  subcategoriaUsuarioId: string | null;
  fuenteCategoria: string | null;
  confianza: string | null;
  requiereRevision: boolean;
  origen: string | null;
  createdAt: Date | string;
}

export interface MovimientoLister {
  listar(opts: {
    limit: number;
    offset: number;
    origen?: string;
  }): Promise<{ items: MovimientoListItem[]; total: number }>;
}

export interface MovimientoGetData {
  id: string;
  descripcion: string | null;
  nombreComercio: string | null;
  nombreBancard: string | null;
  mcc: string | null;
  monto: string | null;
  categoriaPredichaId: string | null;
  categoriaConfirmadaId: string | null;
  subcategoriaUsuarioId: string | null;
  fuenteCategoria: string | null;
  confianza: string | null;
  requiereRevision: boolean;
  evidencia: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SubcategoriaPublica {
  id: string;
  nombre: string;
  slug: string;
  emoji: string | null;
  color: string | null;
  canonica_id: string;
}

export interface SubcategoriaResolverPort {
  porIds(ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, SubcategoriaPublica>>;
}

export interface MovimientoReader {
  porId(id: string): Promise<MovimientoGetData | null>;
}

export interface CategoriaResolverPort {
  porIds(
    ids: ReadonlyArray<string | null | undefined>,
  ): Promise<Map<string, { id: string; slug: string; nombre: string }>>;
}

export const movimientoListRoute =
  (
    lister: MovimientoLister,
    categorias: CategoriaResolverPort,
    subcats?: SubcategoriaResolverPort,
  ): FastifyPluginAsync =>
  async (app) => {
    app.get('/movimientos', async (req, reply) => {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const q = parsed.data;
      const filter: Parameters<MovimientoLister['listar']>[0] = {
        limit: q.limit,
        offset: q.offset,
      };
      if (q.origen !== undefined) filter.origen = q.origen;
      const { items, total } = await lister.listar(filter);
      const ids: Array<string | null> = [];
      const subIds: Array<string | null> = [];
      for (const m of items) {
        ids.push(m.categoriaPredichaId);
        ids.push(m.categoriaConfirmadaId);
        subIds.push(m.subcategoriaUsuarioId);
      }
      const map = await categorias.porIds(ids);
      const subMap = subcats ? await subcats.porIds(subIds) : new Map();
      const out = items.map((m) => {
        const predicha = m.categoriaPredichaId ? (map.get(m.categoriaPredichaId) ?? null) : null;
        const confirmada = m.categoriaConfirmadaId
          ? (map.get(m.categoriaConfirmadaId) ?? null)
          : null;
        const categoria = confirmada ?? predicha;
        const subcat = m.subcategoriaUsuarioId ? (subMap.get(m.subcategoriaUsuarioId) ?? null) : null;
        return {
          id: m.id,
          descripcion: m.descripcion,
          nombre_comercio: m.nombreComercio,
          monto: m.monto,
          categoria_predicha_id: m.categoriaPredichaId,
          categoria_confirmada_id: m.categoriaConfirmadaId,
          categoria,
          subcategoria_usuario_id: m.subcategoriaUsuarioId,
          subcategoria: subcat,
          fuente_categoria: m.fuenteCategoria,
          confianza: m.confianza,
          requiere_revision: m.requiereRevision,
          origen: m.origen,
          created_at: m.createdAt,
        };
      });
      return reply.send({ items: out, total, limit: q.limit, offset: q.offset });
    });
  };

export const movimientoGetRoute =
  (
    reader: MovimientoReader,
    categorias: CategoriaResolverPort,
    subcats?: SubcategoriaResolverPort,
  ): FastifyPluginAsync =>
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
      const subMap = subcats ? await subcats.porIds([m.subcategoriaUsuarioId]) : new Map();
      const subcat = m.subcategoriaUsuarioId ? (subMap.get(m.subcategoriaUsuarioId) ?? null) : null;
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
        subcategoria_usuario_id: m.subcategoriaUsuarioId,
        subcategoria: subcat,
        fuente_categoria: m.fuenteCategoria,
        confianza: m.confianza,
        requiere_revision: m.requiereRevision,
        evidencia: m.evidencia,
        created_at: m.createdAt,
        updated_at: m.updatedAt,
      });
    });
  };
