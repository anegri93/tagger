import type { FastifyPluginAsync } from 'fastify';
import { createCategoriaSchema, updateCategoriaSchema } from '../schemas/categorias.js';
import type { CategoriaWriter } from '../../db/repos/categorias.js';

export interface CategoriaPublica {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
}

export interface CategoriasReader {
  activas(): Promise<CategoriaPublica[]>;
}

export const categoriasRoute =
  (reader: CategoriasReader, writer?: CategoriaWriter): FastifyPluginAsync =>
  async (app) => {
    app.get('/categorias', async () => {
      const items = await reader.activas();
      return { items };
    });

    if (!writer) return;

    app.post('/categorias', async (req, reply) => {
      const parsed = createCategoriaSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      try {
        const cat = await writer.crear(parsed.data);
        return reply.code(201).send(cat);
      } catch (err) {
        // Detectar violación de unique constraint (slug duplicado).
        // Drizzle envuelve el pg error en DrizzleQueryError; el código está en .cause.
        const e = err as { code?: string; cause?: { code?: string } } | null;
        const pgCode = e?.code ?? e?.cause?.code;
        const msg = err instanceof Error ? err.message : 'error';
        if (pgCode === '23505' || /duplicate|unique/i.test(msg)) {
          return reply.code(409).send({ error: 'slug_existe' });
        }
        return reply.code(500).send({ error: msg });
      }
    });

    // :identificador acepta slug actual, alias antiguo o UUID.
    app.patch<{ Params: { identificador: string } }>(
      '/categorias/:identificador',
      async (req, reply) => {
        const parsed = updateCategoriaSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
        }
        const upd = await writer.actualizar(req.params.identificador, parsed.data);
        if (!upd) return reply.code(404).send({ error: 'no_existe' });
        return reply.send(upd);
      },
    );

    app.get<{ Params: { identificador: string } }>(
      '/categorias/:identificador/usage',
      async (req, reply) => {
        const u = await writer.usage(req.params.identificador);
        if (!u) return reply.code(404).send({ error: 'no_existe' });
        return reply.send(u);
      },
    );

    app.delete<{ Params: { identificador: string } }>(
      '/categorias/:identificador',
      async (req, reply) => {
        const usage = await writer.usage(req.params.identificador);
        if (!usage) return reply.code(404).send({ error: 'no_existe' });
        if (usage.movimientos > 0 || usage.mcc > 0 || usage.comercios > 0) {
          return reply.code(409).send({ error: 'tiene_referencias', usage });
        }
        const ok = await writer.eliminar(req.params.identificador);
        if (!ok) return reply.code(404).send({ error: 'no_existe' });
        return reply.send({ ok: true });
      },
    );
  };
