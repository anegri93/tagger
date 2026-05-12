import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { recategorizarCatalogo, type RecatStats } from '../../services/recategorizar-catalogo.js';
import type { CapasSincrono } from '../../pipeline/categorizar.js';

interface RunState {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  stats: RecatStats;
  estado: 'running' | 'done' | 'error';
  error?: string;
}

let currentRun: RunState | null = null;

function nuevoRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const recategorizarCatalogoRoute =
  (db: Db, capas: CapasSincrono): FastifyPluginAsync =>
  async (app) => {
    app.post('/catalogo/recategorizar', async (_req, reply) => {
      if (currentRun?.estado === 'running') {
        return reply.code(409).send({ error: 'run_en_progreso', run_id: currentRun.runId });
      }
      const runId = nuevoRunId();
      currentRun = {
        runId,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stats: { total: 0, procesados: 0, match: 0, diff: 0, sinCategoria: 0 },
        estado: 'running',
      };
      void recategorizarCatalogo({
        db,
        capas,
        onProgress: (s) => {
          if (currentRun) currentRun.stats = s;
        },
      })
        .then((stats) => {
          if (currentRun) {
            currentRun.stats = stats;
            currentRun.estado = 'done';
            currentRun.finishedAt = new Date().toISOString();
          }
        })
        .catch((err: unknown) => {
          if (currentRun) {
            currentRun.estado = 'error';
            currentRun.error = err instanceof Error ? err.message : String(err);
            currentRun.finishedAt = new Date().toISOString();
          }
        });
      return reply.code(202).send({ run_id: runId });
    });

    app.get('/catalogo/recategorizar/status', async (_req, reply) => {
      if (!currentRun) return reply.send({ run: null });
      return reply.send({ run: currentRun });
    });

    app.get<{ Querystring: { actual?: string; nueva?: string; limit?: string } }>(
      '/catalogo/recategorizar/diff-detalle',
      async (req, reply) => {
        const actual = req.query.actual;
        const nueva = req.query.nueva;
        if (!actual || !nueva) {
          return reply.code(400).send({ error: 'falta actual/nueva' });
        }
        const limit = Math.min(Number(req.query.limit ?? 100), 500);
        const rows = await db.execute(
          sql`SELECT cc.id, cc.nombre, cc.fuente_nueva, cc.confianza_nueva
              FROM comercios_catalogo cc
              JOIN categorias cat_a ON cat_a.id = cc.categoria_id
              JOIN categorias cat_n ON cat_n.id = cc.categoria_nueva_id
              WHERE cat_a.slug = ${actual}
                AND cat_n.slug = ${nueva}
                AND cc.recategorizado_at IS NOT NULL
                AND cc.categoria_nueva_id IS NOT NULL
                AND cc.categoria_nueva_id <> cc.categoria_id
              ORDER BY cc.nombre
              LIMIT ${limit}`,
        );
        return reply.send({ items: rows.rows, limit });
      },
    );

    app.get('/catalogo/recategorizar/comparacion', async (_req, reply) => {
      const totalRow = await db.execute(sql`SELECT count(*)::int AS n FROM comercios_catalogo`);
      const total = (totalRow.rows[0] as { n: number }).n;
      const recatRow = await db.execute(
        sql`SELECT count(*)::int AS n FROM comercios_catalogo WHERE recategorizado_at IS NOT NULL`,
      );
      const recategorizados = (recatRow.rows[0] as { n: number }).n;
      const matchRow = await db.execute(
        sql`SELECT count(*)::int AS n FROM comercios_catalogo
            WHERE recategorizado_at IS NOT NULL AND categoria_nueva_id = categoria_id`,
      );
      const match = (matchRow.rows[0] as { n: number }).n;
      const diffRow = await db.execute(
        sql`SELECT count(*)::int AS n FROM comercios_catalogo
            WHERE recategorizado_at IS NOT NULL
              AND categoria_nueva_id IS NOT NULL
              AND categoria_nueva_id <> categoria_id`,
      );
      const diff = (diffRow.rows[0] as { n: number }).n;
      const sinCatRow = await db.execute(
        sql`SELECT count(*)::int AS n FROM comercios_catalogo
            WHERE recategorizado_at IS NOT NULL AND categoria_nueva_id IS NULL`,
      );
      const sinCategoria = (sinCatRow.rows[0] as { n: number }).n;
      const topDiffs = await db.execute(
        sql`SELECT cat_a.slug AS actual, cat_n.slug AS nueva, count(*)::int AS n
            FROM comercios_catalogo cc
            JOIN categorias cat_a ON cat_a.id = cc.categoria_id
            JOIN categorias cat_n ON cat_n.id = cc.categoria_nueva_id
            WHERE cc.recategorizado_at IS NOT NULL
              AND cc.categoria_nueva_id IS NOT NULL
              AND cc.categoria_nueva_id <> cc.categoria_id
            GROUP BY cat_a.slug, cat_n.slug
            ORDER BY n DESC LIMIT 30`,
      );
      const pivotFuente = await db.execute(
        sql`SELECT fuente_nueva, count(*)::int AS n
            FROM comercios_catalogo
            WHERE recategorizado_at IS NOT NULL AND fuente_nueva IS NOT NULL
            GROUP BY fuente_nueva ORDER BY n DESC`,
      );
      return reply.send({
        tabla: 'catalogo',
        total,
        recategorizados,
        match,
        diff,
        sin_categoria: sinCategoria,
        top_diffs: topDiffs.rows,
        por_fuente_nueva: pivotFuente.rows,
        patrones_por_diff: [],
      });
    });
  };

export function _resetRunState(): void {
  currentRun = null;
}
