import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { PatronesUsuarioWriter } from '../../db/repos/patrones-usuario.js';

const tipoSchema = z.enum(['regex', 'literal', 'prefijo', 'contiene']);
const usuarioSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(120));

const crearSchema = z.object({
  usuario: usuarioSchema,
  tipo: tipoSchema,
  valor: z.string().min(2).max(500),
  categoria_slug: z.string().min(1).max(120),
  prioridad: z.number().int().min(1).max(10_000).optional(),
  descripcion: z.string().max(500).nullish(),
});

const actualizarSchema = z.object({
  activo: z.boolean().optional(),
  prioridad: z.number().int().min(1).max(10_000).optional(),
});

export const patronesUsuarioRoute =
  (writer: PatronesUsuarioWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { usuario: string } }>('/patrones-usuario/:usuario', async (req, reply) => {
      const u = usuarioSchema.safeParse(req.params.usuario);
      if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
      const items = await writer.listar(u.data);
      return reply.send({
        usuario: u.data,
        items: items.map((it) => ({
          id: it.id,
          tipo: it.tipo,
          valor: it.valor,
          categoria_slug: it.categoriaSlug,
          prioridad: it.prioridad,
          activo: it.activo,
          descripcion: it.descripcion,
          hits: it.hits,
          created_at: it.createdAt.toISOString(),
          updated_at: it.updatedAt.toISOString(),
        })),
      });
    });

    app.get<{ Params: { usuario: string }; Querystring: { umbral?: string } }>(
      '/patrones-usuario/:usuario/sugerencias',
      async (req, reply) => {
        const u = usuarioSchema.safeParse(req.params.usuario);
        if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
        const umbral = req.query.umbral ? Number(req.query.umbral) : 2;
        if (!Number.isFinite(umbral) || umbral < 1) {
          return reply.code(400).send({ error: 'umbral_invalido' });
        }
        const sug = await writer.sugerencias(u.data, umbral);
        return reply.send({ usuario: u.data, umbral, sugerencias: sug });
      },
    );

    app.post('/patrones-usuario', async (req, reply) => {
      const parsed = crearSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'payload_invalido', detalle: parsed.error.format() });
      }
      try {
        const r = await writer.crear({
          usuario: parsed.data.usuario,
          tipo: parsed.data.tipo,
          valor: parsed.data.valor,
          categoriaSlug: parsed.data.categoria_slug,
          prioridad: parsed.data.prioridad,
          descripcion: parsed.data.descripcion ?? null,
        });
        return reply.code(201).send({
          id: r.id,
          usuario: r.usuario,
          tipo: r.tipo,
          valor: r.valor,
          categoria_slug: r.categoriaSlug,
          prioridad: r.prioridad,
          activo: r.activo,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'patron_invalido') return reply.code(400).send({ error: 'patron_invalido' });
        if (msg === 'valor_muy_corto') return reply.code(400).send({ error: 'valor_muy_corto' });
        if (msg === 'categoria_inexistente')
          return reply.code(400).send({ error: 'categoria_inexistente' });
        if (msg.includes('duplicate key')) return reply.code(409).send({ error: 'patron_duplicado' });
        throw err;
      }
    });

    app.patch<{ Params: { id: string } }>('/patrones-usuario/:id', async (req, reply) => {
      const parsed = actualizarSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'payload_invalido' });
      const r = await writer.actualizar(req.params.id, parsed.data);
      if (!r) return reply.code(404).send({ error: 'no_existe' });
      return reply.send({
        id: r.id,
        activo: r.activo,
        prioridad: r.prioridad,
      });
    });

    app.delete<{ Params: { id: string } }>('/patrones-usuario/:id', async (req, reply) => {
      const ok = await writer.eliminar(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'no_existe' });
      return reply.code(204).send();
    });
  };
