import { eq, and, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { comerciosCatalogo } from '../schema/index.js';
import type { CatalogoLookup, CatalogoHit } from '../../layers/catalogo.js';
import { normalize } from '../../domain/normalize.js';

function mapRow(r: {
  id: string;
  categoriaId: string;
  fuente: CatalogoHit['fuente'];
  confianza: string | null;
  requiereRevision: boolean;
  evidencia: CatalogoHit['evidencia'];
}): CatalogoHit {
  return {
    id: r.id,
    categoriaId: r.categoriaId,
    fuente: r.fuente,
    confianza: r.confianza != null ? Number(r.confianza) : null,
    requiereRevision: r.requiereRevision,
    evidencia: r.evidencia,
  };
}

const SELECT_COLS = {
  id: comerciosCatalogo.id,
  categoriaId: comerciosCatalogo.categoriaId,
  fuente: comerciosCatalogo.fuenteCategoria,
  confianza: comerciosCatalogo.confianza,
  requiereRevision: comerciosCatalogo.requiereRevision,
  evidencia: comerciosCatalogo.evidencia,
} as const;

export function crearCatalogoLookup(db: Db): CatalogoLookup {
  return {
    async porBancardCodigo(bancardId, codigoComercio): Promise<CatalogoHit | null> {
      if (!bancardId || !codigoComercio) return null;
      const rows = await db
        .select(SELECT_COLS)
        .from(comerciosCatalogo)
        .where(
          and(
            eq(comerciosCatalogo.bancardId, bancardId),
            eq(comerciosCatalogo.codigoComercio, codigoComercio),
          ),
        )
        .limit(1);
      const r = rows[0];
      return r ? mapRow(r) : null;
    },
    async porNombre(nombre): Promise<CatalogoHit | null> {
      if (!nombre) return null;
      const target = normalize(nombre);
      if (!target) return null;
      const rows = await db
        .select(SELECT_COLS)
        .from(comerciosCatalogo)
        .where(eq(comerciosCatalogo.nombreNormalizado, target))
        .orderBy(sql`(${comerciosCatalogo.bancardId} IS NOT NULL) DESC`)
        .limit(1);
      const r = rows[0];
      return r ? mapRow(r) : null;
    },
  };
}
