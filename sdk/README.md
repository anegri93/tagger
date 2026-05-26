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
| `listar({limit?, offset?, origen?})` | GET `/movimientos` |
| `obtener(id)` | GET `/movimientos/:id` |
| `corregir({movimientoId, categoriaIdNueva, usuario?, motivo?, aprender?, subcategoriaUsuarioId?})` | POST `/movimientos/:id/correccion` |
| `reprocesar(id)` | POST `/movimientos/:id/reprocesar` |
| `importar({rows, batchId?})` | POST `/movimientos/importar` |
| `statusImport()` | GET `/movimientos/importar/status` |
| `categoriasSugeridas(id, {q?, limit?, offset?, umbral?})` | GET `/movimientos/:id/categorias-sugeridas` |

`MovimientoInput` (`categorizar`):

| Campo | Tipo | Notas |
|---|---|---|
| `monto` | `number` | Requerido |
| `origen` | `string` | **Requerido para memoria por usuario.** Sin esto la capa 0 (user-rules) no se evalúa. |
| `nombreBancard` | `string` | Texto del procesador |
| `nombreComercio` | `string` | Alternativo |
| `descripcion` | `string` | Texto libre. **No es decorativo**: el pipeline lo concatena con los nombres antes de evaluar reglas (ver sección descripción). |
| `mcc` | `string` | Código ISO 18245 (2-4 dígitos) |
| `bancardId`, `codigoComercio` | `string` | Ids internos del procesador |
| `batchId` | `string` | Marca de lote (testing) |
| `bypassCatalogo` | `boolean` | Saltea capa 2 (sólo testing) |
| `categoriaId` | `string` (UUID) | Si presente, salta cascada → guarda como `fuente='manual'` `confianza=1`. |
| `aprender` | `boolean` | Sólo válido con `categoriaId` + `origen`. `true` = persistir regla user-scope. Default `false`. |
| `subcategoriaUsuarioId` | `string` (UUID) | Subcategoría personal del user. Backend resuelve canónica padre y la usa como `categoriaId` efectiva (override silencioso). Mov queda con ambas columnas. |

`MovimientoListado` y `Movimiento` también devuelven `subcategoria_usuario_id` + `subcategoria` poblada (`{id, nombre, slug, emoji, color, canonica_id}`) cuando aplica.

#### Gasto manual con `categoriaId`

Si el usuario YA elige cat al cargar (gasto manual desde app), pasá `categoriaId`. Skip cascada, guarda como `fuente='manual'` `confianza=1`.

```ts
// Manual sin aprender — solo este mov
await tagger.movimientos.categorizar({
  nombreBancard: 'ALMACEN DON JUAN',
  monto: 35000,
  origen: 'user123',
  categoriaId: idSupermercado,
});

// Manual + aprender — próximos "ALMACEN DON JUAN" van directo a supermercado
await tagger.movimientos.categorizar({
  nombreBancard: 'ALMACEN DON JUAN',
  monto: 35000,
  origen: 'user123',
  categoriaId: idSupermercado,
  aprender: true,
});
```

`aprender` sólo aplica cuando hay `categoriaId` + `origen`. Default `false`.

#### Corregir con o sin aprender (`aprender`)

Por default, corregir un movimiento crea una regla user-scope con prioridad 1: las próximas categorizaciones del mismo nombre devuelven la categoría corregida automáticamente. Esto es lo deseado en la mayoría de los casos.

Para **excepciones puntuales** (ej: una estación de servicio cuya categoría habitual es Combustible, pero esta vez compraste algo del shop), pasá `aprender: false`. Sólo se modifica este movimiento; no se crea regla.

```ts
// Caso normal: aprende. Próximos movs con mismo nombre van a Supermercado.
await tagger.movimientos.corregir({
  movimientoId,
  categoriaIdNueva: idSupermercado,
  usuario: 'user123',
}); // aprender: true por default

// Excepción única: sólo este mov pasa a Supermercado. Próximos siguen en Combustible.
await tagger.movimientos.corregir({
  movimientoId,
  categoriaIdNueva: idSupermercado,
  usuario: 'user123',
  aprender: false,
});
```

El registro `correcciones_usuario` (audit) se inserta siempre, así que la sugerencia cross-user via `tagger.reglas.sugerenciasGlobales()` sigue captando consensos aunque varios usuarios marquen `aprender: false`.

#### Sobre `descripcion` y categorización contextual

El pipeline tagger concatena `nombreBancard + nombreComercio + descripcion` antes de evaluar reglas. **La descripción no es decorativa: cambia el resultado.**

```ts
// Sin descripción: cae a regex global → transferencia
await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - ALDO NEGRI',
  monto: 1_000_000,
  origen: 'user123',
});
// → { fuente: 'regex', categoria: { slug: 'transferencia' } }

// Con descripción contextual: regla 'contiene alquiler' gana
await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - ALDO NEGRI',
  descripcion: 'transferir un millón a aldo por alquiler',
  monto: 1_000_000,
  origen: 'user123',
});
// → { fuente: 'contiene', categoria: { slug: 'hogar' } }
```

Pasá siempre `descripcion` cuando tu app la tenga (concepto libre, asunto de la transferencia, dictado por voz, leyenda).

#### `categoriasSugeridas` — alternativas por similitud trigram

Devuelve top-K categorías similares al texto. Útil para chip "¿quisiste decir X?":

```ts
const sug = await tagger.movimientos.categoriasSugeridas(movId, {
  q: 'transferencia de un millón a aldo por alquiler',
  limit: 5,
});
// → items: [
//     { slug: 'transferencia', similitud: 0.23 },
//     { slug: 'inmobiliaria',  similitud: 0.12 },  // captó "alquiler"
//     ...
//   ]
```

### `tagger.categorias.*`

| Método | Endpoint |
|---|---|
| `listar()` | GET `/categorias` |
| `crear({slug, nombre, descripcion?})` | POST `/categorias` |
| `actualizar(identificador, {nombre?, descripcion?})` | PATCH `/categorias/:identificador` |
| `eliminar(identificador)` | DELETE `/categorias/:identificador` |
| `usage(identificador)` | GET `/categorias/:identificador/usage` |
| `similares(identificador, {q?, limit?, offset?, umbral?})` | GET `/categorias/:identificador/similares` |

`identificador` acepta: slug actual, alias antiguo, o UUID.

#### `similares` — categorías parecidas por trigram

```ts
const sim = await tagger.categorias.similares('hogar', { limit: 3 });
// → items: [
//     { slug: 'construccion', similitud: 0.20 },
//     { slug: 'belleza',      similitud: 0.16 },
//     { slug: 'floreria',     similitud: 0.15 },
//   ]
```

### `tagger.categoriasUsuario.*`

Subcategorías personales del usuario, ancladas siempre a un rubro canónico.

| Método | Endpoint |
|---|---|
| `listar(usuario)` | GET `/categorias-usuario?usuario=X` |
| `crear({usuario, canonicaId, nombre, slug?, emoji?, color?})` | POST `/categorias-usuario` |
| `actualizar(id, {nombre?, emoji?, color?, activo?})` | PATCH `/categorias-usuario/:id` |
| `eliminar(id)` | DELETE `/categorias-usuario/:id` |

**Modelo en una línea**: el user crea cats personales con su propio nombre/emoji (ej "Streaming") pero internamente quedan ancladas a una canónica curada por Mango (rubro: "Entretenimiento"). Reports internos siguen agrupando por canónica — cero fragmentación.

```ts
// 1. Crear subcat.
const streaming = await tagger.categoriasUsuario.crear({
  usuario: 'demo',
  canonicaId: idEntretenimiento, // tagger.categorias.listar() → rubro padre
  nombre: 'Streaming',
  emoji: '🎬',
});

// 2. Categorizar mov con subcat. Backend resuelve canon padre.
await tagger.movimientos.categorizar({
  nombreComercio: 'NETFLIX',
  monto: 50000,
  origen: 'demo',
  subcategoriaUsuarioId: streaming.id,
});
// Mov queda con:
//   categoria_id = canonica (Entretenimiento)
//   subcategoria_usuario_id = streaming
```

**Corregir un mov a subcat**:

```ts
await tagger.movimientos.corregir({
  movimientoId,
  categoriaIdNueva: idEntretenimiento, // canon (backend override si difiere)
  usuario: 'demo',
  subcategoriaUsuarioId: streaming.id,
  aprender: true, // regla apuntará a canon, V1
});
```

**Validaciones backend** (errores 400/409/429):
- `canonica_inactiva` — canónica padre inactiva o reemplazada.
- `nombre_igual_canonica` — nombre coincide con la canónica padre.
- `slug_duplicado` (409) — ya existe subcat con ese slug para el user.
- `cap_alcanzado` (429) — > 200 subcats activas.

**Borrar**: hard delete. FK `ON DELETE SET NULL` en movs — preservan canónica padre, no pierden historial. Alternativa: `actualizar(id, { activo: false })` para hide sin borrar.

**Listado de movs**: cada item incluye `subcategoria` poblada (`{id, nombre, emoji, color, canonica_id}`) cuando aplica. Render: si hay subcat, mostrar su nombre + emoji con tooltip al rubro canónico.

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

### `tagger.descripciones.*`

| Método | Endpoint |
|---|---|
| `sugerir({usuario, q, limit?, categoriaId?})` | GET `/descripciones/sugerencias` |
| `sugerirFull({usuario, q, limit?, categoriaId?})` | GET `/descripciones/sugerencias` (full response) |

#### Autocomplete per-user de descripciones

Cuando el user tipea la descripción de una transferencia, sugiere descripciones
que escribió antes. Lookup btree prefix, scope estricto per-user.

```ts
const items = await tagger.descripciones.sugerir({
  usuario: 'user_123',
  q: 'alq',
  limit: 5,
});
// → [
//     { descripcion: 'alquiler', freq: 8, categoriaSlug: 'hogar' },
//     { descripcion: 'alquiler departamento', freq: 5, categoriaSlug: 'hogar' }
//   ]
```

Recomendaciones cliente:
- **Debounce 150ms** en cada `input` event.
- **Min 2 chars** en `q` (el server valida y rechaza con 400 si menos).
- **AbortController** para cancelar el request previo al tipear nueva tecla.
- Mostrar con `<datalist>` (nativo) o dropdown custom.

Cat-aware boost: pasá `categoriaId` para subir el ranking de descripciones cuya
categoría top coincide con la elegida en el form:

```ts
const items = await tagger.descripciones.sugerir({
  usuario: 'user_123',
  q: 'al',
  categoriaId: idHogar,
});
```

Las descripciones se persisten automáticamente cada vez que llamás a
`movimientos.categorizar(...)` con `descripcion` no nula + `origen`. No hay
endpoint de write separado — el sistema aprende del corpus real.

### `tagger.stats.*`

| Método | Endpoint |
|---|---|
| `pipeline({ventana?})` | GET `/stats/pipeline` |

`ventana` acepta `'1h' | '24h' | '7d' | '30d' | 'all'` (default `'24h'`). Devuelve distribución por capa pipeline + agreement IA + latencias p50/p95/p99.

### `tagger.presupuestos.*`

Topes mensuales por categoría (canónica). Versionados: editar = INSERT nueva versión `vigente_desde`. Baja = monto 0 (preserva histórico para reportes pasados).

| Método | Endpoint |
|---|---|
| `listar({usuario})` | GET `/presupuestos` |
| `crear({usuario, categoria_id, monto_mensual})` | POST `/presupuestos` |
| `actualizar(id, monto_mensual)` | PATCH `/presupuestos/:id` |
| `eliminar(id)` | DELETE `/presupuestos/:id` |
| `estado({usuario, mes?})` | GET `/presupuestos/estado` |

```ts
// Crear presupuesto Alimentación 1.500.000/mes
await tagger.presupuestos.crear({
  usuario: 'demo',
  categoria_id: idAlimentacion,
  monto_mensual: 1_500_000,
});

// Estado del mes actual (default) o un mes específico
const e = await tagger.presupuestos.estado({ usuario: 'demo', mes: '2026-05' });
// → { items: [{ categoria_id, categoria_slug, categoria_nombre, presupuesto, gastado, restante, pct, movs }, ...] }
```

`actualizar` mantiene la cat + usuario originales, sólo cambia el tope. `eliminar` no borra fila — inserta versión con monto=0 para preservar historial pasado.

V1: presupuestos sólo a nivel canónico. Subcats personales no se pueden presupuestar individualmente (V2).

### `tagger.chat.*`

Chat IA contextual con movimientos del usuario. Proxy a OpenRouter (modelos free, fallback chain). Backend monta prompt con resumen de movs + historial conversacional.

| Método | Endpoint |
|---|---|
| `preguntar({messages, movs, usuario})` | POST `/chat` |

```ts
const r = await tagger.chat.preguntar({
  messages: [{ role: 'user', content: '¿En qué gasté este mes?' }],
  movs: ultimosMovs.map((m) => ({
    id: String(m.id),
    nombre: m.t,
    monto: m.amt,
    fecha: m.date,
    categoria: m.cat ?? null,
  })),
  usuario: 'demo',
});
// → { text: '...' }
```

Backend desabilita anonimización por default. Si `OPENROUTER_API_KEY` no está seteado en server, devuelve 503.

### `tagger.categoriasUsuario.*` ya documentada arriba

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
Descripciones: `SugerenciaDescripcionInput`, `SugerenciaDescripcion`, `SugerenciasDescripcionResult`.

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
