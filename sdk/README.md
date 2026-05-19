# @mango/tagger-sdk

Cliente TypeScript/JavaScript para el servicio **tagger** (categorización de movimientos bancarios).

Wrapper tipado sobre la API HTTP. Maneja autenticación, errores tipados, serialización y todos los endpoints.

## Instalación

```bash
pnpm add @mango/tagger-sdk
# o npm install @mango/tagger-sdk
```

Requiere Node ≥ 18 (usa `fetch` nativo).

## Configuración

```ts
import { TaggerClient } from '@mango/tagger-sdk';

const tagger = new TaggerClient({
  // Default: https://tagger.n8negri.xyz (dev server)
  url: process.env.TAGGER_URL,
  apiKey: process.env.TAGGER_API_KEY!,
  // opcional: timeoutMs (default 15000)
});
```

## Uso típico (Mango app)

```ts
// 1. Categorizar
const r = await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - JUAN PEREZ',
  monto: 50000,
  origen: 'usuario_123', // ← REQUERIDO para memoria por-usuario
});
// → { categoria: { slug: 'transferencia' }, fuente: 'regex', confianza: 0.95 }

// 2. Usuario corrige
const cats = await tagger.categorias.listar();
const hogarId = cats.find((c) => c.slug === 'hogar')!.id;

await tagger.movimientos.corregir({
  movimientoId: r.movimientoId,
  categoriaIdNueva: hogarId,
  usuario: 'usuario_123',
});

// 3. Próxima vez ese nombre → hogar (fuente=manual, confianza=1)
const r2 = await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - JUAN PEREZ',
  monto: 75000,
  origen: 'usuario_123',
});
```

**Crítico**: pasar `origen` con el id del usuario. Sin él, la capa de memoria no se evalúa.

## API completa

### `tagger.movimientos.*`

| Método | Endpoint |
|---|---|
| `categorizar(input)` | POST `/categorizar-movimiento` |
| `obtener(id)` | GET `/movimientos/:id` |
| `corregir({movimientoId, categoriaIdNueva, usuario?})` | POST `/movimientos/:id/correccion` |
| `reprocesar(id)` | POST `/movimientos/:id/reprocesar` |
| `importar({rows, batchId?})` | POST `/movimientos/importar` |
| `statusImport()` | GET `/movimientos/importar/status` |

### `tagger.categorias.*`

| Método | Endpoint |
|---|---|
| `listar()` | GET `/categorias` |
| `crear({slug, nombre, descripcion?})` | POST `/categorias` |
| `actualizar(identificador, {nombre?, descripcion?})` | PATCH `/categorias/:identificador` |
| `eliminar(identificador)` | DELETE `/categorias/:identificador` |
| `usage(identificador)` | GET `/categorias/:identificador/usage` |

`identificador` acepta: slug actual, alias antiguo, o UUID.

### `tagger.reglas.*`

| Método | Endpoint |
|---|---|
| `listar({scope?})` | GET `/reglas` |
| `crear({scope, tipo, valor, categoriaSlug, prioridad?})` | POST `/reglas` |
| `actualizar(id, {...})` | PATCH `/reglas/:id` |
| `eliminar(id)` | DELETE `/reglas/:id` |
| `eliminarPorValor(scope, valor)` | DELETE `/reglas?scope=&valor=` |
| `sugerencias({usuario, umbral?})` | GET `/reglas/sugerencias` |
| `sugerenciasGlobales({minUsuarios?, minTotal?})` | GET `/reglas/sugerencias-globales` |

### `tagger.mcc.*`

| Método | Endpoint |
|---|---|
| `listar({categoria?, sinCategoria?})` | GET `/mcc` |
| `crear({codMcc, descripcion, categoriaSlug?, ambiguo?})` | POST `/mcc` |
| `actualizar(codMcc, {...})` | PATCH `/mcc/:cod_mcc` |
| `eliminar(codMcc)` | DELETE `/mcc/:cod_mcc` |

### `tagger.marcas.*`

| Método | Endpoint |
|---|---|
| `listar({categoria?})` | GET `/marcas` |
| `crear({marca, categoriaSlug, descripcion?})` | POST `/marcas` |
| `actualizar(id, {...})` | PATCH `/marcas/:id` |
| `eliminar(id)` | DELETE `/marcas/:id` |

### `tagger.comercios.*`

| Método | Endpoint |
|---|---|
| `listar({categoria?, q?, revOnly?, limit?, offset?})` | GET `/comercios` |
| `actualizar(id, {categoriaSlug?, requiereRevision?})` | PATCH `/comercios/:id` |

### `tagger.catalogo.*`

| Método | Endpoint |
|---|---|
| `importar({rows, correrCascada?})` | POST `/catalogo/importar` |
| `statusImport()` | GET `/catalogo/importar/status` |

### `tagger.testBatch.*`

| Método | Endpoint |
|---|---|
| `iniciar({batchId, source?, limit?, concurrency?, bypassCatalogo?})` | POST `/test-batch/start` |
| `detener(batchId)` | POST `/test-batch/stop` |
| `listar()` | GET `/test-batch/list` |
| `stats(batchId)` | GET `/test-batch/:batch_id/stats` |
| `analisis(batchId, {groundTruth?})` | GET `/test-batch/:batch_id/analisis` |
| `agreement(batchId, {groundTruth?})` | GET `/test-batch/:batch_id/agreement` |
| `agreementMcc(batchId, {...})` | GET `/test-batch/:batch_id/agreement-mcc` |

### `tagger.stats.*`

| Método | Endpoint |
|---|---|
| `pipeline({ventana?})` | GET `/stats/pipeline` |

### Top-level

| Método | Endpoint |
|---|---|
| `health()` | GET `/health/ready` |

## Errores tipados

Todos los errores extienden `TaggerError` (que extiende `Error`):

```ts
import {
  TaggerError,
  ValidationError,     // 400 — datos inválidos
  AuthError,           // 401/403 — API key
  NotFoundError,       // 404 — recurso no existe
  ConflictError,       // 409 — slug duplicado, recurso en uso
  ServerError,         // 5xx
  NetworkError,        // timeout/red
} from '@mango/tagger-sdk';

try {
  await tagger.movimientos.categorizar({ monto: -1 });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error('Body inválido:', err.body);
  } else if (err instanceof AuthError) {
    console.error('API key inválida');
  } else if (err instanceof NotFoundError) {
    // recurso no existe
  } else if (err instanceof NetworkError) {
    // timeout o red caída
  } else {
    throw err;
  }
}
```

Cada error tiene `.status: number` y `.body: unknown` con el payload original del servidor.

## Tipos exportados

Movimientos: `MovimientoInput`, `Movimiento`, `ResultadoCategorizacion`, `CorreccionInput`, `CorreccionResult`, `FuenteCategoria`.
Categorías: `Categoria`, `NuevaCategoria`, `ActualizarCategoria`, `CategoriaUsage`.
Reglas: `Regla`, `NuevaRegla`, `ActualizarRegla`, `TipoRegla`, `SugerenciaRegla`, `SugerenciaGlobal`.
MCC: `Mcc`, `NuevoMcc`, `ActualizarMcc`.
Marcas: `Marca`, `NuevaMarca`, `ActualizarMarca`.
Comercios: `Comercio`, `ActualizarComercio`.
Import: `ImportarMovimientosInput`, `ImportarMovimientosResult`, `ImportarCatalogoInput`, `ImportarCatalogoResult`, `ImportStatus`.
Batch: `IniciarBatchInput`, `BatchRun`, `BatchStats`.
Stats: `StatsPipeline`, `HealthStatus`.

## Desarrollo del SDK

```bash
cd sdk
pnpm install
pnpm build       # tsc → dist/
pnpm typecheck   # tsc --noEmit
```

## Versionado

Semver. Cambios breaking → bump major. Endpoint nuevo → bump minor.

## Server dev

Default URL: `https://tagger.n8negri.xyz`. Configurar `url` opt para apuntar a otro deploy.
