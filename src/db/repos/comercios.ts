import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { mccPorNombre } from '../schema/index.js';
import type { CatalogoLookup, CatalogoHit } from '../../layers/catalogo.js';
import { normalize } from '../../domain/normalize.js';

const CONFIANZA_MCC = 0.75;

function rowToHit(r: {
  id: string;
  categoriaId: string;
  mcc: string;
  requiereRevision: boolean;
}): CatalogoHit {
  return {
    id: r.id,
    categoriaId: r.categoriaId,
    fuente: 'mcc',
    confianza: CONFIANZA_MCC,
    requiereRevision: r.requiereRevision,
    evidencia: { mcc_match: r.mcc, mcc_inferido_por_nombre: true },
  };
}

export function crearCatalogoLookup(db: Db): CatalogoLookup {
  return {
    async porBancardCodigo() {
      // mcc_por_nombre no tiene bancard_id ni codigo_comercio (columnas eliminadas en migración 0017).
      return null;
    },
    async porNombre(nombre): Promise<CatalogoHit | null> {
      if (!nombre) return null;
      const target = normalize(nombre);
      if (!target) return null;
      const rows = await db
        .select({
          id: mccPorNombre.id,
          categoriaId: mccPorNombre.categoriaId,
          mcc: mccPorNombre.mcc,
          requiereRevision: mccPorNombre.requiereRevision,
        })
        .from(mccPorNombre)
        .where(eq(mccPorNombre.nombreNormalizado, target))
        .limit(1);
      const r = rows[0];
      return r ? rowToHit(r) : null;
    },
  };
}
