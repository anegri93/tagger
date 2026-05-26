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
| `tagger.movimientos` | Categorizar, listar, corregir, reprocesar, importar |
| `tagger.categorias` | CRUD de categorías canónicas (Mango admin) |
| `tagger.categoriasUsuario` | CRUD subcategorías personales del usuario (ancladas a un rubro canónico) |
| `tagger.reglas` | CRUD reglas + sugerencias por usuario / cross-user |
| `tagger.mcc` | CRUD del catálogo MCC ISO 18245 |
| `tagger.marcas` | CRUD marcas conocidas |
| `tagger.comercios` | Listado + reasignación |
| `tagger.catalogo` | Importar `mcc_por_nombre` (capa 2) |
| `tagger.testBatch` | Tests de pipeline en lote |
| `tagger.stats` | Distribución por capa del pipeline |
| `tagger.descripciones` | Autocomplete per-user de descripciones |
| `tagger.presupuestos` | Topes mensuales por categoría (versionados) |
| `tagger.chat` | Chat IA contextual sobre movimientos del usuario |
| `tagger.health()` | Status servicio |

## Referencia: `movimientos`

```ts
tagger.movimientos.categorizar(input): Promise<ResultadoCategorizacion>
tagger.movimientos.listar({limit?, offset?, origen?}): Promise<MovimientoListado[]>
tagger.movimientos.obtener(id): Promise<Movimiento>
tagger.movimientos.corregir({movimientoId, categoriaIdNueva, usuario?, motivo?, aprender?, subcategoriaUsuarioId?}): Promise<CorreccionResult>
tagger.movimientos.reprocesar(id): Promise<ResultadoCategorizacion>
tagger.movimientos.importar({rows, batchId?}): Promise<ImportarMovimientosResult>
tagger.movimientos.statusImport(): Promise<ImportStatus>
tagger.movimientos.categoriasSugeridas(id, {q?, limit?, offset?, umbral?}): Promise<CategoriasSugeridasResult>
```

`MovimientoListado` y `Movimiento` devuelven `subcategoria_usuario_id` + `subcategoria` poblada (`{id, nombre, slug, emoji, color, canonica_id}`) cuando aplica.

### Categorizar con categoría manual (`categoriaId` + `aprender`)

Si la app permite al usuario elegir categoría al cargar un gasto (no se confía en pipeline), pasá `categoriaId` directo. Skip cascada, mov se guarda con `fuente='manual'` `confianza=1`.

```ts
// Sólo este mov
await tagger.movimientos.categorizar({
  nombreBancard: 'ALMACEN DON JUAN',
  monto: 35000,
  origen: 'user123',
  categoriaId: idSupermercado,
});

// Aprende para próximas veces
await tagger.movimientos.categorizar({
  nombreBancard: 'ALMACEN DON JUAN',
  monto: 35000,
  origen: 'user123',
  categoriaId: idSupermercado,
  aprender: true,
});
```

`aprender` default `false` cuando hay `categoriaId`. Requiere `origen`.

### Corregir con o sin aprender (`aprender`)

Por default, `corregir` crea regla user-scope (prio 1) para que próximas categorizaciones del mismo nombre devuelvan la categoría corregida automáticamente.

Para **excepciones puntuales** (estación de servicio donde sólo compraste algo del shop, mercado donde compraste regalo, etc), pasá `aprender: false`. Sólo el movimiento se actualiza; la memoria del usuario no se contamina.

```ts
// Caso normal — aprende
await tagger.movimientos.corregir({
  movimientoId,
  categoriaIdNueva: idSupermercado,
  usuario: 'user123',
});

// Excepción única — no aprende
await tagger.movimientos.corregir({
  movimientoId,
  categoriaIdNueva: idSupermercado,
  usuario: 'user123',
  aprender: false,
});
```

El audit (`correcciones_usuario`) se inserta siempre, así que sugerencias cross-user siguen funcionando.

### El campo `descripcion` y la cascada

El campo `descripcion` no es decorativo. El pipeline lo **concatena** con `nombreBancard` y `nombreComercio` antes de evaluar las reglas globales. Eso permite que el contexto del gasto influya en la categorización.

**Ejemplo**: una transferencia P2P normalmente cae en regex `^MANGO\b → transferencia`. Pero si la descripción contiene "alquiler", una regla global `contiene "alquiler" → hogar` con prioridad menor gana en la cascada.

```ts
// Sin descripción: cae a regex global → transferencia
await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - ALDO NEGRI',
  monto: 1_000_000,
  origen: 'user123',
});
// → { categoria: { slug: 'transferencia' }, fuente: 'regex' }

// Con descripción contextual: gana la regla contextual → hogar
await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - ALDO NEGRI',
  descripcion: 'transferir un millón a aldo por alquiler',
  monto: 1_000_000,
  origen: 'user123',
});
// → { categoria: { slug: 'hogar' }, fuente: 'contiene', confianza: 0.8 }
```

**Recomendación**: si tu app captura un concepto/leyenda libre del usuario (dictado por voz, campo "concepto del gasto", asunto de la transferencia bancaria), pasalo siempre como `descripcion`. Mejora drásticamente la calidad de categorización para movs que no son comercios "famosos".

### `categoriasSugeridas` — sugerencias por similitud semántica

Devuelve top-K categorías con mayor similitud (trigram) al texto enriquecido de cada categoría (slug + nombre + descripcion). Útil para mostrar al usuario "¿quisiste decir X?" antes de aplicar una corrección.

```ts
// Para un movimiento ya categorizado, sugerir alternativas basándose
// en un texto libre (puede ser la descripción del propio mov o el dictado).
const sug = await tagger.movimientos.categoriasSugeridas(movId, {
  q: 'transferencia de un millón a aldo por alquiler',
  limit: 5,
});
// → items: [
//     { slug: 'transferencia', similitud: 0.23 },
//     { slug: 'financiero',    similitud: 0.13 },
//     { slug: 'inmobiliaria',  similitud: 0.12 },  // captó "alquiler"
//     ...
//   ]
```

A diferencia de la cascada (que devuelve UNA categoría), esto devuelve ranking. Útil para UI tipo "chip de sugerencias" donde el usuario elige.

Si la categoría que devuelve la cascada y la primera de `categoriasSugeridas` difieren, probablemente sea un caso donde vale la pena pedir confirmación al usuario o crear una regla contextual nueva.

`MovimientoInput`:

| Campo | Tipo | Nota |
|---|---|---|
| `monto` | number | Requerido |
| `origen` | string | **Pasar siempre**: id del usuario (memoria por user) |
| `nombreBancard` | string | Nombre desde el procesador |
| `nombreComercio` | string | Alternativo |
| `descripcion` | string | Texto libre. **No decorativo** — concatena con nombres para reglas |
| `mcc` | string | Código ISO 18245 (2-4 dígitos) |
| `bancardId`, `codigoComercio` | string | Ids internos |
| `batchId` | string | Marca de lote (testing) |
| `bypassCatalogo` | boolean | Saltea capa 2 (sólo testing) |
| `categoriaId` | string (UUID) | Si presente, salta cascada → `fuente='manual'`, `confianza=1` |
| `aprender` | boolean | Sólo con `categoriaId` + `origen`. `true` persiste regla user-scope |
| `subcategoriaUsuarioId` | string (UUID) | Subcategoría personal del user. Backend resuelve canon padre + override silencioso de `categoriaId` |

## Referencia: `categoriasUsuario`

Subcategorías personales ancladas a un rubro canónico. User crea con nombre/emoji custom (ej "Streaming"), internamente Mango ve el rubro padre (ej "Entretenimiento"). Reports siempre rolan a canon — cero fragmentación cross-user.

```ts
tagger.categoriasUsuario.listar(usuario): Promise<CategoriaUsuario[]>
tagger.categoriasUsuario.crear({usuario, canonicaId, nombre, slug?, emoji?, color?}): Promise<CategoriaUsuario>
tagger.categoriasUsuario.actualizar(id, {nombre?, emoji?, color?, activo?}): Promise<CategoriaUsuario>
tagger.categoriasUsuario.eliminar(id): Promise<void>
```

```ts
// 1. Crear subcat ancla a rubro canónico
const streaming = await tagger.categoriasUsuario.crear({
  usuario: 'demo',
  canonicaId: idEntretenimiento,
  nombre: 'Streaming',
  emoji: '🎬',
});

// 2. Categorizar mov con subcat. Backend resuelve canon padre automáticamente.
await tagger.movimientos.categorizar({
  nombreComercio: 'NETFLIX',
  monto: 50000,
  origen: 'demo',
  subcategoriaUsuarioId: streaming.id,
});
// Mov queda con: categoria_id=Entretenimiento, subcategoria_usuario_id=streaming

// 3. Corregir mov existente a subcat
await tagger.movimientos.corregir({
  movimientoId,
  categoriaIdNueva: idEntretenimiento,  // backend override si difiere
  usuario: 'demo',
  subcategoriaUsuarioId: streaming.id,
});
```

**Validaciones backend** (errores):
- 400 `canonica_inactiva` — canon inactiva o reemplazada
- 400 `nombre_igual_canonica` — nombre coincide con padre
- 409 `slug_duplicado` — ya existe subcat con ese slug para el user
- 429 `cap_alcanzado` — > 200 subcats activas

**Borrar**: hard delete con FK `ON DELETE SET NULL` en movs. Movs preservan canónica padre, no pierden historial. Alternativa: `actualizar(id, {activo: false})` para hide sin borrar.

## Referencia: `presupuestos`

Topes mensuales por categoría canónica. Versionados: editar = INSERT nueva versión `vigente_desde=hoy`. Baja = monto 0 (preserva histórico).

```ts
tagger.presupuestos.listar({usuario}): Promise<Presupuesto[]>
tagger.presupuestos.crear({usuario, categoria_id, monto_mensual}): Promise<Presupuesto>
tagger.presupuestos.actualizar(id, monto_mensual): Promise<void>
tagger.presupuestos.eliminar(id): Promise<void>
tagger.presupuestos.estado({usuario, mes?}): Promise<PresupuestoEstado>
```

```ts
await tagger.presupuestos.crear({
  usuario: 'demo',
  categoria_id: idAlimentacion,
  monto_mensual: 1_500_000,
});

const estado = await tagger.presupuestos.estado({ usuario: 'demo', mes: '2026-05' });
// → { items: [{categoria_id, presupuesto, gastado, restante, pct, movs}, ...] }
```

V1: presupuestos sólo a nivel canónica. Subcats personales no se presupuestan individualmente (V2).

## Referencia: `chat`

Chat IA contextual. Proxy a OpenRouter (modelos free, fallback chain).

```ts
tagger.chat.preguntar({messages, movs, usuario}): Promise<{text: string}>
```

```ts
const r = await tagger.chat.preguntar({
  messages: [{ role: 'user', content: '¿En qué categorías gasto más este mes?' }],
  movs: ultimosMovs.map((m) => ({
    id: String(m.id), nombre: m.t, monto: m.amt, fecha: m.date, categoria: m.cat,
  })),
  usuario: 'demo',
});
```

503 si server no tiene `OPENROUTER_API_KEY`.

## Referencia: `categorias`

```ts
tagger.categorias.listar(): Promise<Categoria[]>
tagger.categorias.crear({slug, nombre, descripcion?}): Promise<Categoria>
tagger.categorias.actualizar(identificador, {nombre?, descripcion?}): Promise<Categoria>
tagger.categorias.eliminar(identificador): Promise<void>
tagger.categorias.usage(identificador): Promise<{movimientos, mcc, comercios}>
tagger.categorias.similares(identificador, {q?, limit?, offset?, umbral?}): Promise<CategoriasSugeridasResult>
```

### `similares` — categorías relacionadas

Devuelve categorías similares a la dada (excluyéndola) por similitud trigram. Útil para "ver categorías parecidas a hogar".

```ts
const sim = await tagger.categorias.similares('hogar', { limit: 3 });
// → items: [
//     { slug: 'construccion', similitud: 0.20 },
//     { slug: 'belleza',      similitud: 0.16 },
//     { slug: 'floreria',     similitud: 0.15 },
//   ]
```

Si pasás `q`, busca por ese texto en lugar del texto de la categoría origen.

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

tagger.descripciones.sugerir({usuario, q, limit?, categoriaId?}): Promise<SugerenciaDescripcion[]>
tagger.descripciones.sugerirFull({usuario, q, limit?, categoriaId?}): Promise<SugerenciasDescripcionResult>
```

## Autocomplete per-user de descripciones

`tagger.descripciones.sugerir(...)` devuelve descripciones que el usuario tipeó
antes y empiezan con `q`. Scope estricto per-user (otro usuario nunca las ve).

```ts
const items = await tagger.descripciones.sugerir({
  usuario: 'user_123',
  q: 'alq',
  limit: 5,
});
// [{ descripcion: 'alquiler', freq: 8, categoriaSlug: 'hogar' }, ...]
```

Patrón cliente recomendado: input `<input list="...">` + `<datalist>`, debounce
150ms, min 2 chars, AbortController para cancelar tipeo rápido. Boost opcional
con `categoriaId` cuando el user ya eligió cat en el form.

Las descripciones se persisten automáticamente al llamar a
`movimientos.categorizar(...)` con `descripcion` no nula + `origen`. No hay
endpoint de write — el sistema aprende del corpus real.

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
