import { eq, and } from 'drizzle-orm';
import type { Db } from '../client.js';
import { comerciosCatalogo } from '../schema/index.js';
import type { CatalogoLookup, CatalogoHit } from '../../layers/catalogo.js';

export function crearCatalogoLookup(db: Db): CatalogoLookup {
  return {
    async porBancardCodigo(bancardId, codigoComercio): Promise<CatalogoHit | null> {
      if (!bancardId || !codigoComercio) return null;
      const rows = await db
        .select({
          id: comerciosCatalogo.id,
          categoriaId: comerciosCatalogo.categoriaId,
          fuente: comerciosCatalogo.fuenteCategoria,
          confianza: comerciosCatalogo.confianza,
          requiereRevision: comerciosCatalogo.requiereRevision,
          evidencia: comerciosCatalogo.evidencia,
        })
        .from(comerciosCatalogo)
        .where(
          and(
            eq(comerciosCatalogo.bancardId, bancardId),
            eq(comerciosCatalogo.codigoComercio, codigoComercio),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        categoriaId: r.categoriaId,
        fuente: r.fuente,
        confianza: r.confianza != null ? Number(r.confianza) : null,
        requiereRevision: r.requiereRevision,
        evidencia: r.evidencia,
      };
    },
  };
}
