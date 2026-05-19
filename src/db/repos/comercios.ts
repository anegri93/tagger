import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { mccPorNombre } from '../schema/index.js';
import type { MccPorNombreLookup, MccPorNombreHit } from '../../layers/mcc.js';
import { normalize } from '../../domain/normalize.js';

export function crearMccPorNombreLookup(db: Db): MccPorNombreLookup {
  return {
    async porNombre(nombre): Promise<MccPorNombreHit | null> {
      const target = normalize(nombre);
      if (!target) return null;
      const rows = await db
        .select({
          mcc: mccPorNombre.mcc,
          categoriaId: mccPorNombre.categoriaId,
          requiereRevision: mccPorNombre.requiereRevision,
        })
        .from(mccPorNombre)
        .where(eq(mccPorNombre.nombreNormalizado, target))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
