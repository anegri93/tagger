import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type {
  CategoriasSimilaresReader,
  CategoriaSimilar,
} from '../../db/repos/categorias.js';
import { resolverIdentificador } from '../../db/repos/categorias.js';
import type { Db } from '../../db/client.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(200).optional(),
  umbral: z.coerce.number().min(0).max(1).optional(),
});

export interface MovimientoCategoriaReader {
  porId(id: string): Promise<{
    categoriaPredichaId: string | null;
    categoriaConfirmadaId: string | null;
  } | null>;
}

function format(items: CategoriaSimilar[]) {
  return items.map((c) => ({
    id: c.id,
    slug: c.slug,
    nombre: c.nombre,
    descripcion: c.descripcion,
    similitud: Number(c.similitud.toFixed(4)),
  }));
}

export const categoriasSimilaresRoute =
  (db: Db, reader: CategoriasSimilaresReader): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { identificador: string } }>(
      '/categorias/:identificador/similares',
      async (req, reply) => {
        const target = await resolverIdentificador(db, req.params.identificador);
        if (!target) return reply.code(404).send({ error: 'no_existe' });
        const q = querySchema.safeParse(req.query);
        if (!q.success) {
          return reply.code(400).send({ error: 'invalid_query', issues: q.error.flatten() });
        }
        const items = await reader.buscar({
          excluirId: target.id,
          q: q.data.q,
          limit: q.data.limit,
          offset: q.data.offset,
          umbral: q.data.umbral,
        });
        return reply.send({
          categoria_origen: { id: target.id, slug: target.slug, nombre: target.nombre },
          limit: q.data.limit,
          offset: q.data.offset,
          items: format(items),
        });
      },
    );
  };

export const movimientoCategoriasSugeridasRoute =
  (
    movReader: MovimientoCategoriaReader,
    reader: CategoriasSimilaresReader,
  ): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { id: string } }>(
      '/movimientos/:id/categorias-sugeridas',
      async (req, reply) => {
        if (!UUID_RE.test(req.params.id)) {
          return reply.code(400).send({ error: 'invalid_id' });
        }
        const m = await movReader.porId(req.params.id);
        if (!m) return reply.code(404).send({ error: 'not_found' });
        const origenId = m.categoriaConfirmadaId ?? m.categoriaPredichaId;
        const q = querySchema.safeParse(req.query);
        if (!q.success) {
          return reply.code(400).send({ error: 'invalid_query', issues: q.error.flatten() });
        }
        if (!origenId && !q.data.q) {
          // sin categoría origen ni q: no podemos sugerir nada útil
          return reply.send({
            categoria_origen_id: null,
            limit: q.data.limit,
            offset: q.data.offset,
            items: [],
          });
        }
        const items = await reader.buscar({
          excluirId: origenId ?? '00000000-0000-0000-0000-000000000000',
          q: q.data.q,
          limit: q.data.limit,
          offset: q.data.offset,
          umbral: q.data.umbral,
        });
        return reply.send({
          categoria_origen_id: origenId,
          limit: q.data.limit,
          offset: q.data.offset,
          items: format(items),
        });
      },
    );
  };
