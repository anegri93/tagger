import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ReglasWriter } from '../../db/repos/reglas.js';
import { normalize } from '../../domain/normalize.js';

const tipoSchema = z.enum(['literal', 'contiene', 'regex']);

const usuarioParam = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(120));

const crearSchema = z.object({
  scope: z
    .string()
    .min(1)
    .max(150)
    .refine((v) => v === 'global' || v.startsWith('usuario:'), {
      message: 'scope debe ser "global" o "usuario:<nombre>"',
    }),
  tipo: tipoSchema,
  valor: z.string().min(2).max(500),
  categoria_slug: z.string().min(1).max(120),
  prioridad: z.number().int().min(1).max(10_000).optional(),
  descripcion: z.string().max(500).nullish(),
  origen: z.string().max(40).optional(),
});

const actualizarSchema = z.object({
  activo: z.boolean().optional(),
  prioridad: z.number().int().min(1).max(10_000).optional(),
});

export const reglasRoute =
  (writer: ReglasWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { scope?: string } }>('/reglas', async (req, reply) => {
      const scope = (req.query.scope ?? '').trim();
      if (!scope) return reply.code(400).send({ error: 'scope_requerido' });
      const items = await writer.listar(scope);
      return reply.send({
        scope,
        items: items.map((it) => ({
          id: it.id,
          scope: it.scope,
          tipo: it.tipo,
          valor: it.valor,
          valor_normalizado: it.valorNormalizado,
          categoria_slug: it.categoriaSlug,
          prioridad: it.prioridad,
          activo: it.activo,
          hits: it.hits,
          origen: it.origen,
          descripcion: it.descripcion,
          created_at: it.createdAt.toISOString(),
          updated_at: it.updatedAt.toISOString(),
        })),
      });
    });

    app.get<{ Querystring: { usuario: string; umbral?: string } }>(
      '/reglas/sugerencias',
      async (req, reply) => {
        const u = usuarioParam.safeParse(req.query.usuario);
        if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
        const umbral = req.query.umbral ? Number(req.query.umbral) : 2;
        if (!Number.isFinite(umbral) || umbral < 1) {
          return reply.code(400).send({ error: 'umbral_invalido' });
        }
        const sug = await writer.sugerencias(`usuario:${u.data}`, umbral);
        return reply.send({ usuario: u.data, umbral, sugerencias: sug });
      },
    );

    app.get<{ Querystring: { min_usuarios?: string; min_total?: string } }>(
      '/reglas/sugerencias-globales',
      async (req, reply) => {
        const minUsuarios = req.query.min_usuarios ? Number(req.query.min_usuarios) : 3;
        const minTotal = req.query.min_total ? Number(req.query.min_total) : 5;
        if (!Number.isFinite(minUsuarios) || minUsuarios < 2)
          return reply.code(400).send({ error: 'min_usuarios_invalido' });
        if (!Number.isFinite(minTotal) || minTotal < 1)
          return reply.code(400).send({ error: 'min_total_invalido' });
        const sug = await writer.sugerenciasGlobales({
          minUsuariosDistintos: minUsuarios,
          minTotalCorrecciones: minTotal,
        });
        return reply.send({
          min_usuarios: minUsuarios,
          min_total: minTotal,
          sugerencias: sug,
        });
      },
    );

    app.post('/reglas', async (req, reply) => {
      const parsed = crearSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'payload_invalido', detalle: parsed.error.format() });
      }
      try {
        const r = await writer.crear({
          scope: parsed.data.scope,
          tipo: parsed.data.tipo,
          valor: parsed.data.valor,
          categoriaSlug: parsed.data.categoria_slug,
          prioridad: parsed.data.prioridad,
          descripcion: parsed.data.descripcion ?? null,
          origen: parsed.data.origen,
        });
        return reply.code(201).send({
          id: r.id,
          scope: r.scope,
          tipo: r.tipo,
          valor: r.valor,
          categoria_slug: r.categoriaSlug,
          prioridad: r.prioridad,
          activo: r.activo,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        if (msg === 'regex_invalido') return reply.code(400).send({ error: 'regex_invalido' });
        if (msg === 'valor_muy_corto') return reply.code(400).send({ error: 'valor_muy_corto' });
        if (msg === 'categoria_inexistente')
          return reply.code(400).send({ error: 'categoria_inexistente' });
        if (msg.includes('duplicate key'))
          return reply.code(409).send({ error: 'regla_duplicada' });
        throw err;
      }
    });

    app.patch<{ Params: { id: string } }>('/reglas/:id', async (req, reply) => {
      const parsed = actualizarSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'payload_invalido' });
      const r = await writer.actualizar(req.params.id, parsed.data);
      if (!r) return reply.code(404).send({ error: 'no_existe' });
      return reply.send({ id: r.id, activo: r.activo, prioridad: r.prioridad });
    });

    app.delete<{ Params: { id: string } }>('/reglas/:id', async (req, reply) => {
      const ok = await writer.eliminar(req.params.id);
      if (!ok) return reply.code(404).send({ error: 'no_existe' });
      return reply.code(204).send();
    });

    app.delete<{ Querystring: { scope: string; valor: string } }>(
      '/reglas',
      async (req, reply) => {
        const scope = (req.query.scope ?? '').trim();
        const valor = (req.query.valor ?? '').trim();
        if (!scope || !valor) {
          return reply.code(400).send({ error: 'scope_y_valor_requeridos' });
        }
        const norm = normalize(valor);
        if (!norm) return reply.code(400).send({ error: 'valor_invalido' });
        const ok = await writer.eliminarPorScopeYValorNormalizado(scope, norm);
        if (!ok) return reply.code(404).send({ error: 'no_existe' });
        return reply.code(204).send();
      },
    );
  };
