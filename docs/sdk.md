# SDK JavaScript / TypeScript

Cliente oficial para el servicio **tagger**. Tipado, manejo de errores y autenticación. Paquete en `sdk/` dentro del repo.

## Instalación

```bash
pnpm add @mango/tagger-sdk
```

Requiere Node ≥ 18.

## Quick start

```ts
import { TaggerClient } from '@mango/tagger-sdk';

const tagger = new TaggerClient({
  url: process.env.TAGGER_URL,            // default: https://tagger.n8negri.xyz
  apiKey: process.env.TAGGER_API_KEY!,
  timeoutMs: 15000,                       // opcional
});

const r = await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - JUAN PEREZ',
  monto: 50000,
  origen: 'usuario_123',                  // ← REQUERIDO para memoria por-usuario
});
// → { categoria: { slug: 'transferencia' }, fuente: 'regex', confianza: 0.95 }
```

## Memoria por usuario

Si el usuario corrige una categorización, el SDK crea automáticamente una regla de memoria. La próxima vez que llegue el mismo nombre, devuelve la categoría aprendida con `fuente='manual'` y `confianza=1`.

```ts
// 1. Primera categorización
const r = await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - JUAN PEREZ',
  monto: 50000,
  origen: 'usuario_123',
});  // → transferencia

// 2. Usuario corrige a Hogar
const cats = await tagger.categorias.listar();
const hogarId = cats.find((c) => c.slug === 'hogar')!.id;

await tagger.movimientos.corregir({
  movimientoId: r.movimientoId,
  categoriaIdNueva: hogarId,
  usuario: 'usuario_123',
});

// 3. Mismo nombre futuro → hogar (memoria aplicada)
const r2 = await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - JUAN PEREZ',
  monto: 75000,
  origen: 'usuario_123',
});
// → { categoria: { slug: 'hogar' }, fuente: 'manual', confianza: 1 }
```

⚠️ Sin `origen` la capa 0 (memoria) NO se evalúa. Siempre pasarlo.

## Estructura modular

| Módulo | Propósito |
|---|---|
| `tagger.movimientos` | Categorizar, corregir, reprocesar, importar |
| `tagger.categorias` | CRUD de categorías |
| `tagger.reglas` | CRUD reglas + sugerencias por usuario / cross-user |
| `tagger.mcc` | CRUD del catálogo MCC ISO 18245 |
| `tagger.marcas` | CRUD marcas conocidas |
| `tagger.comercios` | Listado + reasignación |
| `tagger.catalogo` | Importar `mcc_por_nombre` (capa 2) |
| `tagger.testBatch` | Tests de pipeline en lote |
| `tagger.stats` | Distribución por capa del pipeline |
| `tagger.health()` | Status servicio |

## Referencia: `movimientos`

```ts
tagger.movimientos.categorizar(input): Promise<ResultadoCategorizacion>
tagger.movimientos.obtener(id): Promise<Movimiento>
tagger.movimientos.corregir({movimientoId, categoriaIdNueva, usuario?, motivo?}): Promise<CorreccionResult>
tagger.movimientos.reprocesar(id): Promise<ResultadoCategorizacion>
tagger.movimientos.importar({rows, batchId?}): Promise<ImportarMovimientosResult>
tagger.movimientos.statusImport(): Promise<ImportStatus>
```

`MovimientoInput`:

| Campo | Tipo | Nota |
|---|---|---|
| `monto` | number | Requerido |
| `origen` | string | **Pasar siempre**: id del usuario |
| `nombreBancard` | string | Nombre desde el procesador |
| `nombreComercio` | string | Alternativo |
| `descripcion` | string | Texto libre |
| `mcc` | string | Código ISO 18245 (4 dígitos) |
| `bancardId`, `codigoComercio` | string | Ids internos |
| `batchId` | string | Marca de lote (testing) |
| `bypassCatalogo` | boolean | Saltea capa 2 (sólo testing) |

## Referencia: `categorias`

```ts
tagger.categorias.listar(): Promise<Categoria[]>
tagger.categorias.crear({slug, nombre, descripcion?}): Promise<Categoria>
tagger.categorias.actualizar(identificador, {nombre?, descripcion?}): Promise<Categoria>
tagger.categorias.eliminar(identificador): Promise<void>
tagger.categorias.usage(identificador): Promise<{movimientos, mcc, comercios}>
```

`identificador` acepta:
- slug actual (`'restaurante'`)
- alias antiguo si la categoría fue renombrada
- UUID

## Referencia: `reglas`

```ts
tagger.reglas.listar({scope?}): Promise<Regla[]>                  // scope: 'global' | 'usuario:<id>'
tagger.reglas.crear({scope, tipo, valor, categoriaSlug, prioridad?, descripcion?, origen?}): Promise<Regla>
tagger.reglas.actualizar(id, {...}): Promise<Regla>
tagger.reglas.eliminar(id): Promise<void>
tagger.reglas.eliminarPorValor(scope, valor): Promise<void>
tagger.reglas.sugerencias({usuario, umbral?}): Promise<SugerenciaRegla[]>
tagger.reglas.sugerenciasGlobales({minUsuarios?, minTotal?}): Promise<SugerenciaGlobal[]>
```

`tipo` de regla: `'literal'` (match exacto), `'contiene'` (substring), `'regex'`.

## Referencia: `mcc`, `marcas`, `comercios`

```ts
tagger.mcc.listar({categoria?, sinCategoria?}): Promise<Mcc[]>
tagger.mcc.crear({codMcc, descripcion, categoriaSlug?, ambiguo?}): Promise<Mcc>
tagger.mcc.actualizar(codMcc, {...}): Promise<Mcc>
tagger.mcc.eliminar(codMcc): Promise<void>

tagger.marcas.listar({categoria?}): Promise<Marca[]>
tagger.marcas.crear({marca, categoriaSlug, descripcion?}): Promise<Marca>
tagger.marcas.actualizar(id, {...}): Promise<Marca>
tagger.marcas.eliminar(id): Promise<void>

tagger.comercios.listar({categoria?, q?, revOnly?, limit?, offset?}): Promise<{items, total}>
tagger.comercios.actualizar(id, {categoriaSlug?, requiereRevision?}): Promise<Comercio>
```

## Referencia: `testBatch`, `stats`

```ts
tagger.testBatch.iniciar({batchId, source?, limit?, concurrency?, bypassCatalogo?}): Promise<{ok, batch}>
tagger.testBatch.detener(batchId): Promise<{ok, batch_id}>
tagger.testBatch.listar(): Promise<BatchRun[]>
tagger.testBatch.stats(batchId): Promise<BatchStats>
tagger.testBatch.analisis(batchId, {groundTruth?}): Promise<unknown>
tagger.testBatch.agreement(batchId, {groundTruth?}): Promise<unknown>
tagger.testBatch.agreementMcc(batchId, {...}): Promise<unknown>

tagger.stats.pipeline({ventana?: '1h'|'24h'|'7d'|'30d'|'all'}): Promise<StatsPipeline>
```

## Errores tipados

Todos extienden `TaggerError`:

```ts
import {
  TaggerError,        // base
  ValidationError,    // 400 — datos inválidos
  AuthError,          // 401/403 — API key
  NotFoundError,      // 404 — recurso no existe
  ConflictError,      // 409 — slug duplicado, ref en uso
  ServerError,        // 5xx
  NetworkError,       // timeout / red caída
} from '@mango/tagger-sdk';

try {
  await tagger.movimientos.categorizar({ monto: -1 });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error('Datos inválidos:', err.body);
  } else if (err instanceof NotFoundError) {
    // recurso no encontrado
  } else if (err instanceof NetworkError) {
    // timeout o red caída
  } else {
    throw err;
  }
}
```

Cada error expone:
- `.status: number` — código HTTP
- `.body: unknown` — payload original del servidor (útil para debug)
- `.message: string`

## Validar SDK + backend

Script smoke ejerce todos los módulos contra un server real:

```bash
cd sdk
pnpm install
pnpm build
API_KEY=xxx pnpm smoke
# o contra local:
TAGGER_URL=http://localhost:3000 API_KEY=xxx pnpm smoke
```

27 checks. Útil después de un deploy para verificar que nada se rompió.

## Build & dev

```bash
cd sdk
pnpm install
pnpm build         # tsc → dist/
pnpm typecheck     # tsc --noEmit
```

## Versionado

Semver. Cada vez que se agrega un endpoint nuevo o se cambia uno existente, bump del SDK. Si la API rompe contrato, bump major.

## Configuración del servidor

Default URL: `https://tagger.n8negri.xyz` (dev). Para apuntar a otro deploy pasar `url` al constructor.

API key se obtiene del backend (`API_KEY` env var). En producción cada cliente debería tener su propia key.
