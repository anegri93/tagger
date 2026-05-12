import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

const IGNORE_CATS = new Set(['Por defecto', 'Sin Categoría', 'Sin Categoria', '']);
const GENERIC_MCC_CATS = new Set(['Otros', 'Servicios']);

interface AgreementMccRow {
  nombre: string;
  cantidad: number | null;
  mcc: string | null;
  mcc_categoria_id: string | null;
  mcc_categoria_nombre: string | null;
  mcc_descripcion: string | null;
  mcc_ambiguo: boolean | null;
  fuente_categoria: string | null;
  categoria_predicha_id: string | null;
  categoria_predicha_nombre: string | null;
  confianza: string | null;
  latency_ms: number | null;
}

interface AgreementRow {
  nombre: string;
  cantidad: number | null;
  categoria_xlsx: string | null;
  fuente_categoria: string | null;
  categoria_predicha_nombre: string | null;
  categoria_predicha_slug: string | null;
  confianza: string | null;
  latency_ms: number | null;
  requiere_revision: boolean | null;
}

export const groundTruthAgreementRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Params: { batch_id: string }; Querystring: { ground_truth?: string } }>(
      '/test-batch/:batch_id/agreement',
      async (req, reply) => {
        const batchId = req.params.batch_id?.trim();
        if (!batchId) return reply.code(400).send({ error: 'batch_id requerido' });
        const groundTruthBatch = req.query.ground_truth?.trim() ?? 'datamayo-2026-05';

        const result = await db.execute(sql`
          SELECT
            gt.nombre,
            gt.cantidad,
            gt.categoria_xlsx,
            m.fuente_categoria,
            c.nombre AS categoria_predicha_nombre,
            c.slug AS categoria_predicha_slug,
            m.confianza,
            m.latency_ms,
            m.requiere_revision
          FROM test_ground_truth gt
          LEFT JOIN movimientos m
            ON m.batch_id = ${batchId} AND m.nombre_bancard = gt.nombre
          LEFT JOIN categorias c ON c.id = m.categoria_predicha_id
          WHERE gt.batch_id = ${groundTruthBatch}
        `);
        const rows = result.rows as unknown as AgreementRow[];

        let total = 0;
        let testeados = 0;
        let conGroundTruth = 0;
        let agreement = 0;
        let cantidadTotal = 0;
        let cantidadConGT = 0;
        let cantidadAgreement = 0;

        const porFuente: Record<
          string,
          { count: number; agreement: number; cantidad: number; cantidadAgreement: number }
        > = {};
        const mismatches: Array<{
          nombre: string;
          cantidad: number | null;
          categoria_xlsx: string;
          fuente: string | null;
          categoria_predicha: string | null;
        }> = [];

        for (const r of rows) {
          total++;
          const cantidad = r.cantidad ?? 0;
          cantidadTotal += cantidad;
          if (!r.fuente_categoria) continue;
          testeados++;

          const f = r.fuente_categoria;
          if (!porFuente[f])
            porFuente[f] = { count: 0, agreement: 0, cantidad: 0, cantidadAgreement: 0 };
          porFuente[f].count++;
          porFuente[f].cantidad += cantidad;

          const xlsxCat = (r.categoria_xlsx ?? '').trim();
          if (!xlsxCat || IGNORE_CATS.has(xlsxCat)) continue;
          conGroundTruth++;
          cantidadConGT += cantidad;

          const predicho = (r.categoria_predicha_nombre ?? '').trim();
          const match = predicho.toLowerCase() === xlsxCat.toLowerCase();
          if (match) {
            agreement++;
            cantidadAgreement += cantidad;
            porFuente[f].agreement++;
            porFuente[f].cantidadAgreement += cantidad;
          } else {
            if (mismatches.length < 50) {
              mismatches.push({
                nombre: r.nombre,
                cantidad,
                categoria_xlsx: xlsxCat,
                fuente: f,
                categoria_predicha: predicho || null,
              });
            }
          }
        }

        mismatches.sort((a, b) => (b.cantidad ?? 0) - (a.cantidad ?? 0));

        const fuenteBreakdown = Object.entries(porFuente).map(([fuente, v]) => ({
          fuente,
          count: v.count,
          agreement: v.agreement,
          agreement_pct: v.count > 0 ? Number(((v.agreement / v.count) * 100).toFixed(2)) : 0,
          cantidad: v.cantidad,
          cantidad_agreement_pct:
            v.cantidad > 0 ? Number(((v.cantidadAgreement / v.cantidad) * 100).toFixed(2)) : 0,
        }));

        return reply.send({
          batch_id: batchId,
          ground_truth_batch: groundTruthBatch,
          total_ground_truth: total,
          testeados,
          con_ground_truth_util: conGroundTruth,
          ignored_categories: Array.from(IGNORE_CATS).filter((c) => c),
          agreement: {
            crudo: agreement,
            crudo_pct:
              conGroundTruth > 0 ? Number(((agreement / conGroundTruth) * 100).toFixed(2)) : 0,
            ponderado_cantidad: cantidadAgreement,
            ponderado_cantidad_pct:
              cantidadConGT > 0
                ? Number(((cantidadAgreement / cantidadConGT) * 100).toFixed(2))
                : 0,
            cantidad_total_evaluada: cantidadConGT,
          },
          cantidad_total_dataset: cantidadTotal,
          por_fuente: fuenteBreakdown.sort((a, b) => b.count - a.count),
          top_mismatches_por_cantidad: mismatches.slice(0, 20),
        });
      },
    );

    app.get<{
      Params: { batch_id: string };
      Querystring: {
        ground_truth?: string;
        include_ambiguo?: string;
        include_generic?: string;
        reference?: string;
      };
    }>('/test-batch/:batch_id/agreement-mcc', async (req, reply) => {
      const batchId = req.params.batch_id?.trim();
      if (!batchId) return reply.code(400).send({ error: 'batch_id requerido' });
      const groundTruthBatch = req.query.ground_truth?.trim() ?? 'datamayo-2026-05';
      const includeAmbiguo = req.query.include_ambiguo === 'true';
      const includeGeneric = req.query.include_generic === 'true';
      const useCombined = req.query.reference === 'combined_mcc';
      const refColExpr = useCombined ? sql`gt.combined_mcc` : sql`gt.mcc`;

      const result = await db.execute(sql`
        SELECT
          gt.nombre,
          gt.cantidad,
          ${refColExpr} AS mcc,
          mc.categoria_id AS mcc_categoria_id,
          mcat.nombre AS mcc_categoria_nombre,
          mc.descripcion AS mcc_descripcion,
          mc.ambiguo AS mcc_ambiguo,
          m.fuente_categoria,
          m.categoria_predicha_id,
          pcat.nombre AS categoria_predicha_nombre,
          m.confianza,
          m.latency_ms
        FROM test_ground_truth gt
        LEFT JOIN mcc_catalogo mc ON mc.cod_mcc = ${refColExpr}
        LEFT JOIN categorias mcat ON mcat.id = mc.categoria_id
        LEFT JOIN movimientos m ON m.batch_id = ${batchId} AND m.nombre_bancard = gt.nombre
        LEFT JOIN categorias pcat ON pcat.id = m.categoria_predicha_id
        WHERE gt.batch_id = ${groundTruthBatch}
      `);
      const rows = result.rows as unknown as AgreementMccRow[];

      let total = 0;
      let testeados = 0;
      let evaluables = 0;
      let agreement = 0;
      let cantidadEvaluable = 0;
      let cantidadAgreement = 0;
      let sinMcc = 0;
      let mccAmbiguo = 0;
      let mccGenerico = 0;
      let sinPrediccion = 0;

      const porFuente: Record<
        string,
        { count: number; agreement: number; cantidad: number; cantidadAgreement: number }
      > = {};
      const matrizConfusion: Record<string, Record<string, number>> = {};
      const mismatches: Array<{
        nombre: string;
        cantidad: number | null;
        mcc: string | null;
        mcc_categoria: string | null;
        mcc_descripcion: string | null;
        fuente: string | null;
        categoria_predicha: string | null;
      }> = [];

      for (const r of rows) {
        total++;
        const cantidad = r.cantidad ?? 0;

        if (!r.fuente_categoria) {
          sinPrediccion++;
          continue;
        }
        testeados++;

        const f = r.fuente_categoria;
        if (!porFuente[f])
          porFuente[f] = { count: 0, agreement: 0, cantidad: 0, cantidadAgreement: 0 };
        porFuente[f].count++;
        porFuente[f].cantidad += cantidad;

        if (!r.mcc || !r.mcc_categoria_id) {
          sinMcc++;
          continue;
        }
        if (r.mcc_ambiguo && !includeAmbiguo) {
          mccAmbiguo++;
          continue;
        }
        const mccCat = (r.mcc_categoria_nombre ?? '').trim();
        if (GENERIC_MCC_CATS.has(mccCat) && !includeGeneric) {
          mccGenerico++;
          continue;
        }
        evaluables++;
        cantidadEvaluable += cantidad;

        const predicho = (r.categoria_predicha_nombre ?? '').trim();
        const match = predicho.toLowerCase() === mccCat.toLowerCase();
        if (match) {
          agreement++;
          cantidadAgreement += cantidad;
          porFuente[f].agreement++;
          porFuente[f].cantidadAgreement += cantidad;
        } else {
          if (!matrizConfusion[mccCat]) matrizConfusion[mccCat] = {};
          matrizConfusion[mccCat][predicho || '(sin categoria)'] =
            (matrizConfusion[mccCat][predicho || '(sin categoria)'] ?? 0) + 1;
          mismatches.push({
            nombre: r.nombre,
            cantidad,
            mcc: r.mcc,
            mcc_categoria: mccCat,
            mcc_descripcion: r.mcc_descripcion,
            fuente: f,
            categoria_predicha: predicho || null,
          });
        }
      }

      mismatches.sort((a, b) => (b.cantidad ?? 0) - (a.cantidad ?? 0));

      const fuenteBreakdown = Object.entries(porFuente)
        .map(([fuente, v]) => ({
          fuente,
          count: v.count,
          agreement: v.agreement,
          agreement_pct: v.count > 0 ? Number(((v.agreement / v.count) * 100).toFixed(2)) : 0,
          cantidad: v.cantidad,
          cantidad_agreement_pct:
            v.cantidad > 0 ? Number(((v.cantidadAgreement / v.cantidad) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const matrizFlat = Object.entries(matrizConfusion).flatMap(([esperada, preds]) =>
        Object.entries(preds).map(([predicha, n]) => ({ esperada, predicha, n })),
      );
      matrizFlat.sort((a, b) => b.n - a.n);

      return reply.send({
        batch_id: batchId,
        ground_truth_batch: groundTruthBatch,
        modo: 'proxy_mcc',
        params: { include_ambiguo: includeAmbiguo, include_generic: includeGeneric },
        contadores: {
          total_ground_truth: total,
          testeados,
          sin_prediccion: sinPrediccion,
          sin_mcc_mapeado: sinMcc,
          mcc_ambiguo: mccAmbiguo,
          mcc_generico: mccGenerico,
          evaluables,
        },
        agreement: {
          crudo: agreement,
          crudo_pct: evaluables > 0 ? Number(((agreement / evaluables) * 100).toFixed(2)) : 0,
          ponderado_cantidad: cantidadAgreement,
          ponderado_cantidad_pct:
            cantidadEvaluable > 0
              ? Number(((cantidadAgreement / cantidadEvaluable) * 100).toFixed(2))
              : 0,
          cantidad_evaluable: cantidadEvaluable,
        },
        por_fuente: fuenteBreakdown,
        top_mismatches_por_cantidad: mismatches.slice(0, 30),
        top_confusion_pairs: matrizFlat.slice(0, 20),
      });
    });
  };
