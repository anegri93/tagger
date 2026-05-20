import type {
  ActualizarCategoria,
  ActualizarComercio,
  ActualizarMarca,
  ActualizarMcc,
  ActualizarRegla,
  BatchRun,
  BatchStats,
  Categoria,
  CategoriasSugeridasResult,
  CategoriaUsage,
  Comercio,
  CorreccionInput,
  CorreccionResult,
  HealthStatus,
  IniciarBatchInput,
  ImportarCatalogoInput,
  ImportarCatalogoResult,
  ImportarMovimientosInput,
  ImportarMovimientosResult,
  ImportStatus,
  Marca,
  Mcc,
  Movimiento,
  MovimientoInput,
  NuevaCategoria,
  NuevaMarca,
  NuevaRegla,
  NuevoMcc,
  Regla,
  ResultadoCategorizacion,
  StatsPipeline,
  SugerenciaGlobal,
  SugerenciaRegla,
} from './types.js';
import {
  AuthError,
  ConflictError,
  NetworkError,
  NotFoundError,
  ServerError,
  TaggerError,
  ValidationError,
} from './errors.js';

export interface TaggerClientOptions {
  /** Base URL del servicio tagger. Default: https://tagger.n8negri.xyz */
  url?: string;
  /** API key. Header x-api-key. Requerido. */
  apiKey: string;
  /** Timeout por request en ms. Default 15000. */
  timeoutMs?: number;
  /** fetch implementation override (útil para testing). */
  fetch?: typeof fetch;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const DEFAULT_URL = 'https://tagger.n8negri.xyz';

export class TaggerClient {
  private url: string;
  private apiKey: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  /** Operaciones sobre movimientos. */
  readonly movimientos: ReturnType<typeof movimientosModule>;
  /** CRUD de categorías. */
  readonly categorias: ReturnType<typeof categoriasModule>;
  /** CRUD de reglas + sugerencias. */
  readonly reglas: ReturnType<typeof reglasModule>;
  /** CRUD de MCCs. */
  readonly mcc: ReturnType<typeof mccModule>;
  /** CRUD de marcas conocidas. */
  readonly marcas: ReturnType<typeof marcasModule>;
  /** Listado y reasignación de comercios. */
  readonly comercios: ReturnType<typeof comerciosModule>;
  /** Importar entradas a mcc_por_nombre. */
  readonly catalogo: ReturnType<typeof catalogoModule>;
  /** Tests de pipeline en lote. */
  readonly testBatch: ReturnType<typeof testBatchModule>;
  /** Estadísticas agregadas. */
  readonly stats: ReturnType<typeof statsModule>;

  constructor(opts: TaggerClientOptions) {
    if (!opts.apiKey) throw new Error('apiKey requerido');
    this.url = (opts.url ?? DEFAULT_URL).replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    // En browser, fetch necesita estar bound a `window` o tira "Illegal invocation".
    // En Node fetch global ya es bindeable.
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);

    this.movimientos = movimientosModule(this);
    this.categorias = categoriasModule(this);
    this.reglas = reglasModule(this);
    this.mcc = mccModule(this);
    this.marcas = marcasModule(this);
    this.comercios = comerciosModule(this);
    this.catalogo = catalogoModule(this);
    this.testBatch = testBatchModule(this);
    this.stats = statsModule(this);
  }

  /** Estado del servicio (DB, Ollama). */
  async health(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health/ready');
  }

  // --- internal core (público dentro del paquete) ---

  /** @internal */
  async request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers: {
        'x-api-key': this.apiKey,
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      signal: controller.signal,
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    try {
      const r = await this.fetchImpl(url, init);
      const contentType = r.headers.get('content-type') ?? '';
      const body: unknown = contentType.includes('application/json')
        ? await r.json().catch(() => null)
        : await r.text().catch(() => '');
      if (!r.ok) throw this.errorFor(r.status, body);
      return body as T;
    } catch (err) {
      if (err instanceof TaggerError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new NetworkError(`Timeout tras ${this.timeoutMs}ms en ${path}`);
      }
      throw new NetworkError(err instanceof Error ? err.message : 'Falla de red', err);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string, query?: RequestOpts['query']): string {
    let url = `${this.url}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private errorFor(status: number, body: unknown): TaggerError {
    const msg = this.extractMessage(body) ?? `HTTP ${status}`;
    if (status === 400) return new ValidationError(msg, body);
    if (status === 401 || status === 403) return new AuthError(body);
    if (status === 404) return new NotFoundError(msg, body);
    if (status === 409) return new ConflictError(msg, body);
    if (status >= 500) return new ServerError(msg, status, body);
    return new TaggerError(msg, status, body);
  }

  private extractMessage(body: unknown): string | null {
    if (typeof body === 'object' && body !== null) {
      const b = body as Record<string, unknown>;
      if (typeof b.error === 'string') return b.error;
      if (typeof b.message === 'string') return b.message;
    }
    if (typeof body === 'string' && body.length > 0) return body;
    return null;
  }
}

// =========================================================================
// Módulos
// =========================================================================

function movimientosModule(c: TaggerClient) {
  return {
    /**
     * Categoriza un movimiento aplicando el pipeline: reglas usuario → reglas
     * globales → MCC → IA. Persiste el movimiento.
     *
     * Pasar `origen` con el id del usuario para que la memoria por-usuario
     * (capa 0) se evalúe.
     */
    async categorizar(input: MovimientoInput): Promise<ResultadoCategorizacion> {
      const body: Record<string, unknown> = { monto: input.monto };
      if (input.descripcion !== undefined) body.descripcion = input.descripcion;
      if (input.nombreComercio !== undefined) body.nombre_comercio = input.nombreComercio;
      if (input.nombreBancard !== undefined) body.nombre_bancard = input.nombreBancard;
      if (input.mcc !== undefined) body.mcc = input.mcc;
      if (input.bancardId !== undefined) body.bancard_id = input.bancardId;
      if (input.codigoComercio !== undefined) body.codigo_comercio = input.codigoComercio;
      if (input.origen !== undefined) body.origen = input.origen;
      if (input.batchId !== undefined) body.batch_id = input.batchId;
      if (input.bypassCatalogo !== undefined) body.bypass_catalogo = input.bypassCatalogo;

      const r = await c.request<{
        movimiento_id: string;
        categoria_id: string | null;
        categoria: Categoria | null;
        fuente: ResultadoCategorizacion['fuente'];
        confianza: number | null;
        requiere_revision: boolean;
      }>('/categorizar-movimiento', { method: 'POST', body });

      return {
        movimientoId: r.movimiento_id,
        categoriaId: r.categoria_id,
        categoria: r.categoria,
        fuente: r.fuente,
        confianza: r.confianza,
        requiereRevision: r.requiere_revision,
      };
    },

    /** Lee un movimiento por id. */
    async obtener(id: string): Promise<Movimiento> {
      return c.request<Movimiento>(`/movimientos/${encodeURIComponent(id)}`);
    },

    /**
     * Aplica una corrección manual. Crea automáticamente la regla de memoria
     * por-usuario para que futuras categorizaciones del mismo nombre devuelvan
     * la categoría corregida.
     */
    async corregir(input: CorreccionInput): Promise<CorreccionResult> {
      const body: Record<string, unknown> = { categoria_id_nueva: input.categoriaIdNueva };
      if (input.usuario !== undefined) body.usuario = input.usuario;
      if (input.motivo !== undefined) body.motivo = input.motivo;
      const r = await c.request<{
        correccion_id: string;
        categoria_anterior: Categoria | null;
        categoria_nueva: Categoria;
      }>(`/movimientos/${encodeURIComponent(input.movimientoId)}/correccion`, {
        method: 'POST',
        body,
      });
      return {
        correccionId: r.correccion_id,
        categoriaAnterior: r.categoria_anterior,
        categoriaNueva: r.categoria_nueva,
      };
    },

    /** Re-corre el pipeline sobre un movimiento existente. */
    async reprocesar(id: string): Promise<ResultadoCategorizacion> {
      const r = await c.request<{
        movimiento_id: string;
        categoria_id: string | null;
        categoria: Categoria | null;
        fuente: ResultadoCategorizacion['fuente'];
        confianza: number | null;
        requiere_revision: boolean;
      }>(`/movimientos/${encodeURIComponent(id)}/reprocesar`, { method: 'POST' });
      return {
        movimientoId: r.movimiento_id,
        categoriaId: r.categoria_id,
        categoria: r.categoria,
        fuente: r.fuente,
        confianza: r.confianza,
        requiereRevision: r.requiere_revision,
      };
    },

    /** Importa lote de movimientos (corre cascada por cada uno). */
    async importar(input: ImportarMovimientosInput): Promise<ImportarMovimientosResult> {
      const body: Record<string, unknown> = { rows: input.rows };
      if (input.batchId !== undefined) body.batch_id = input.batchId;
      const r = await c.request<{ import_id: string; batch_id?: string | null }>(
        '/movimientos/importar',
        { method: 'POST', body },
      );
      const out: ImportarMovimientosResult = { importId: r.import_id };
      if (r.batch_id !== undefined) out.batchId = r.batch_id;
      return out;
    },

    /** Estado del último import de movimientos. */
    async statusImport(): Promise<ImportStatus> {
      return c.request<ImportStatus>('/movimientos/importar/status');
    },

    /**
     * Sugiere categorías alternativas para un movimiento usando similitud trigram
     * sobre el texto enriquecido de cada categoría (slug + nombre + descripcion).
     *
     * Útil para mostrar al usuario "¿quisiste decir X?" cuando categoriza un mov
     * cuya descripción tiene contexto (ej "alquiler" en transferencia).
     *
     * Si pasás `q`, se usa ese texto. Si no, se infiere del nombre/descripción
     * del movimiento.
     */
    async categoriasSugeridas(
      id: string,
      opts: { q?: string; limit?: number; offset?: number; umbral?: number } = {},
    ): Promise<CategoriasSugeridasResult> {
      const query: RequestOpts['query'] = {};
      if (opts.q !== undefined) query.q = opts.q;
      if (opts.limit !== undefined) query.limit = opts.limit;
      if (opts.offset !== undefined) query.offset = opts.offset;
      if (opts.umbral !== undefined) query.umbral = opts.umbral;
      return c.request<CategoriasSugeridasResult>(
        `/movimientos/${encodeURIComponent(id)}/categorias-sugeridas`,
        { query },
      );
    },
  };
}

function categoriasModule(c: TaggerClient) {
  return {
    /** Lista categorías activas. */
    async listar(): Promise<Categoria[]> {
      const r = await c.request<{ items: Categoria[] }>('/categorias');
      return r.items;
    },
    async crear(input: NuevaCategoria): Promise<Categoria> {
      return c.request<Categoria>('/categorias', { method: 'POST', body: input });
    },
    /** identificador: slug actual, alias antiguo, o UUID. */
    async actualizar(identificador: string, input: ActualizarCategoria): Promise<Categoria> {
      return c.request<Categoria>(
        `/categorias/${encodeURIComponent(identificador)}`,
        { method: 'PATCH', body: input },
      );
    },
    async eliminar(identificador: string): Promise<void> {
      await c.request(`/categorias/${encodeURIComponent(identificador)}`, { method: 'DELETE' });
    },
    /** Conteo de referencias (movimientos, mcc, comercios). */
    async usage(identificador: string): Promise<CategoriaUsage> {
      return c.request<CategoriaUsage>(
        `/categorias/${encodeURIComponent(identificador)}/usage`,
      );
    },

    /**
     * Lista categorías similares a la dada por similitud trigram sobre
     * (slug + nombre + descripcion). Útil para "ver categorías parecidas".
     *
     * Si pasás `q`, busca por ese texto en lugar del texto de la categoría.
     */
    async similares(
      identificador: string,
      opts: { q?: string; limit?: number; offset?: number; umbral?: number } = {},
    ): Promise<CategoriasSugeridasResult> {
      const query: RequestOpts['query'] = {};
      if (opts.q !== undefined) query.q = opts.q;
      if (opts.limit !== undefined) query.limit = opts.limit;
      if (opts.offset !== undefined) query.offset = opts.offset;
      if (opts.umbral !== undefined) query.umbral = opts.umbral;
      return c.request<CategoriasSugeridasResult>(
        `/categorias/${encodeURIComponent(identificador)}/similares`,
        { query },
      );
    },
  };
}

function reglasModule(c: TaggerClient) {
  return {
    /** scope='global' (default) o 'usuario:<id>'. */
    async listar(opts: { scope?: string } = {}): Promise<Regla[]> {
      const reqOpts: RequestOpts = {};
      if (opts.scope !== undefined) reqOpts.query = { scope: opts.scope };
      const r = await c.request<{ items: Regla[] }>('/reglas', reqOpts);
      return r.items;
    },
    async crear(regla: NuevaRegla): Promise<Regla> {
      const body: Record<string, unknown> = {
        scope: regla.scope,
        tipo: regla.tipo,
        valor: regla.valor,
        categoria_slug: regla.categoriaSlug,
      };
      if (regla.prioridad !== undefined) body.prioridad = regla.prioridad;
      if (regla.descripcion !== undefined) body.descripcion = regla.descripcion;
      if (regla.origen !== undefined) body.origen = regla.origen;
      return c.request<Regla>('/reglas', { method: 'POST', body });
    },
    async actualizar(id: string, input: ActualizarRegla): Promise<Regla> {
      const body: Record<string, unknown> = {};
      if (input.tipo !== undefined) body.tipo = input.tipo;
      if (input.valor !== undefined) body.valor = input.valor;
      if (input.categoriaSlug !== undefined) body.categoria_slug = input.categoriaSlug;
      if (input.prioridad !== undefined) body.prioridad = input.prioridad;
      if (input.activo !== undefined) body.activo = input.activo;
      if (input.descripcion !== undefined) body.descripcion = input.descripcion;
      return c.request<Regla>(`/reglas/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    async eliminar(id: string): Promise<void> {
      await c.request(`/reglas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    /** Elimina por (scope, valor) en lugar de por id. Útil cuando no se tiene el id. */
    async eliminarPorValor(scope: string, valor: string): Promise<void> {
      await c.request('/reglas', { method: 'DELETE', query: { scope, valor } });
    },
    /** Sugerencias de reglas user-scope para un usuario, basadas en sus correcciones. */
    async sugerencias(opts: { usuario: string; umbral?: number }): Promise<SugerenciaRegla[]> {
      const query: RequestOpts['query'] = { usuario: opts.usuario };
      if (opts.umbral !== undefined) query.umbral = opts.umbral;
      const r = await c.request<{ items: SugerenciaRegla[] }>('/reglas/sugerencias', { query });
      return r.items;
    },
    /** Sugerencias cross-user para promover a reglas globales. */
    async sugerenciasGlobales(
      opts: { minUsuarios?: number; minTotal?: number } = {},
    ): Promise<SugerenciaGlobal[]> {
      const query: RequestOpts['query'] = {};
      if (opts.minUsuarios !== undefined) query.min_usuarios = opts.minUsuarios;
      if (opts.minTotal !== undefined) query.min_total = opts.minTotal;
      const r = await c.request<{ sugerencias: SugerenciaGlobal[] }>(
        '/reglas/sugerencias-globales',
        { query },
      );
      return r.sugerencias;
    },
  };
}

function mccModule(c: TaggerClient) {
  return {
    async listar(opts: { categoria?: string; sinCategoria?: boolean } = {}): Promise<Mcc[]> {
      const query: RequestOpts['query'] = {};
      if (opts.categoria !== undefined) query.categoria = opts.categoria;
      if (opts.sinCategoria) query.sin_categoria = 'true';
      const r = await c.request<{ items: Mcc[] }>('/mcc', { query });
      return r.items;
    },
    async crear(input: NuevoMcc): Promise<Mcc> {
      const body: Record<string, unknown> = {
        cod_mcc: input.codMcc,
        descripcion: input.descripcion,
      };
      if (input.categoriaSlug !== undefined) body.categoria_slug = input.categoriaSlug;
      if (input.ambiguo !== undefined) body.ambiguo = input.ambiguo;
      return c.request<Mcc>('/mcc', { method: 'POST', body });
    },
    async actualizar(codMcc: string, input: ActualizarMcc): Promise<Mcc> {
      const body: Record<string, unknown> = {};
      if (input.descripcion !== undefined) body.descripcion = input.descripcion;
      if (input.categoriaSlug !== undefined) body.categoria_slug = input.categoriaSlug;
      if (input.ambiguo !== undefined) body.ambiguo = input.ambiguo;
      return c.request<Mcc>(`/mcc/${encodeURIComponent(codMcc)}`, { method: 'PATCH', body });
    },
    async eliminar(codMcc: string): Promise<void> {
      await c.request(`/mcc/${encodeURIComponent(codMcc)}`, { method: 'DELETE' });
    },
  };
}

function marcasModule(c: TaggerClient) {
  return {
    async listar(opts: { categoria?: string } = {}): Promise<Marca[]> {
      const reqOpts: RequestOpts = {};
      if (opts.categoria !== undefined) reqOpts.query = { categoria: opts.categoria };
      const r = await c.request<{ items: Marca[] }>('/marcas', reqOpts);
      return r.items;
    },
    async crear(input: NuevaMarca): Promise<Marca> {
      const body: Record<string, unknown> = {
        marca: input.marca,
        categoria_slug: input.categoriaSlug,
      };
      if (input.descripcion !== undefined) body.descripcion = input.descripcion;
      return c.request<Marca>('/marcas', { method: 'POST', body });
    },
    async actualizar(id: string, input: ActualizarMarca): Promise<Marca> {
      const body: Record<string, unknown> = {};
      if (input.marca !== undefined) body.marca = input.marca;
      if (input.categoriaSlug !== undefined) body.categoria_slug = input.categoriaSlug;
      if (input.descripcion !== undefined) body.descripcion = input.descripcion;
      return c.request<Marca>(`/marcas/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    async eliminar(id: string): Promise<void> {
      await c.request(`/marcas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

function comerciosModule(c: TaggerClient) {
  return {
    async listar(
      opts: {
        categoria?: string;
        q?: string;
        revOnly?: boolean;
        limit?: number;
        offset?: number;
      } = {},
    ): Promise<{ items: Comercio[]; total: number }> {
      const query: RequestOpts['query'] = {};
      if (opts.categoria !== undefined) query.categoria = opts.categoria;
      if (opts.q !== undefined) query.q = opts.q;
      if (opts.revOnly !== undefined) query.rev_only = opts.revOnly;
      if (opts.limit !== undefined) query.limit = opts.limit;
      if (opts.offset !== undefined) query.offset = opts.offset;
      return c.request<{ items: Comercio[]; total: number }>('/comercios', { query });
    },
    async actualizar(id: string, input: ActualizarComercio): Promise<Comercio> {
      const body: Record<string, unknown> = {};
      if (input.categoriaSlug !== undefined) body.categoria_slug = input.categoriaSlug;
      if (input.requiereRevision !== undefined) body.requiere_revision = input.requiereRevision;
      return c.request<Comercio>(`/comercios/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
      });
    },
  };
}

function catalogoModule(c: TaggerClient) {
  return {
    /** Importa entradas a la tabla mcc_por_nombre (capa 2 del pipeline). */
    async importar(input: ImportarCatalogoInput): Promise<ImportarCatalogoResult> {
      const body: Record<string, unknown> = { rows: input.rows };
      if (input.correrCascada !== undefined) body.correr_cascada = input.correrCascada;
      const r = await c.request<{ import_id: string }>('/catalogo/importar', {
        method: 'POST',
        body,
      });
      return { importId: r.import_id };
    },
    async statusImport(): Promise<ImportStatus> {
      return c.request<ImportStatus>('/catalogo/importar/status');
    },
  };
}

function testBatchModule(c: TaggerClient) {
  return {
    async iniciar(input: IniciarBatchInput): Promise<{ ok: boolean; batch: BatchRun }> {
      const body: Record<string, unknown> = { batch_id: input.batchId };
      if (input.files !== undefined) body.files = input.files;
      if (input.limit !== undefined) body.limit = input.limit;
      if (input.concurrency !== undefined) body.concurrency = input.concurrency;
      if (input.bypassCatalogo !== undefined) body.bypass_catalogo = input.bypassCatalogo;
      if (input.source !== undefined) body.source = input.source;
      return c.request<{ ok: boolean; batch: BatchRun }>('/test-batch/start', {
        method: 'POST',
        body,
      });
    },
    async detener(batchId: string): Promise<{ ok: boolean; batch_id: string }> {
      return c.request('/test-batch/stop', {
        method: 'POST',
        body: { batch_id: batchId },
      });
    },
    async listar(): Promise<BatchRun[]> {
      const r = await c.request<{ items: BatchRun[] }>('/test-batch/list');
      return r.items;
    },
    async stats(batchId: string): Promise<BatchStats> {
      return c.request<BatchStats>(`/test-batch/${encodeURIComponent(batchId)}/stats`);
    },
    async analisis(batchId: string, opts: { groundTruth?: string } = {}): Promise<unknown> {
      const reqOpts: RequestOpts = {};
      if (opts.groundTruth !== undefined) reqOpts.query = { ground_truth: opts.groundTruth };
      return c.request(`/test-batch/${encodeURIComponent(batchId)}/analisis`, reqOpts);
    },
    async agreement(batchId: string, opts: { groundTruth?: string } = {}): Promise<unknown> {
      const reqOpts: RequestOpts = {};
      if (opts.groundTruth !== undefined) reqOpts.query = { ground_truth: opts.groundTruth };
      return c.request(`/test-batch/${encodeURIComponent(batchId)}/agreement`, reqOpts);
    },
    async agreementMcc(
      batchId: string,
      opts: { groundTruth?: string; includeAmbiguo?: boolean; includeGeneric?: boolean } = {},
    ): Promise<unknown> {
      const query: RequestOpts['query'] = {};
      if (opts.groundTruth !== undefined) query.ground_truth = opts.groundTruth;
      if (opts.includeAmbiguo !== undefined) query.include_ambiguo = String(opts.includeAmbiguo);
      if (opts.includeGeneric !== undefined) query.include_generic = String(opts.includeGeneric);
      return c.request(`/test-batch/${encodeURIComponent(batchId)}/agreement-mcc`, { query });
    },
  };
}

function statsModule(c: TaggerClient) {
  return {
    /** Distribución por capa del pipeline sobre una ventana temporal. */
    async pipeline(opts: { ventana?: '1h' | '24h' | '7d' | '30d' | 'all' | string } = {}): Promise<
      StatsPipeline
    > {
      const reqOpts: RequestOpts = {};
      if (opts.ventana !== undefined) reqOpts.query = { ventana: opts.ventana };
      return c.request<StatsPipeline>('/stats/pipeline', reqOpts);
    },
  };
}
