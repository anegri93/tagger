import type { MovimientoInput, ResultadoCapa } from '../domain/types.js';

export interface CapasSincrono {
  reglas?: {
    evaluar(input: MovimientoInput, scope: string): Promise<ResultadoCapa | null>;
  };
  catalogo?: {
    evaluar(
      bancardId: string | null | undefined,
      codigoComercio: string | null | undefined,
      nombre?: string | null | undefined,
    ): Promise<ResultadoCapa | null>;
  };
  mcc: {
    evaluar(
      codMcc: string | null | undefined,
      opts?: { ignorarAmbiguo?: boolean },
    ): Promise<ResultadoCapa | null>;
  };
}

export interface ResultadoPipeline {
  resultado: ResultadoCapa | null;
  requiereRevision: boolean;
  requiereIa: boolean;
}

export async function ejecutarCascada(
  input: MovimientoInput,
  capas: CapasSincrono,
  opts: { bypassCatalogo?: boolean; usuario?: string | null } = {},
): Promise<ResultadoPipeline> {
  // Capa 0: reglas user-scope (memoria + patrones personales unificados).
  if (capas.reglas && opts.usuario) {
    const r = await capas.reglas.evaluar(input, `usuario:${opts.usuario}`);
    if (r) return { resultado: r, requiereRevision: false, requiereIa: false };
  }

  // Capa 1: reglas globales (patrones curados).
  if (capas.reglas) {
    const r = await capas.reglas.evaluar(input, 'global');
    if (r) return { resultado: r, requiereRevision: false, requiereIa: false };
  }

  // Capa 2: catálogo (MCC por nombre). Será absorbido por capa MCC en Etapa 3.
  if (capas.catalogo && !opts.bypassCatalogo) {
    const nombre = input.nombreBancard ?? input.nombreComercio ?? null;
    const r = await capas.catalogo.evaluar(input.bancardId, input.codigoComercio, nombre);
    if (r) return { resultado: r, requiereRevision: false, requiereIa: false };
  }

  // Capa 3: MCC directo del input.
  const r = await capas.mcc.evaluar(input.mcc);
  if (r) return { resultado: r, requiereRevision: false, requiereIa: false };

  // Sin match: IA fallback async.
  return { resultado: null, requiereRevision: true, requiereIa: true };
}
