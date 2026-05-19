// Tipos compartidos con el backend tagger. Mantener en sync manualmente.

export type FuenteCategoria =
  | 'literal'
  | 'contiene'
  | 'regex'
  | 'mcc'
  | 'mcc_nombre'
  | 'mcc_ambiguo'
  | 'manual'
  | 'ia'
  | 'pendiente_ia';

export type TipoRegla = 'literal' | 'contiene' | 'regex';

// =========================================================================
// Categorias
// =========================================================================

export interface Categoria {
  id: string;
  slug: string;
  nombre: string;
  descripcion?: string | null;
}

export interface CategoriaUsage {
  movimientos: number;
  mcc: number;
  comercios: number;
}

export interface NuevaCategoria {
  slug: string;
  nombre: string;
  descripcion?: string;
}

export interface ActualizarCategoria {
  nombre?: string;
  descripcion?: string | null;
}

// =========================================================================
// Movimientos
// =========================================================================

export interface MovimientoInput {
  descripcion?: string;
  nombreComercio?: string;
  nombreBancard?: string;
  mcc?: string;
  bancardId?: string;
  codigoComercio?: string;
  monto: number;
  /**
   * Id del usuario final. CRÍTICO: sin este campo la memoria por-usuario
   * (capa 0) no se evalúa y todas las correcciones se ignoran.
   */
  origen?: string;
  batchId?: string;
  bypassCatalogo?: boolean;
}

export interface ResultadoCategorizacion {
  movimientoId: string;
  categoriaId: string | null;
  categoria: Categoria | null;
  fuente: FuenteCategoria | null;
  confianza: number | null;
  requiereRevision: boolean;
}

export interface Movimiento {
  id: string;
  descripcion: string | null;
  nombre_bancard: string | null;
  nombre_comercio: string | null;
  monto: string;
  mcc: string | null;
  bancard_id: string | null;
  codigo_comercio: string | null;
  categoria_predicha_id: string | null;
  categoria_predicha: Categoria | null;
  categoria_confirmada_id: string | null;
  categoria_confirmada: Categoria | null;
  fuente_categoria: FuenteCategoria | null;
  confianza: number | null;
  requiere_revision: boolean;
  latency_ms: number | null;
  origen: string | null;
  batch_id: string | null;
  evidencia: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CorreccionInput {
  movimientoId: string;
  categoriaIdNueva: string;
  usuario?: string;
  motivo?: string;
}

export interface CorreccionResult {
  correccionId: string;
  categoriaAnterior: Categoria | null;
  categoriaNueva: Categoria;
}

export interface ImportarMovimientosInput {
  rows: Array<{ nombre: string; mcc?: string; monto?: string | number }>;
  batchId?: string;
}

export interface ImportarMovimientosResult {
  importId: string;
  batchId?: string | null;
}

export interface ImportStatus {
  run: {
    estado: 'running' | 'done' | 'error';
    error: string | null;
    stats: {
      total: number;
      procesados: number;
      ok: number;
      con_categoria: number;
      sin_categoria: number;
      insertados?: number;
      actualizados?: number;
      errores: number;
      ultimo_error: string | null;
      por_fuente?: Record<string, number>;
    };
  } | null;
}

// =========================================================================
// Reglas
// =========================================================================

export interface Regla {
  id: string;
  scope: string;
  tipo: TipoRegla;
  valor: string;
  valor_normalizado: string;
  categoria_id: string;
  categoria_slug: string;
  prioridad: number;
  activo: boolean;
  hits: number;
  origen: string | null;
  descripcion: string | null;
}

export interface NuevaRegla {
  scope: string;
  tipo: TipoRegla;
  valor: string;
  categoriaSlug: string;
  prioridad?: number;
  descripcion?: string;
  origen?: string;
}

export interface ActualizarRegla {
  tipo?: TipoRegla;
  valor?: string;
  categoriaSlug?: string;
  prioridad?: number;
  activo?: boolean;
  descripcion?: string | null;
}

export interface SugerenciaRegla {
  valor_normalizado: string;
  categoria_slug: string;
  count: number;
  ejemplos: string[];
}

export interface SugerenciaGlobal {
  valorNormalizado: string;
  categoriaSlug: string;
  usuariosDistintos: number;
  totalCorrecciones: number;
  ejemplos: string[];
}

// =========================================================================
// MCC
// =========================================================================

export interface Mcc {
  codMcc: string;
  descripcion: string;
  categoriaId: string | null;
  categoriaSlug: string | null;
  ambiguo: boolean;
}

export interface NuevoMcc {
  codMcc: string;
  descripcion: string;
  categoriaSlug?: string;
  ambiguo?: boolean;
}

export interface ActualizarMcc {
  descripcion?: string;
  categoriaSlug?: string | null;
  ambiguo?: boolean;
}

// =========================================================================
// Marcas
// =========================================================================

export interface Marca {
  id: string;
  marca: string;
  categoria_id: string;
  categoria_slug: string;
  descripcion: string | null;
}

export interface NuevaMarca {
  marca: string;
  categoriaSlug: string;
  descripcion?: string;
}

export interface ActualizarMarca {
  marca?: string;
  categoriaSlug?: string;
  descripcion?: string | null;
}

// =========================================================================
// Comercios
// =========================================================================

export interface Comercio {
  id: string;
  nombre: string;
  nombreNormalizado: string;
  bancardId: string | null;
  codigoComercio: string | null;
  mcc: string | null;
  categoriaId: string | null;
  categoriaSlug: string | null;
  requiereRevision: boolean;
}

export interface ActualizarComercio {
  categoriaSlug?: string | null;
  requiereRevision?: boolean;
}

// =========================================================================
// Catálogo (mcc_por_nombre)
// =========================================================================

export interface ImportarCatalogoInput {
  rows: Array<{
    nombre: string;
    mcc?: string;
    categoria_slug?: string;
    requiere_revision?: boolean;
  }>;
  correrCascada?: boolean;
}

export interface ImportarCatalogoResult {
  importId: string;
}

// =========================================================================
// Test batch
// =========================================================================

export interface IniciarBatchInput {
  batchId: string;
  files?: string[];
  limit?: number;
  concurrency?: number;
  bypassCatalogo?: boolean;
  source?: 'tsv' | 'catalogo' | 'mcc_por_nombre' | string;
}

export interface BatchRun {
  batchId: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  total: number;
  processed: number;
  ok: number;
  errors: number;
  startedAt: number;
  finishedAt: number | null;
  errorMsg: string | null;
  files: string[];
  limit: number | null;
  concurrency: number;
  bypassCatalogo: boolean;
  source: string;
}

export interface BatchStats {
  batch_id: string;
  modo: 'cascada_pura' | 'con_catalogo' | 'mixto' | 'sin_datos';
  total: number;
  primer_movimiento_at: string | null;
  ultimo_movimiento_at: string | null;
  elapsed_ms: number;
  throughput_rps_total: number;
  fuente: Array<{ fuente: string; count: number; pct: number }>;
  cobertura: {
    sync_ok: number;
    revision: number;
    sin_categoria: number;
    sync_ok_pct: number;
  };
  latencia: {
    min: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
    avg: number | null;
  };
  latencia_histograma: Array<{ bucket: string; count: number }>;
  confianza_buckets: Array<{ bucket: string; count: number }>;
  top_categorias: Array<{ slug: string; nombre: string; count: number }>;
  agreement: {
    match: number;
    mismatch: number;
    sin_catalogo: number;
    sin_prediccion: number;
    pct: number;
  };
  recientes: Array<{
    id: string;
    nombre_bancard: string | null;
    fuente: string | null;
    confianza: number | null;
    categoria_slug: string | null;
    requiere_revision: boolean;
    latency_ms: number | null;
    created_at: string;
  }>;
  mismatches_recientes: Array<{
    nombre_bancard: string | null;
    runtime_fuente: string | null;
    runtime_categoria: string | null;
    catalogo_fuente?: string | null;
    catalogo_categoria: string | null;
  }>;
}

// =========================================================================
// Stats pipeline
// =========================================================================

export interface StatsPipeline {
  ventana: string;
  total: number;
  revisiones_pendientes: number;
  correcciones_aplicadas: number;
  latencia_ms: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  capas: Array<{
    capa: '0_reglas_usuario' | '1_reglas_global' | '2_mcc' | '3_ia' | 'sin_match';
    count: number;
    pct: number;
  }>;
}

// =========================================================================
// Misc
// =========================================================================

export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  ollama: 'ok' | 'down' | 'disabled';
}
