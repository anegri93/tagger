import type { Evidencia, FuenteCategoria, ResultadoCapa } from '../domain/types.js';

export interface CatalogoHit {
  id: string;
  categoriaId: string;
  fuente: FuenteCategoria | null;
  confianza: number | null;
  requiereRevision: boolean;
  evidencia: Evidencia | null;
}

export interface CatalogoLookup {
  porBancardCodigo(
    bancardId: string | null | undefined,
    codigoComercio: string | null | undefined,
  ): Promise<CatalogoHit | null>;
}

export interface CapaCatalogo {
  evaluar(
    bancardId: string | null | undefined,
    codigoComercio: string | null | undefined,
  ): Promise<ResultadoCapa | null>;
}

export function crearCapaCatalogo(lookup: CatalogoLookup): CapaCatalogo {
  return {
    async evaluar(bancardId, codigoComercio) {
      const hit = await lookup.porBancardCodigo(bancardId, codigoComercio);
      if (!hit) return null;
      if (hit.requiereRevision) return null;
      if (!hit.fuente || hit.confianza == null) return null;
      return {
        categoriaId: hit.categoriaId,
        fuente: hit.fuente,
        confianza: hit.confianza,
        evidencia: {
          ...(hit.evidencia ?? {}),
          comercio_id: hit.id,
        },
      };
    },
  };
}
