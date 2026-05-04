import { eq, sql, and } from 'drizzle-orm';
import type { Db } from '../client.js';
import { comerciosCatalogo } from '../schema/index.js';
import type { BancardLookup, ComercioBancard } from '../../layers/bancard.js';
import type { ComercioLookup, ComercioCandidato } from '../../layers/comercio.js';
import type { CatalogoLookup, CatalogoHit } from '../../layers/catalogo.js';

export function crearBancardLookup(db: Db): BancardLookup {
  return {
    async porNombreBancard(nombreNormalizado): Promise<ComercioBancard | null> {
      const rows = await db
        .select({
          id: comerciosCatalogo.id,
          nombreBancard: comerciosCatalogo.nombreBancard,
          categoriaId: comerciosCatalogo.categoriaId,
        })
        .from(comerciosCatalogo)
        .where(eq(comerciosCatalogo.nombreBancard, nombreNormalizado))
        .limit(1);
      const r = rows[0];
      if (!r || !r.nombreBancard) return null;
      return { id: r.id, nombreBancard: r.nombreBancard, categoriaId: r.categoriaId };
    },
  };
}

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

export function crearComercioLookup(db: Db): ComercioLookup {
  return {
    async candidatosPorTexto(texto): Promise<ComercioCandidato[]> {
      const t = texto.trim();
      if (!t) return [];
      const rows = await db
        .select({
          id: comerciosCatalogo.id,
          nombreNormalizado: comerciosCatalogo.nombreNormalizado,
          categoriaId: comerciosCatalogo.categoriaId,
          fuentePrev: comerciosCatalogo.fuenteCategoria,
          confianzaPrev: comerciosCatalogo.confianza,
          evidenciaPrev: comerciosCatalogo.evidencia,
        })
        .from(comerciosCatalogo)
        .where(
          sql`${comerciosCatalogo.nombreNormalizado} = ${t}
              OR ${comerciosCatalogo.nombreNormalizado} LIKE ${'%' + t + '%'}
              OR ${t} LIKE '%' || ${comerciosCatalogo.nombreNormalizado} || '%'`,
        )
        .limit(20);
      return rows.map((r) => ({
        id: r.id,
        nombreNormalizado: r.nombreNormalizado,
        categoriaId: r.categoriaId,
        fuentePrev: r.fuentePrev,
        confianzaPrev: r.confianzaPrev != null ? Number(r.confianzaPrev) : null,
        evidenciaPrev: r.evidenciaPrev,
      }));
    },
  };
}
