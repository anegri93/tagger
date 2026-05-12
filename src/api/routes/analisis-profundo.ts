import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

export const analisisProfundoRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { batch_id: string }; Querystring: { ground_truth?: string } }>(
      '/test-batch/:batch_id/analisis',
      async (req, reply) => {
        const batchId = req.params.batch_id?.trim();
        if (!batchId) return reply.code(400).send({ error: 'batch_id requerido' });
        const groundTruthBatch = req.query.ground_truth?.trim() ?? 'datamayo-2026-05';

        const totalRow = await db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE fuente_categoria IS NOT NULL)::int AS con_fuente,
            COUNT(*) FILTER (WHERE fuente_categoria IS NULL)::int AS sin_fuente,
            COUNT(*) FILTER (WHERE requiere_revision)::int AS requieren_revision
          FROM movimientos WHERE batch_id = ${batchId}
        `);
        const total = totalRow.rows[0] as Record<string, number>;

        const porFuente = await db.execute(sql`
          SELECT
            COALESCE(fuente_categoria::text, 'sin_prediccion') AS fuente,
            COUNT(*)::int AS movimientos,
            COALESCE(SUM(gt.cantidad)::bigint, 0) AS volumen,
            ROUND(AVG(m.confianza)::numeric, 3) AS confianza_avg,
            ROUND(AVG(m.latency_ms)::numeric, 1) AS latency_avg_ms,
            COUNT(*) FILTER (WHERE m.requiere_revision)::int AS requieren_revision
          FROM movimientos m
          LEFT JOIN test_ground_truth gt ON gt.batch_id=${groundTruthBatch} AND gt.nombre=m.nombre_bancard
          WHERE m.batch_id = ${batchId}
          GROUP BY m.fuente_categoria
          ORDER BY movimientos DESC
        `);

        const porCategoria = await db.execute(sql`
          SELECT
            c.slug, c.nombre,
            COUNT(*)::int AS movimientos,
            COALESCE(SUM(gt.cantidad)::bigint, 0) AS volumen
          FROM movimientos m
          JOIN categorias c ON c.id = m.categoria_predicha_id
          LEFT JOIN test_ground_truth gt ON gt.batch_id=${groundTruthBatch} AND gt.nombre=m.nombre_bancard
          WHERE m.batch_id = ${batchId}
          GROUP BY c.slug, c.nombre
          ORDER BY volumen DESC
          LIMIT 30
        `);

        const patronesMasUsados = await db.execute(sql`
          SELECT
            (m.evidencia->>'regla_id')::uuid AS patron_id,
            m.evidencia->>'patron' AS patron_valor,
            m.fuente_categoria::text AS tipo,
            c.nombre AS categoria,
            COUNT(*)::int AS hits,
            COALESCE(SUM(gt.cantidad)::bigint, 0) AS volumen
          FROM movimientos m
          LEFT JOIN categorias c ON c.id = m.categoria_predicha_id
          LEFT JOIN test_ground_truth gt ON gt.batch_id=${groundTruthBatch} AND gt.nombre=m.nombre_bancard
          WHERE m.batch_id = ${batchId}
            AND m.fuente_categoria::text IN ('regex','literal','prefijo','contiene')
            AND m.evidencia->>'regla_id' IS NOT NULL
          GROUP BY patron_id, patron_valor, m.fuente_categoria, c.nombre
          ORDER BY volumen DESC
          LIMIT 30
        `);

        const sinPrediccionTop = await db.execute(sql`
          SELECT
            m.nombre_bancard AS nombre,
            COALESCE(gt.cantidad, 0)::int AS cantidad,
            gt.mcc,
            mc.descripcion AS mcc_desc
          FROM movimientos m
          LEFT JOIN test_ground_truth gt ON gt.batch_id=${groundTruthBatch} AND gt.nombre=m.nombre_bancard
          LEFT JOIN mcc_catalogo mc ON mc.cod_mcc = gt.mcc
          WHERE m.batch_id = ${batchId} AND m.fuente_categoria IS NULL
          ORDER BY gt.cantidad DESC NULLS LAST
          LIMIT 30
        `);

        const confianzaBuckets = await db.execute(sql`
          SELECT
            COALESCE(fuente_categoria::text, 'sin_prediccion') AS fuente,
            CASE
              WHEN confianza IS NULL THEN 'null'
              WHEN confianza >= 0.95 THEN '0.95-1.00'
              WHEN confianza >= 0.85 THEN '0.85-0.94'
              WHEN confianza >= 0.70 THEN '0.70-0.84'
              WHEN confianza >= 0.50 THEN '0.50-0.69'
              ELSE '<0.50'
            END AS bucket,
            COUNT(*)::int AS n
          FROM movimientos
          WHERE batch_id = ${batchId}
          GROUP BY fuente, bucket
          ORDER BY fuente, bucket
        `);

        const cobertura = await db.execute(sql`
          WITH rk AS (
            SELECT gt.nombre, gt.cantidad,
              NTILE(10) OVER (ORDER BY gt.cantidad DESC NULLS LAST) AS decil
            FROM test_ground_truth gt WHERE gt.batch_id = ${groundTruthBatch}
          )
          SELECT
            rk.decil,
            COUNT(*)::int AS comercios,
            SUM(rk.cantidad)::bigint AS volumen_decil,
            COUNT(m.id) FILTER (WHERE m.fuente_categoria IS NOT NULL)::int AS cubiertos,
            ROUND(100.0 * COUNT(m.id) FILTER (WHERE m.fuente_categoria IS NOT NULL) / COUNT(*)::numeric, 1) AS cobertura_pct
          FROM rk
          LEFT JOIN movimientos m ON m.batch_id=${batchId} AND m.nombre_bancard = rk.nombre
          GROUP BY rk.decil
          ORDER BY rk.decil
        `);

        const latencia = await db.execute(sql`
          SELECT
            COALESCE(fuente_categoria::text, 'sin_prediccion') AS fuente,
            MIN(latency_ms)::int AS min,
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms))::int AS p50,
            (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::int AS p95,
            (percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::int AS p99,
            MAX(latency_ms)::int AS max
          FROM movimientos
          WHERE batch_id = ${batchId} AND latency_ms IS NOT NULL
          GROUP BY fuente
          ORDER BY fuente
        `);

        return reply.send({
          batch_id: batchId,
          ground_truth_batch: groundTruthBatch,
          totales: total,
          por_fuente: porFuente.rows,
          top_categorias: porCategoria.rows,
          patrones_mas_usados: patronesMasUsados.rows,
          sin_prediccion_top_volumen: sinPrediccionTop.rows,
          confianza_buckets: confianzaBuckets.rows,
          cobertura_por_decil_volumen: cobertura.rows,
          latencia_por_fuente: latencia.rows,
        });
      },
    );
  };
