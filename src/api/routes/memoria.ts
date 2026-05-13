import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { MemoriaUsuarioWriter } from '../../db/repos/memoria-usuario.js';
import { normalize } from '../../domain/normalize.js';

const usuarioSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(120));
const destSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(200));

export const memoriaRoute =
  (writer: MemoriaUsuarioWriter): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { usuario: string } }>('/memoria/:usuario', async (req, reply) => {
      const u = usuarioSchema.safeParse(req.params.usuario);
      if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
      const items = await writer.listar(u.data);
      return reply.send({
        usuario: u.data,
        items: items.map((it) => ({
          destinatario: it.destinatario,
          destinatario_normalizado: it.destinatarioNormalizado,
          categoria_slug: it.categoriaSlug,
          categoria_nombre: it.categoriaNombre,
          hits: it.hits,
          updated_at: it.updatedAt.toISOString(),
        })),
      });
    });

    app.delete<{ Params: { usuario: string; destinatario: string } }>(
      '/memoria/:usuario/:destinatario',
      async (req, reply) => {
        const u = usuarioSchema.safeParse(req.params.usuario);
        if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
        const d = destSchema.safeParse(req.params.destinatario);
        if (!d.success) return reply.code(400).send({ error: 'destinatario_invalido' });
        const destNorm = normalize(d.data);
        if (!destNorm) return reply.code(400).send({ error: 'destinatario_invalido' });
        const ok = await writer.eliminar(u.data, destNorm);
        if (!ok) return reply.code(404).send({ error: 'no_existe' });
        return reply.code(204).send();
      },
    );
  };
