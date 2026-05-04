import type { Evidencia, FuenteCategoria } from '../db/schema/movimientos.js';

export type { Evidencia, FuenteCategoria };

export interface MovimientoInput {
  descripcion?: string | undefined;
  nombreComercio?: string | undefined;
  nombreBancard?: string | undefined;
  mcc?: string | undefined;
  bancardId?: string | undefined;
  codigoComercio?: string | undefined;
  monto?: number | undefined;
  rawInput?: Record<string, unknown> | undefined;
}

export interface ResultadoCapa {
  categoriaId: string;
  confianza: number;
  fuente: FuenteCategoria;
  evidencia: Evidencia;
}

export interface MovimientoCategorizado {
  movimientoId: string;
  categoriaId: string | null;
  fuente: FuenteCategoria | null;
  confianza: number | null;
  requiereRevision: boolean;
  evidencia: Evidencia | null;
}
