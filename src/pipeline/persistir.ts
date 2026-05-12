import type { MovimientoInput, MovimientoCategorizado, ResultadoCapa } from '../domain/types.js';
import type { ResultadoPipeline } from './categorizar.js';
import { THRESHOLD_REVISION } from '../domain/confianza.js';

export interface MovimientoRepository {
  insertar(data: MovimientoNuevo): Promise<{ id: string }>;
}

export interface MovimientoNuevo {
  descripcion: string | null;
  nombreComercio: string | null;
  nombreBancard: string | null;
  mcc: string | null;
  monto: string | null;
  categoriaPredichaId: string | null;
  fuenteCategoria: ResultadoCapa['fuente'] | null;
  confianza: string | null;
  requiereRevision: boolean;
  rawInput: Record<string, unknown> | null;
  evidencia: ResultadoCapa['evidencia'] | null;
  origen: string;
  batchId: string | null;
  bancardId: string | null;
  codigoComercio: string | null;
  latencyMs: number | null;
}

export async function persistirMovimiento(
  input: MovimientoInput,
  pipeline: ResultadoPipeline,
  repo: MovimientoRepository,
  meta?: { origen?: string; batchId?: string | null; latencyMs?: number | null },
): Promise<MovimientoCategorizado> {
  const r = pipeline.resultado;
  const requiereRevision =
    pipeline.requiereRevision ||
    r?.fuente === 'ia' ||
    (r ? r.confianza < THRESHOLD_REVISION : true);

  const { id } = await repo.insertar({
    descripcion: input.descripcion ?? null,
    nombreComercio: input.nombreComercio ?? null,
    nombreBancard: input.nombreBancard ?? null,
    mcc: input.mcc ?? null,
    monto: input.monto !== undefined ? input.monto.toFixed(2) : null,
    categoriaPredichaId: r?.categoriaId ?? null,
    fuenteCategoria: r?.fuente ?? null,
    confianza: r ? r.confianza.toFixed(2) : null,
    requiereRevision,
    rawInput: input.rawInput ?? null,
    evidencia: r?.evidencia ?? null,
    origen: meta?.origen ?? 'api',
    batchId: meta?.batchId ?? null,
    bancardId: input.bancardId ?? null,
    codigoComercio: input.codigoComercio ?? null,
    latencyMs: meta?.latencyMs ?? null,
  });

  return {
    movimientoId: id,
    categoriaId: r?.categoriaId ?? null,
    fuente: r?.fuente ?? null,
    confianza: r?.confianza ?? null,
    requiereRevision,
    evidencia: r?.evidencia ?? null,
  };
}
