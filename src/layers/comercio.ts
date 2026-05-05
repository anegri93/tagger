import type { Evidencia, FuenteCategoria, ResultadoCapa } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';

const MIN_TEXT_CHARS = 5;
const MIN_SCORE_PARTIAL = 0.75;

export interface ComercioCandidato {
  id: string;
  nombreNormalizado: string;
  categoriaId: string;
  /** Fuente almacenada en catálogo (cuando comercio fue pre-categorizado por loader masivo). */
  fuentePrev?: FuenteCategoria | null;
  /** Confianza almacenada en catálogo. */
  confianzaPrev?: number | null;
  /** Evidencia almacenada (fuente origen del catálogo). */
  evidenciaPrev?: Evidencia | null;
}

export interface ComercioLookup {
  candidatosPorTexto(textoNormalizado: string): Promise<ComercioCandidato[]>;
}

export interface CapaComercio {
  evaluar(texto: string | null | undefined): Promise<ResultadoCapa | null>;
}

export function crearCapaComercio(lookup: ComercioLookup): CapaComercio {
  return {
    async evaluar(texto) {
      const target = normalize(texto);
      if (!target) return null;
      if (target.replace(/\s/g, '').length < MIN_TEXT_CHARS) return null;
      const cand = await lookup.candidatosPorTexto(target);
      if (cand.length === 0) return null;

      let mejor: { c: ComercioCandidato; score: number; tipo: 'nombre_exacto' | 'nombre_parcial' } | null =
        null;

      for (const c of cand) {
        if (!c.nombreNormalizado) continue;
        if (target === c.nombreNormalizado) {
          mejor = { c, score: 1, tipo: 'nombre_exacto' };
          break;
        }
        if (target.includes(c.nombreNormalizado) || c.nombreNormalizado.includes(target)) {
          const score =
            Math.min(c.nombreNormalizado.length, target.length) /
            Math.max(c.nombreNormalizado.length, target.length);
          if (!mejor || score > mejor.score) {
            mejor = { c, score, tipo: 'nombre_parcial' };
          }
        }
      }

      if (!mejor) return null;
      if (mejor.tipo === 'nombre_parcial' && mejor.score < MIN_SCORE_PARTIAL) return null;

      // Match exacto con fuentePrev confiable → propagar.
      // Catálogo de comercios = data para afinar, no fuente verdad: solo se propagan
      // categorías cacheadas con fuente declarativa (regex/manual/patrones/bancard).
      // Cache débil (mcc/ia/nombre) se descarta para que la cascada siga.
      const FUENTES_PROPAGABLES = ['regex', 'manual', 'patrones', 'bancard'] as const;
      if (
        mejor.tipo === 'nombre_exacto' &&
        mejor.c.fuentePrev &&
        typeof mejor.c.confianzaPrev === 'number' &&
        (FUENTES_PROPAGABLES as readonly string[]).includes(mejor.c.fuentePrev)
      ) {
        return {
          categoriaId: mejor.c.categoriaId,
          confianza: mejor.c.confianzaPrev,
          fuente: mejor.c.fuentePrev,
          evidencia: {
            ...(mejor.c.evidenciaPrev ?? {}),
            comercio_id: mejor.c.id,
            match_type: 'nombre_exacto',
          },
        };
      }
      if (
        mejor.tipo === 'nombre_exacto' &&
        mejor.c.fuentePrev &&
        !(FUENTES_PROPAGABLES as readonly string[]).includes(mejor.c.fuentePrev)
      ) {
        // Cache débil: descartar match, dejar seguir la cascada (mcc/ia)
        return null;
      }

      return {
        categoriaId: mejor.c.categoriaId,
        confianza: CONFIANZA.nombre,
        fuente: 'nombre',
        evidencia: { comercio_id: mejor.c.id, match_type: mejor.tipo, match_score: mejor.score },
      };
    },
  };
}
