import type { MovimientoInput, ResultadoCapa } from '../domain/types.js';

export interface CapasSincrono {
  catalogo?: {
    evaluar(
      bancardId: string | null | undefined,
      codigoComercio: string | null | undefined,
    ): Promise<ResultadoCapa | null>;
  };
  patrones?: { evaluar(texto: string): Promise<ResultadoCapa | null> };
  mcc: { evaluar(codMcc: string | null | undefined): Promise<ResultadoCapa | null> };
}

export interface ResultadoPipeline {
  resultado: ResultadoCapa | null;
  requiereRevision: boolean;
  requiereIa: boolean;
}

function textoPara(input: MovimientoInput): string {
  return [input.nombreBancard, input.nombreComercio, input.descripcion]
    .filter((v): v is string => Boolean(v))
    .join(' ');
}

export async function ejecutarCascada(
  input: MovimientoInput,
  capas: CapasSincrono,
  opts: { bypassCatalogo?: boolean } = {},
): Promise<ResultadoPipeline> {
  const texto = textoPara(input);

  if (capas.catalogo && !opts.bypassCatalogo) {
    const r0 = await capas.catalogo.evaluar(input.bancardId, input.codigoComercio);
    if (r0) return { resultado: r0, requiereRevision: false, requiereIa: false };
  }

  const rp = texto && capas.patrones ? await capas.patrones.evaluar(texto) : null;
  if (rp) return { resultado: rp, requiereRevision: false, requiereIa: false };

  const r4 = await capas.mcc.evaluar(input.mcc);
  if (r4) return { resultado: r4, requiereRevision: false, requiereIa: false };

  return { resultado: null, requiereRevision: true, requiereIa: true };
}
