import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { normalize } from '../../domain/normalize.js';

export interface MccPorNombreLookup {
  inferir(nombre: string | null | undefined): Promise<string | null>;
}

export function crearMccPorNombreLookup(db: Db): MccPorNombreLookup {
  return {
    async inferir(nombre) {
      if (!nombre) return null;
      const target = normalize(nombre);
      if (!target) return null;
      const result = await db.execute(sql`
        WITH agg AS (
          SELECT mcc, COUNT(*)::int AS n
          FROM comercios_catalogo
          WHERE nombre_normalizado = ${target} AND mcc IS NOT NULL
          GROUP BY mcc
          UNION ALL
          SELECT mcc, COUNT(*)::int AS n
          FROM test_ground_truth
          WHERE nombre_normalizado = ${target} AND mcc IS NOT NULL
          GROUP BY mcc
        )
        SELECT mcc, SUM(n)::int AS n
        FROM agg
        GROUP BY mcc
        ORDER BY n DESC
        LIMIT 1
      `);
      const row = result.rows[0] as { mcc: string; n: number } | undefined;
      return row?.mcc ?? null;
    },
  };
}
