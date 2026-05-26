import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CategoriaUsuarioError,
  type CategoriaUsuarioRepo,
} from '../../db/repos/categorias-usuario.js';

const usuarioParam = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(120));

const UUID = z.string().uuid();

const crearSchema = z.object({
  usuario: z.string().min(1).max(120),
  canonica_id: UUID,
  nombre: z.string().min(1).max(80).transform((v) => v.trim()),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug_invalido')
    .optional(),
  emoji: z.string().max(8).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

const actualizarSchema = z
  .object({
    nombre: z.string().min(1).max(80).optional(),
    emoji: z.string().max(8).nullable().optional(),
    color: z.string().max(20).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'sin_cambios' });

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface CategoriasUsuarioDeps {
  repo: CategoriaUsuarioRepo;
}

export const categoriasUsuarioRoute =
  (deps: CategoriasUsuarioDeps): FastifyPluginAsync =>
  async (app) => {
    // GET /categorias-usuario?usuario=X
    app.get<{ Querystring: { usuario?: string } }>('/categorias-usuario', async (req, reply) => {
      const u = usuarioParam.safeParse(req.query.usuario);
      if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
      const items = await deps.repo.listar(u.data);
      return reply.send({ items });
    });

    // POST /categorias-usuario
    app.post<{ Body: unknown }>('/categorias-usuario', async (req, reply) => {
      const p = crearSchema.safeParse(req.body);
      if (!p.success)
        return reply.code(400).send({ error: 'payload_invalido', issues: p.error.issues });
      const slug = p.data.slug ?? slugify(p.data.nombre);
      if (!slug) return reply.code(400).send({ error: 'slug_vacio' });
      try {
        const created = await deps.repo.crear({
          usuarioId: p.data.usuario,
          canonicaId: p.data.canonica_id,
          nombre: p.data.nombre,
          slug,
          emoji: p.data.emoji ?? null,
          color: p.data.color ?? null,
        });
        return reply.code(201).send(created);
      } catch (e) {
        if (e instanceof CategoriaUsuarioError) {
          const status =
            e.code === 'cap_alcanzado'
              ? 429
              : e.code === 'slug_duplicado'
                ? 409
                : 400;
          return reply.code(status).send({ error: e.code, message: e.message });
        }
        throw e;
      }
    });

    // PATCH /categorias-usuario/:id
    app.patch<{ Params: { id: string }; Body: unknown }>(
      '/categorias-usuario/:id',
      async (req, reply) => {
        const idCheck = UUID.safeParse(req.params.id);
        if (!idCheck.success) return reply.code(400).send({ error: 'id_invalido' });
        const p = actualizarSchema.safeParse(req.body);
        if (!p.success)
          return reply.code(400).send({ error: 'payload_invalido', issues: p.error.issues });
        const updated = await deps.repo.actualizar(idCheck.data, p.data);
        if (!updated) return reply.code(404).send({ error: 'no_encontrado' });
        return reply.send(updated);
      },
    );

    // DELETE /categorias-usuario/:id (hard delete; FK SET NULL en movs)
    app.delete<{ Params: { id: string } }>(
      '/categorias-usuario/:id',
      async (req, reply) => {
        const idCheck = UUID.safeParse(req.params.id);
        if (!idCheck.success) return reply.code(400).send({ error: 'id_invalido' });
        const ok = await deps.repo.eliminar(idCheck.data);
        if (!ok) return reply.code(404).send({ error: 'no_encontrado' });
        return reply.send({ ok: true });
      },
    );
  };
