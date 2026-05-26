import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';

const usuarioParam = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(120));

const crearSchema = z.object({
  usuario: z.string().min(1).max(120),
  categoria_id: z.string().uuid(),
  monto_mensual: z.number().positive().max(1_000_000_000),
});

const actualizarSchema = z.object({
  monto_mensual: z.number().positive().max(1_000_000_000),
});

const mesParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'mes_invalido (YYYY-MM)');

export const presupuestosRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { usuario?: string } }>('/presupuestos', async (req, reply) => {
      const u = usuarioParam.safeParse(req.query.usuario);
      if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
      const r = await db.execute(sql`
        SELECT p.id, p.usuario_id, p.categoria_id, p.monto_mensual,
               p.created_at, p.updated_at, c.slug AS categoria_slug, c.nombre AS categoria_nombre
        FROM presupuestos p
        JOIN categorias c ON c.id = p.categoria_id
        WHERE p.usuario_id = ${u.data}
        ORDER BY c.nombre ASC
      `);
      return reply.send({
        items: r.rows.map((row: any) => ({
          id: row.id,
          usuario: row.usuario_id,
          categoria_id: row.categoria_id,
          categoria_slug: row.categoria_slug,
          categoria_nombre: row.categoria_nombre,
          monto_mensual: Number(row.monto_mensual),
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString(),
        })),
      });
    });

    app.post<{ Body: unknown }>('/presupuestos', async (req, reply) => {
      const p = crearSchema.safeParse(req.body);
      if (!p.success) return reply.code(400).send({ error: 'payload_invalido', issues: p.error.issues });
      const { usuario, categoria_id, monto_mensual } = p.data;

      // Validar que la categoria no sea sin-categoria.
      const cat = await db.execute(sql`SELECT slug FROM categorias WHERE id = ${categoria_id}`);
      const slug = (cat.rows[0] as any)?.slug;
      if (!slug) return reply.code(404).send({ error: 'categoria_no_encontrada' });
      if (slug === 'sin-categoria') {
        return reply.code(400).send({ error: 'sin_categoria_no_admite_presupuesto' });
      }

      try {
        const r = await db.execute(sql`
          INSERT INTO presupuestos (usuario_id, categoria_id, monto_mensual)
          VALUES (${usuario}, ${categoria_id}, ${monto_mensual})
          RETURNING id, created_at
        `);
        const row = r.rows[0] as any;
        return reply.code(201).send({
          id: row.id,
          usuario,
          categoria_id,
          monto_mensual,
          created_at: new Date(row.created_at).toISOString(),
        });
      } catch (err: any) {
        if (err?.code === '23505') {
          return reply.code(409).send({ error: 'presupuesto_ya_existe' });
        }
        throw err;
      }
    });

    app.patch<{ Params: { id: string }; Body: unknown }>('/presupuestos/:id', async (req, reply) => {
      const p = actualizarSchema.safeParse(req.body);
      if (!p.success) return reply.code(400).send({ error: 'payload_invalido', issues: p.error.issues });
      const r = await db.execute(sql`
        UPDATE presupuestos
        SET monto_mensual = ${p.data.monto_mensual}, updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING id
      `);
      if (r.rows.length === 0) return reply.code(404).send({ error: 'no_encontrado' });
      return reply.send({ ok: true });
    });

    app.delete<{ Params: { id: string } }>('/presupuestos/:id', async (req, reply) => {
      const r = await db.execute(sql`DELETE FROM presupuestos WHERE id = ${req.params.id} RETURNING id`);
      if (r.rows.length === 0) return reply.code(404).send({ error: 'no_encontrado' });
      return reply.send({ ok: true });
    });

    // Estado: combina presupuestos activos con gastos del mes en curso.
    // Devuelve fila por presupuesto + bucket especial "sin_asignar" con totales
    // de gastos del mes que cayeron en sin-categoria.
    app.get<{ Querystring: { usuario?: string; mes?: string } }>(
      '/presupuestos/estado',
      async (req, reply) => {
        const u = usuarioParam.safeParse(req.query.usuario);
        if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
        const mes = req.query.mes ?? new Date().toISOString().slice(0, 7);
        if (!mesParam.safeParse(mes).success) {
          return reply.code(400).send({ error: 'mes_invalido' });
        }
        const inicio = `${mes}-01`;
        // primer día del mes siguiente
        const parts = mes.split('-').map(Number);
        const year = parts[0]!;
        const month = parts[1]!;
        const nextMes = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
        const fin = `${nextMes}-01`;

        // Nota: movimientos no tiene usuario_id (single-user demo). Filtramos por
        // categoria efectiva = COALESCE(categoria_confirmada_id, categoria_predicha_id)
        // y fecha = created_at.
        const presupuestos = await db.execute(sql`
          SELECT p.id, p.categoria_id, p.monto_mensual,
                 c.slug AS categoria_slug, c.nombre AS categoria_nombre,
                 COALESCE(g.gastado, 0)::numeric AS gastado,
                 COALESCE(g.movs, 0)::int AS movs
          FROM presupuestos p
          JOIN categorias c ON c.id = p.categoria_id
          LEFT JOIN (
            SELECT COALESCE(m.categoria_confirmada_id, m.categoria_predicha_id) AS cat_id,
                   SUM(-m.monto) AS gastado, COUNT(*)::int AS movs
            FROM movimientos m
            WHERE m.created_at >= ${inicio}::timestamptz
              AND m.created_at < ${fin}::timestamptz
              AND m.monto < 0
            GROUP BY 1
          ) g ON g.cat_id = p.categoria_id
          WHERE p.usuario_id = ${u.data}
          ORDER BY c.nombre ASC
        `);

        // Bucket sin_asignar: movs gasto sin ninguna categoria en el mes.
        const sinAsignar = await db.execute(sql`
          SELECT COALESCE(SUM(-m.monto), 0)::numeric AS gastado, COUNT(*)::int AS movs
          FROM movimientos m
          WHERE m.created_at >= ${inicio}::timestamptz
            AND m.created_at < ${fin}::timestamptz
            AND m.monto < 0
            AND m.categoria_confirmada_id IS NULL
            AND m.categoria_predicha_id IS NULL
        `);
        const sa = sinAsignar.rows[0] as any;

        const items = presupuestos.rows.map((row: any) => {
          const presupuesto = Number(row.monto_mensual);
          const gastado = Number(row.gastado);
          const restante = presupuesto - gastado;
          const pct = presupuesto > 0 ? Math.round((gastado / presupuesto) * 100) : 0;
          return {
            id: row.id,
            categoria_id: row.categoria_id,
            categoria_slug: row.categoria_slug,
            categoria_nombre: row.categoria_nombre,
            presupuesto,
            gastado,
            restante,
            pct,
            movs: row.movs,
          };
        });

        return reply.send({
          usuario: u.data,
          mes,
          items,
          sin_asignar: {
            gastado: Number(sa.gastado ?? 0),
            movs: sa.movs ?? 0,
          },
        });
      },
    );
  };
