import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { comerciosCatalogo, categorias } from '../../db/schema/index.js';

const aplicarDiffSchema = z.object({
  categoria_actual_slug: z.string().min(1).max(50),
  categoria_nueva_slug: z.string().min(1).max(50),
});

async function resolverSlug(db: Db, slug: string): Promise<string | null> {
  const r = await db
    .select({ id: categorias.id })
    .from(categorias)
    .where(eq(categorias.slug, slug))
    .limit(1);
  return r[0]?.id ?? null;
}

export const aplicarDiffRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.post('/catalogo/aplicar-diff', async (req, reply) => {
      const parsed = aplicarDiffSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const { categoria_actual_slug, categoria_nueva_slug } = parsed.data;

      if (categoria_actual_slug === categoria_nueva_slug) {
        return reply.code(422).send({ error: 'slugs_iguales' });
      }

      const [actualId, nuevaId] = await Promise.all([
        resolverSlug(db, categoria_actual_slug),
        resolverSlug(db, categoria_nueva_slug),
      ]);
      if (!actualId) return reply.code(400).send({ error: 'categoria_actual_inexistente' });
      if (!nuevaId) return reply.code(400).send({ error: 'categoria_nueva_inexistente' });

      const updated = await db
        .update(comerciosCatalogo)
        .set({
          categoriaId: nuevaId,
          fuenteCategoria: 'manual',
          confianza: '1.00',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(comerciosCatalogo.categoriaId, actualId),
            eq(comerciosCatalogo.categoriaNuevaId, nuevaId),
            isNotNull(comerciosCatalogo.recategorizadoAt),
          ),
        )
        .returning({ id: comerciosCatalogo.id });

      return reply.send({ actualizadas: updated.length });
    });

    const aplicarPatronSchema = z.object({
      categoria_actual_slug: z.string().min(1).max(50),
      categoria_nueva_slug: z.string().min(1).max(50),
      patron: z.string().min(1).max(500),
    });

    app.post('/catalogo/aplicar-diff-patron', async (req, reply) => {
      const parsed = aplicarPatronSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const { categoria_actual_slug, categoria_nueva_slug, patron } = parsed.data;
      if (categoria_actual_slug === categoria_nueva_slug) {
        return reply.code(422).send({ error: 'slugs_iguales' });
      }
      const [actualId, nuevaId] = await Promise.all([
        resolverSlug(db, categoria_actual_slug),
        resolverSlug(db, categoria_nueva_slug),
      ]);
      if (!actualId) return reply.code(400).send({ error: 'categoria_actual_inexistente' });
      if (!nuevaId) return reply.code(400).send({ error: 'categoria_nueva_inexistente' });

      // Match por evidencia_nueva->>'patron' = patron O evidencia_nueva->>'mcc_match' = patron
      const updated = await db
        .update(comerciosCatalogo)
        .set({
          categoriaId: nuevaId,
          fuenteCategoria: 'manual',
          confianza: '1.00',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(comerciosCatalogo.categoriaId, actualId),
            eq(comerciosCatalogo.categoriaNuevaId, nuevaId),
            isNotNull(comerciosCatalogo.recategorizadoAt),
            sql`(${comerciosCatalogo.evidenciaNueva}->>'patron' = ${patron} OR ${comerciosCatalogo.evidenciaNueva}->>'mcc_match' = ${patron})`,
          ),
        )
        .returning({ id: comerciosCatalogo.id });

      return reply.send({ actualizadas: updated.length, patron });
    });

    const decisionSchema = z.object({
      decision: z.enum(['aplicar', 'mantener']),
    });

    app.post<{ Params: { id: string } }>('/catalogo/comercios/:id/decision', async (req, reply) => {
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input' });
      }
      const id = req.params.id;
      if (parsed.data.decision === 'aplicar') {
        // promover categoria_nueva_id → categoria_id, marcar manual
        const upd = await db
          .update(comerciosCatalogo)
          .set({
            categoriaId: sql`${comerciosCatalogo.categoriaNuevaId}`,
            fuenteCategoria: 'manual',
            confianza: '1.00',
            updatedAt: new Date(),
          })
          .where(and(eq(comerciosCatalogo.id, id), isNotNull(comerciosCatalogo.categoriaNuevaId)))
          .returning({ id: comerciosCatalogo.id });
        if (upd.length === 0) return reply.code(404).send({ error: 'no_aplicable' });
        return reply.send({ ok: true, decision: 'aplicar' });
      }
      // mantener: alinear categoria_nueva_id con categoria_id (sale del diff)
      const upd = await db
        .update(comerciosCatalogo)
        .set({
          categoriaNuevaId: sql`${comerciosCatalogo.categoriaId}`,
          fuenteNueva: 'manual',
          confianzaNueva: '1.00',
          updatedAt: new Date(),
        })
        .where(eq(comerciosCatalogo.id, id))
        .returning({ id: comerciosCatalogo.id });
      if (upd.length === 0) return reply.code(404).send({ error: 'no_existe' });
      return reply.send({ ok: true, decision: 'mantener' });
    });
  };
