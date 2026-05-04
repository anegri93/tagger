import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { mccCatalogo } from '../schema/index.js';
import type { MccLookup, MccEntry } from '../../layers/mcc.js';

export function crearMccLookup(db: Db): MccLookup {
  return {
    async porCodigo(codMcc): Promise<MccEntry | null> {
      const rows = await db
        .select({
          codMcc: mccCatalogo.codMcc,
          categoriaId: mccCatalogo.categoriaId,
          ambiguo: mccCatalogo.ambiguo,
        })
        .from(mccCatalogo)
        .where(eq(mccCatalogo.codMcc, codMcc))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
