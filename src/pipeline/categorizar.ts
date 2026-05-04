import type { MovimientoInput, ResultadoCapa } from '../domain/types.js';

export interface CapasSincrono {
  catalogo?: {
    evaluar(
      bancardId: string | null | undefined,
      codigoComercio: string | null | undefined,
    ): Promise<ResultadoCapa | null>;
  };
  regex: { evaluar(texto: string): Promise<ResultadoCapa | null> };
  bancard: { evaluar(nombreBancard: string | null | undefined): Promise<ResultadoCapa | null> };
  comercio: { evaluar(texto: string | null | undefined): Promise<ResultadoCapa | null> };
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

  const r1 = texto ? await capas.regex.evaluar(texto) : null;
  if (r1) return { resultado: r1, requiereRevision: false, requiereIa: false };

  const r2 = await capas.bancard.evaluar(input.nombreBancard);
  if (r2) return { resultado: r2, requiereRevision: false, requiereIa: false };

  const r3 = texto ? await capas.comercio.evaluar(texto) : null;
  if (r3) return { resultado: r3, requiereRevision: false, requiereIa: false };

  const r4 = await capas.mcc.evaluar(input.mcc);
  if (r4) return { resultado: r4, requiereRevision: false, requiereIa: false };

  return { resultado: null, requiereRevision: true, requiereIa: true };
}
