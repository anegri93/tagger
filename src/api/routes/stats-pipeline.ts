import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

const WINDOWS: Record<string, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  'all': '100 years', // efectivamente sin filtro
};

type FuenteRow = {
  fuente: string | null;
  count: number;
  [key: string]: unknown;
};

interface CapaRow {
  capa: string;
  count: number;
  pct: number;
}

/**
 * Mapea fuente → capa de pipeline.
 * Capa 0: reglas user-scope → fuente='manual' (origen correccion/manual)
 * Capa 1: reglas globales → fuentes regex/literal/contiene
 * Capa 2: MCC (directo o por nombre) → fuente='mcc'
 * Capa 3: IA → fuente='ia'
 * Sin categoría / pendiente IA: capa='sin_match'
 */
function fuenteACapa(fuente: string | null): string {
  if (fuente === 'manual') return '0_reglas_usuario';
  if (fuente === 'regex' || fuente === 'literal' || fuente === 'contiene') return '1_reglas_global';
  if (fuente === 'mcc') return '2_mcc';
  if (fuente === 'ia') return '3_ia';
  // Legacy/null
  if (fuente === 'bancard' || fuente === 'nombre') return '1_reglas_global';
  if (fuente === 'prefijo' || fuente === 'patrones') return '1_reglas_global';
  return 'sin_match';
}

export const statsPipelineRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { ventana?: string } }>(
      '/stats/pipeline',
      async (req, reply) => {
        const ventanaKey = req.query.ventana ?? '24h';
        const ventanaSql = WINDOWS[ventanaKey];
        if (!ventanaSql) {
          return reply.code(400).send({
            error: 'ventana_invalida',
            opciones: Object.keys(WINDOWS),
          });
        }
        const interval = sql.raw(`'${ventanaSql}'::interval`);

        // Por fuente raw
        const fuenteRes = await db.execute<FuenteRow>(sql`
          SELECT fuente_categoria AS fuente, COUNT(*)::int AS count
          FROM movimientos
          WHERE created_at >= now() - ${interval}
          GROUP BY fuente_categoria
        `);

        // Total + agg por capa
        const totalRes = await db.execute<{ total: number }>(sql`
          SELECT COUNT(*)::int AS total
          FROM movimientos
          WHERE created_at >= now() - ${interval}
        `);
        const total = Number(totalRes.rows[0]?.total ?? 0);

        const capaCounts = new Map<string, number>();
        const fuenteCounts: Array<{ fuente: string | null; count: number; pct: number }> = [];
        for (const r of fuenteRes.rows) {
          const count = Number(r.count);
          const capa = fuenteACapa(r.fuente);
          capaCounts.set(capa, (capaCounts.get(capa) ?? 0) + count);
          fuenteCounts.push({
            fuente: r.fuente,
            count,
            pct: total > 0 ? Number(((100 * count) / total).toFixed(2)) : 0,
          });
        }
        const capas: CapaRow[] = [
          '0_reglas_usuario',
          '1_reglas_global',
          '2_mcc',
          '3_ia',
          'sin_match',
        ].map((k) => {
          const count = capaCounts.get(k) ?? 0;
          return {
            capa: k,
            count,
            pct: total > 0 ? Number(((100 * count) / total).toFixed(2)) : 0,
          };
        });

        // Correcciones / revisiones en la ventana
        const revRes = await db.execute<{ revisiones: number; correcciones: number }>(sql`
          SELECT
            (SELECT COUNT(*)::int FROM movimientos
             WHERE created_at >= now() - ${interval} AND requiere_revision = true) AS revisiones,
            (SELECT COUNT(*)::int FROM correcciones_usuario
             WHERE created_at >= now() - ${interval}) AS correcciones
        `);

        // Latencia
        const latRes = await db.execute<{
          p50: number | null;
          p95: number | null;
          p99: number | null;
          avg: number | null;
        }>(sql`
          SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95,
            percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99,
            AVG(latency_ms)::int AS avg
          FROM movimientos
          WHERE created_at >= now() - ${interval} AND latency_ms IS NOT NULL
        `);
        const lat = latRes.rows[0];

        return reply.send({
          ventana: ventanaKey,
          total,
          capas,
          fuentes: fuenteCounts.sort((a, b) => b.count - a.count),
          revisiones_pendientes: Number(revRes.rows[0]?.revisiones ?? 0),
          correcciones_aplicadas: Number(revRes.rows[0]?.correcciones ?? 0),
          latencia_ms: lat
            ? {
                p50: lat.p50 ? Number(lat.p50) : null,
                p95: lat.p95 ? Number(lat.p95) : null,
                p99: lat.p99 ? Number(lat.p99) : null,
                avg: lat.avg ? Number(lat.avg) : null,
              }
            : null,
        });
      },
    );
  };
