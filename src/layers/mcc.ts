import type { ResultadoCapa } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';

export interface MccEntry {
  codMcc: string;
  categoriaId: string | null;
  ambiguo: boolean;
}

export interface MccLookup {
  porCodigo(codMcc: string): Promise<MccEntry | null>;
}

export interface EvaluarMccOpts {
  ignorarAmbiguo?: boolean;
}

export interface CapaMcc {
  evaluar(
    codMcc: string | null | undefined,
    opts?: EvaluarMccOpts,
  ): Promise<ResultadoCapa | null>;
}

export function crearCapaMcc(lookup: MccLookup): CapaMcc {
  return {
    async evaluar(codMcc, opts) {
      if (!codMcc) return null;
      const trimmed = codMcc.trim();
      if (!trimmed) return null;
      const hit = await lookup.porCodigo(trimmed);
      if (!hit) return null;
      if (hit.ambiguo && !opts?.ignorarAmbiguo) return null;
      if (!hit.categoriaId) return null;
      return {
        categoriaId: hit.categoriaId,
        confianza: CONFIANZA.mcc,
        fuente: 'mcc',
        evidencia: { mcc_match: hit.codMcc, ...(hit.ambiguo ? { mcc_ambiguo: true } : {}) },
      };
    },
  };
}
