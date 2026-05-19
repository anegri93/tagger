import type { MovimientoInput, ResultadoCapa } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';

export interface MccEntry {
  codMcc: string;
  categoriaId: string | null;
  ambiguo: boolean;
}

export interface MccLookup {
  porCodigo(codMcc: string): Promise<MccEntry | null>;
}

export interface MccPorNombreHit {
  mcc: string;
  categoriaId: string;
  requiereRevision: boolean;
}

export interface MccPorNombreLookup {
  porNombre(nombre: string): Promise<MccPorNombreHit | null>;
}

export interface EvaluarMccOpts {
  ignorarAmbiguo?: boolean;
}

export interface CapaMcc {
  evaluar(input: MovimientoInput, opts?: EvaluarMccOpts): Promise<ResultadoCapa | null>;
  /** Compat para callers que pasan solo codigo MCC (legacy de pipeline previo). */
  evaluarCodigo(
    codMcc: string | null | undefined,
    opts?: EvaluarMccOpts,
  ): Promise<ResultadoCapa | null>;
}

const CONFIANZA_MCC_AMBIGUO = 0.5; // bajo threshold (0.70) → requiereRevision=true automático

async function evaluarPorCodigo(
  lookup: MccLookup,
  codMcc: string | null | undefined,
  _opts?: EvaluarMccOpts,
): Promise<ResultadoCapa | null> {
  if (!codMcc) return null;
  const trimmed = codMcc.trim();
  if (!trimmed) return null;
  const hit = await lookup.porCodigo(trimmed);
  if (!hit) return null;
  if (!hit.categoriaId) return null;
  // MCC ambiguo: matchea siempre, confianza baja → cae bajo threshold → requiere_revision=true
  return {
    categoriaId: hit.categoriaId,
    confianza: hit.ambiguo ? CONFIANZA_MCC_AMBIGUO : CONFIANZA.mcc,
    fuente: 'mcc',
    evidencia: { mcc_match: hit.codMcc, ...(hit.ambiguo ? { mcc_ambiguo: true } : {}) },
  };
}

export function crearCapaMcc(
  lookup: MccLookup,
  porNombre?: MccPorNombreLookup,
): CapaMcc {
  return {
    async evaluar(input, opts) {
      // 1. MCC directo del input.
      const r = await evaluarPorCodigo(lookup, input.mcc, opts);
      if (r) return r;
      // 2. Fallback: MCC inferido por nombre.
      if (porNombre) {
        const nombre = input.nombreBancard ?? input.nombreComercio ?? null;
        if (nombre) {
          const target = normalize(nombre);
          if (target) {
            const hit = await porNombre.porNombre(nombre);
            if (hit) {
              return {
                categoriaId: hit.categoriaId,
                confianza: CONFIANZA.mcc,
                fuente: 'mcc',
                evidencia: { mcc_match: hit.mcc, mcc_inferido_por_nombre: true },
              };
            }
          }
        }
      }
      return null;
    },
    async evaluarCodigo(codMcc, opts) {
      return evaluarPorCodigo(lookup, codMcc, opts);
    },
  };
}
