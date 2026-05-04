import type { ResultadoCapa } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';

export interface ComercioBancard {
  id: string;
  nombreBancard: string;
  categoriaId: string;
}

export interface BancardLookup {
  porNombreBancard(nombreNormalizado: string): Promise<ComercioBancard | null>;
}

export interface CapaBancard {
  evaluar(nombreBancard: string | null | undefined): Promise<ResultadoCapa | null>;
}

export function crearCapaBancard(lookup: BancardLookup): CapaBancard {
  return {
    async evaluar(nombreBancard) {
      const target = normalize(nombreBancard);
      if (!target) return null;
      const hit = await lookup.porNombreBancard(target);
      if (!hit) return null;
      return {
        categoriaId: hit.categoriaId,
        confianza: CONFIANZA.bancard,
        fuente: 'bancard',
        evidencia: { comercio_id: hit.id, match_type: 'bancard' },
      };
    },
  };
}
