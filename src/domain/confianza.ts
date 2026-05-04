import type { FuenteCategoria } from './types.js';

export const CONFIANZA = Object.freeze({
  regex: 0.95,
  bancard: 0.9,
  nombre: 0.8,
  mcc: 0.75,
  ia_max: 0.7,
  manual: 1.0,
} as const);

export const THRESHOLD_REVISION = 0.7;

export function confianzaPorFuente(fuente: FuenteCategoria): number {
  switch (fuente) {
    case 'regex':
      return CONFIANZA.regex;
    case 'bancard':
      return CONFIANZA.bancard;
    case 'nombre':
      return CONFIANZA.nombre;
    case 'mcc':
      return CONFIANZA.mcc;
    case 'ia':
      return CONFIANZA.ia_max;
    case 'manual':
      return CONFIANZA.manual;
  }
}

export function requiereRevision(confianza: number): boolean {
  return confianza < THRESHOLD_REVISION;
}
