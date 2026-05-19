import type { MovimientoInput, ResultadoCapa } from '../domain/types.js';

export interface CapasSincrono {
  reglas?: {
    evaluar(input: MovimientoInput, scope: string): Promise<ResultadoCapa | null>;
  };
  mcc: {
    evaluar(input: MovimientoInput, opts?: { ignorarAmbiguo?: boolean }): Promise<ResultadoCapa | null>;
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
  // Capa 0: reglas user-scope (memoria + reglas personales unificadas).
  if (capas.reglas && opts.usuario) {
    const r = await capas.reglas.evaluar(input, `usuario:${opts.usuario}`);
    if (r) return { resultado: r, requiereRevision: false, requiereIa: false };
  }

  // Capa 1: reglas globales (patrones curados).
  if (capas.reglas) {
    const r = await capas.reglas.evaluar(input, 'global');
    if (r) return { resultado: r, requiereRevision: false, requiereIa: false };
  }

  // Capa 2: MCC inteligente — MCC directo del input o inferido por nombre vía mcc_por_nombre.
  // bypassCatalogo desactiva el fallback por nombre (sirve para testing del resto del pipeline).
  const r = await capas.mcc.evaluar(input, opts.bypassCatalogo ? { ignorarAmbiguo: false } : undefined);
  if (r) {
    if (opts.bypassCatalogo && r.evidencia?.mcc_inferido_por_nombre) {
      // bypass activo: ignorar hits por nombre, dejar pasar a IA.
    } else {
      return { resultado: r, requiereRevision: false, requiereIa: false };
    }
  }

  return { resultado: null, requiereRevision: true, requiereIa: true };
}
