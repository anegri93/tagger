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

function ultimoDiaDelMes(mes: string): string {
  const [year, month] = mes.split('-').map(Number) as [number, number];
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return next; // primer día del mes siguiente (lo usamos como <)
}

export const presupuestosRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    // GET /presupuestos — lista vigente actual (mes en curso), excluye los dados de baja.
    app.get<{ Querystring: { usuario?: string } }>('/presupuestos', async (req, reply) => {
      const u = usuarioParam.safeParse(req.query.usuario);
      if (!u.success) return reply.code(400).send({ error: 'usuario_invalido' });
      const hoy = new Date().toISOString().slice(0, 10);

      const r = await db.execute(sql`
        SELECT DISTINCT ON (categoria_slug)
               id, usuario_id, categoria_id, categoria_slug, categoria_nombre,
               monto_mensual, vigente_desde, created_at, updated_at
        FROM presupuestos
        WHERE usuario_id = ${u.data}
          AND vigente_desde <= ${hoy}::date
        ORDER BY categoria_slug, vigente_desde DESC
      `);

      const items = r.rows
        .map((row: any) => ({
          id: row.id,
          usuario: row.usuario_id,
          categoria_id: row.categoria_id,
          categoria_slug: row.categoria_slug,
          categoria_nombre: row.categoria_nombre,
          monto_mensual: Number(row.monto_mensual),
          vigente_desde: row.vigente_desde,
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString(),
        }))
        .filter((x) => x.monto_mensual > 0);

      return reply.send({ items });
    });

    // POST /presupuestos — alta o re-alta: inserta nueva versión vigente desde hoy.
    // Si ya existe un presupuesto vigente (monto > 0) para misma (usuario, categoria), error 409.
    app.post<{ Body: unknown }>('/presupuestos', async (req, reply) => {
      const p = crearSchema.safeParse(req.body);
      if (!p.success) return reply.code(400).send({ error: 'payload_invalido', issues: p.error.issues });
      const { usuario, categoria_id, monto_mensual } = p.data;

      const cat = await db.execute(sql`SELECT slug, nombre FROM categorias WHERE id = ${categoria_id}`);
      const catRow = cat.rows[0] as any;
      if (!catRow) return reply.code(404).send({ error: 'categoria_no_encontrada' });
      if (catRow.slug === 'sin-categoria') {
        return reply.code(400).send({ error: 'sin_categoria_no_admite_presupuesto' });
      }

      const hoy = new Date().toISOString().slice(0, 10);

      // ¿Ya hay uno vigente y activo?
      const vigente = await db.execute(sql`
        SELECT monto_mensual FROM presupuestos
        WHERE usuario_id = ${usuario}
          AND categoria_slug = ${catRow.slug}
          AND vigente_desde <= ${hoy}::date
        ORDER BY vigente_desde DESC LIMIT 1
      `);
      const vigenteRow = vigente.rows[0] as any;
      if (vigenteRow && Number(vigenteRow.monto_mensual) > 0) {
        return reply.code(409).send({ error: 'presupuesto_ya_existe' });
      }

      const r = await db.execute(sql`
        INSERT INTO presupuestos
          (usuario_id, categoria_id, categoria_nombre, categoria_slug, monto_mensual, vigente_desde)
        VALUES
          (${usuario}, ${categoria_id}, ${catRow.nombre}, ${catRow.slug}, ${monto_mensual}, ${hoy}::date)
        RETURNING id, created_at, vigente_desde
      `);
      const row = r.rows[0] as any;
      return reply.code(201).send({
        id: row.id,
        usuario,
        categoria_id,
        categoria_slug: catRow.slug,
        categoria_nombre: catRow.nombre,
        monto_mensual,
        vigente_desde: row.vigente_desde,
        created_at: new Date(row.created_at).toISOString(),
      });
    });

    // PATCH /presupuestos/:id — editar monto = INSERT nueva versión.
    // No muta la fila pasada (preserva histórico de topes).
    app.patch<{ Params: { id: string }; Body: unknown }>('/presupuestos/:id', async (req, reply) => {
      const p = actualizarSchema.safeParse(req.body);
      if (!p.success) return reply.code(400).send({ error: 'payload_invalido', issues: p.error.issues });

      const base = await db.execute(sql`
        SELECT usuario_id, categoria_id, categoria_slug, categoria_nombre
        FROM presupuestos WHERE id = ${req.params.id}
      `);
      const baseRow = base.rows[0] as any;
      if (!baseRow) return reply.code(404).send({ error: 'no_encontrado' });

      const hoy = new Date().toISOString().slice(0, 10);

      const r = await db.execute(sql`
        INSERT INTO presupuestos
          (usuario_id, categoria_id, categoria_nombre, categoria_slug, monto_mensual, vigente_desde)
        VALUES
          (${baseRow.usuario_id}, ${baseRow.categoria_id}, ${baseRow.categoria_nombre},
           ${baseRow.categoria_slug}, ${p.data.monto_mensual}, ${hoy}::date)
        RETURNING id
      `);
      return reply.send({ ok: true, id: (r.rows[0] as any).id });
    });

    // DELETE /presupuestos/:id — baja = INSERT versión con monto 0.
    // Conserva versiones previas para que meses pasados sigan mostrando tope real.
    app.delete<{ Params: { id: string } }>('/presupuestos/:id', async (req, reply) => {
      const base = await db.execute(sql`
        SELECT usuario_id, categoria_id, categoria_slug, categoria_nombre
        FROM presupuestos WHERE id = ${req.params.id}
      `);
      const baseRow = base.rows[0] as any;
      if (!baseRow) return reply.code(404).send({ error: 'no_encontrado' });

      const hoy = new Date().toISOString().slice(0, 10);
      await db.execute(sql`
        INSERT INTO presupuestos
          (usuario_id, categoria_id, categoria_nombre, categoria_slug, monto_mensual, vigente_desde)
        VALUES
          (${baseRow.usuario_id}, ${baseRow.categoria_id}, ${baseRow.categoria_nombre},
           ${baseRow.categoria_slug}, 0, ${hoy}::date)
      `);
      return reply.send({ ok: true });
    });

    // GET /presupuestos/estado?mes=YYYY-MM — tope vigente en ese mes + gastos.
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
        const fin = ultimoDiaDelMes(mes);

        // Tope vigente: la fila más reciente con vigente_desde < fin del mes consultado.
        // Si esa fila tiene monto=0 (baja), no aparece (filtrada después).
        const presupuestos = await db.execute(sql`
          WITH vigente AS (
            SELECT DISTINCT ON (categoria_slug)
                   id, categoria_id, categoria_slug, categoria_nombre,
                   monto_mensual, vigente_desde
            FROM presupuestos
            WHERE usuario_id = ${u.data}
              AND vigente_desde < ${fin}::date
            ORDER BY categoria_slug, vigente_desde DESC
          )
          SELECT v.id, v.categoria_id, v.categoria_slug, v.categoria_nombre,
                 v.monto_mensual, v.vigente_desde,
                 COALESCE(g.gastado, 0)::numeric AS gastado,
                 COALESCE(g.movs, 0)::int AS movs
          FROM vigente v
          LEFT JOIN (
            SELECT COALESCE(m.categoria_confirmada_id, m.categoria_predicha_id) AS cat_id,
                   SUM(-m.monto) AS gastado, COUNT(*)::int AS movs
            FROM movimientos m
            WHERE m.created_at >= ${inicio}::timestamptz
              AND m.created_at < ${fin}::timestamptz
              AND m.monto < 0
            GROUP BY 1
          ) g ON g.cat_id = v.categoria_id
          WHERE v.monto_mensual > 0
          ORDER BY v.categoria_nombre ASC
        `);

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
            categoria_borrada: row.categoria_id === null,
            presupuesto,
            gastado,
            restante,
            pct,
            movs: row.movs,
            vigente_desde: row.vigente_desde,
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
