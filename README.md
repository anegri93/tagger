# 🏷️ tagger

**Servicio de categorización automática de movimientos bancarios.**

Pipeline en cascada (4 capas): reglas por usuario → reglas globales → MCC inteligente (directo o inferido por nombre) → fallback IA (Gemma vía Ollama).

---

## 📚 Contenido

- [Cómo funciona (versión simple)](#cómo-funciona-versión-simple)
- [Arquitectura](#arquitectura)
- [Stack](#stack)
- [Quick start](#quick-start)
- [API endpoints](#api-endpoints)
- [Cascada categorización](#cascada-categorización)
- [Modelo de datos](#modelo-de-datos)
- [UIs](#uis)
- [SDK JavaScript / TypeScript](#sdk-javascript--typescript)
- [Scripts útiles](#scripts-útiles)
- [Estructura del proyecto](#estructura-del-proyecto)

---

## Cómo funciona (versión simple)

> Esta sección está pensada para personas no técnicas (product, negocio, directores).

**Problema que resuelve.** Cuando alguien paga con tarjeta o hace una transferencia, el banco
manda un texto crudo tipo `FARMACIA CATEDRAL-FB` o `MANGO-PEREZ JUAN` con un monto. La app
necesita mostrar al usuario una **categoría** (Farmacia, Transferencias, Alquiler, etc.).
Tagger es el servicio que recibe ese texto y devuelve la categoría.

**La idea: cascada de 7 estaciones.** El movimiento entra arriba y va bajando hasta que alguna
estación lo reconoce. La primera que lo reconoce gana, las siguientes no se ejecutan.

| # | Estación | Qué hace | Tabla(s) que consulta | Ejemplo |
|---|----------|----------|-----------------------|---------|
| 0 | **Reglas tuyas** | Reglas y memoria que aplican **solo a este usuario**. Tipo `literal` (memoria de un nombre exacto), `contiene` o `regex`. Se crean automático al corregir o vía sugerencias | `reglas WHERE scope='usuario:<X>'` (+ `categorias`) | "usuario_42 ya marcó MANGO-PEREZ JUAN como Alquiler" o "Para usuario_42, todo lo que contenga STRIPE es Software" |
| 1 | **Reglas globales** | Reglas compartidas entre todos (~300 reglas curadas) | `reglas WHERE scope='global'` (+ `categorias`) | "Cualquier texto que contenga FARMA o BOTICA es Farmacia" |
| 2 | **MCC inteligente** | Categoría a partir del código MCC. Primero busca el MCC del input, si no viene busca por nombre en `mcc_por_nombre` (~65k nombres mapeados a MCC) | `mcc_catalogo` + `mcc_por_nombre` (+ `categorias`) | "MCC 5411 = Supermercado", o "nombre SHELL LDM no trae MCC, pero otros movs con ese nombre usan 5541 → Gasolinera" |
| 3 | **IA (Gemma)** | Si nadie reconoció el movimiento, le pregunta al modelo de lenguaje | `categorias` (lista de opciones) + opcional `marcas_conocidas` (hints) — no consulta tablas de matching | "COMERCIAL XYZ S.A. con monto 50.000 → modelo dice Alimentación" |

> Toda categoría resuelta termina escrita en la tabla `movimientos` (campos `categoria_predicha_id`, `fuente_categoria`, `confianza`, `evidencia`, `requiere_revision`). Las correcciones manuales se persisten en `correcciones_usuario` y retroalimentan la tabla `reglas` (capa 0) o aparecen como sugerencias para promover a regla global.

**Cómo aprende sin re-entrenar.** Tagger mejora solo, a medida que se usa, por 3 vías:

1. **El usuario corrige una transferencia MANGO** → se guarda en su memoria. Próxima vez sale automático (estación 0).
2. **El usuario corrige el mismo comercio varias veces** → aparece como sugerencia para crear una regla personal. Si aprueba, futuras compras en ese comercio salen automático (estación 1).
3. **Un equipo de operaciones agrega reglas globales o catálogo Bancard** → afecta a todos los usuarios (estaciones 2 y 3).

**Por qué 4 estaciones y no una sola IA.** Costo, velocidad y trazabilidad:

- Estaciones 0-2 son consultas a base de datos: tardan menos de 10 milisegundos.
- IA tarda 1 a 5 segundos por movimiento y consume CPU/memoria del modelo.
- Estaciones 0-2 cubren ~99% del volumen real (medido contra ground truth). IA solo procesa el resto.
- Cada movimiento queda con un registro de **qué estación lo categorizó** y **con qué evidencia** (regex usada, MCC, regla_id, etc.). Esto permite auditar y corregir errores sistemáticamente.

**Niveles de confianza.** No todas las estaciones tienen la misma certeza:

- Correcciones manuales y memoria personal (`fuente='manual'`): **1.00**
- Regex, literal, contiene: **0.80 a 0.95**
- MCC: **0.75**
- IA: **0.50** (siempre marca el movimiento como "requiere revisión")

Cualquier movimiento con confianza menor a **0.70** queda flagueado como `requiere_revisión=true` para que se revise manualmente si hace falta.

**Resumen en una línea.** Tagger es una cadena de reglas y memorias que reconocen movimientos
conocidos en milisegundos, y solo molesta a la IA cuando no tiene mejor opción.

### Diagrama del flujo

```mermaid
flowchart LR
    IN([Movimiento]) --> C0[0 · Reglas tuyas]
    C0 -->|hit| OK([Categoría asignada])
    C0 -->|no| C1[1 · Reglas globales]
    C1 -->|hit| OK
    C1 -->|no| C2[2 · MCC inteligente]
    C2 -->|hit| OK
    C2 -->|no| C3[3 · IA Gemma async]
    C3 --> OK
```

**Bucle de aprendizaje** — qué pasa cuando un usuario corrige un movimiento:

```mermaid
flowchart LR
    U([Usuario corrige]) --> R[(reglas scope='usuario:X')]
    R -->|próxima vez| C0[Capa 0]
    U --> S[(sugerencia para regla global)]
    S -->|admin aprueba| C1[Capa 1]
```

**Sugerencias globales cross-user** (`/ui/dashboard/`): cuando ≥N usuarios distintos corrigen el mismo nombre a la misma categoría, aparece como candidato para promover a regla global (capa 1) y beneficia a todos los usuarios. Configurable vía `min_usuarios` y `min_total` en el endpoint `/reglas/sugerencias-globales`.

**Dashboard de capas** (`/ui/dashboard/`): visualiza % de movimientos resueltos por cada capa en ventanas 1h/24h/7d/30d. Si IA o "sin match" suben, indica que hace falta agregar reglas para los nombres frecuentes.

**Cómo leerlo.** El primer diagrama es el flujo de categorización: el movimiento entra por la izquierda y va pasando por las capas hasta que alguna lo reconoce (`hit`). El segundo es el bucle de aprendizaje: las correcciones del usuario vuelven a alimentar las capas 0 y 1, para que esos mismos movimientos salgan automáticos la próxima vez.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│  Cliente (mobile / banco upstream / postman)             │
└──────────────────────┬───────────────────────────────────┘
                       │ POST /categorizar-movimiento
                       │ { descripcion, mcc?, monto?, bancard_id?, codigo_comercio? }
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Fastify API (auth API key)                              │
│  ─ schema validation (zod)                               │
│  ─ middleware request-log (pino)                         │
└──────────────────────┬───────────────────────────────────┘
                       │ ejecutarCascada(input, capas)
                       ▼
       ┌───────────────────────────────────────────────┐
       │ 0. REGLAS USR    scope='usuario:X' literal/    │
       │                  contiene/regex                │
       │ 1. REGLAS GLOBAL scope='global'                │
       │ 2. MCC           input.mcc → mcc_catalogo, o   │
       │                  nombre → mcc_por_nombre →     │
       │                  mcc_catalogo                  │
       │ 3. RESPUESTA     inmediata (puede ser null)    │
       │ 4. IA            Gemma async (fire-and-forget) │
       └─────────────────────┬─────────────────────────┘
                             ▼
       ┌─────────────────────────────────────────────┐
       │  Persistencia: tabla movimientos            │
       │  ─ categoria_predicha_id, fuente, confianza │
       │  ─ requiere_revision, evidencia jsonb       │
       │  ─ batch_id, origen, latency_ms             │
       └─────────────────────────────────────────────┘

Postgres 16 (Drizzle ORM) ─── tablas:
  ┌─ categorias              (slug PK, nombre)
  ├─ reglas                  (scope + tipo + valor → categoría — unifica patrones globales + personales + memoria)
  ├─ mcc_catalogo            (cod_mcc → categoría)
  ├─ mcc_por_nombre          (~65k nombres → MCC + categoría inferida)
  ├─ marcas_conocidas        (IA hints dinámicos)
  ├─ movimientos             (histórico predicciones)
  ├─ correcciones_usuario    (correcciones manual cliente)
  └─ test_ground_truth       (ground truth para validación pipeline)
```

---

## Stack

| Capa        | Tecnología                                                      |
| ----------- | --------------------------------------------------------------- |
| Lenguaje    | TypeScript strict (NodeNext, exactOptionalPropertyTypes)        |
| Runtime     | Node.js ≥20                                                     |
| HTTP        | Fastify 5 + @fastify/cors + @fastify/static + @fastify/sensible |
| ORM         | Drizzle ORM (node-postgres)                                     |
| DB          | Postgres 16                                                     |
| Migrations  | drizzle-kit                                                     |
| Tests       | Vitest                                                          |
| Validación  | Zod                                                             |
| Logger      | Pino + pino-pretty                                              |
| LLM         | Ollama (Gemma)                                                  |
| XLSX        | xlsx (SheetJS)                                                  |
| Build/Dev   | tsx + tsc                                                       |
| Lint        | ESLint + Prettier                                               |
| Package mgr | pnpm 10                                                         |

---

## Quick start

```bash
# Prerequisitos: node >=20, pnpm (corepack enable), docker

git clone <repo> tagger && cd tagger
bash start.sh                       # genera .env con API_KEY aleatoria,
                                    # levanta postgres + deps + migrate + seed + API
```

Con IA fallback (Ollama, requiere ~5 GB modelo):

```bash
OLLAMA=1 bash start.sh
```

Verificar:

```bash
curl http://localhost:3000/health   # → {"status":"ok"}
open http://localhost:3000/ui/      # UIs
```

`start.sh` es idempotente: levanta lo que falte (postgres, deps, migrations, seed), arranca API foreground. `stop.sh` baja todo. `restart.sh` = stop + start.

**Seed inicial** (cargado automático por `start.sh` desde `data/seed.sql`):

- 35 categorías
- 215 MCCs mapeados
- ~315 reglas (`scope='global'` curadas + `scope='usuario:X'` aprendidas de correcciones)
- 76 marcas conocidas
- ~65k mapeos nombre → MCC (sheet TuFi)

**MCC por nombre** (`mcc_por_nombre`): cargado automático por seed (sheet TuFi: ~65k nombres → MCC). Match por `nombre_normalizado`. Para sincronizar desde XLSX nuevo: `pnpm tsx scripts/sync-comercios-tufi.ts --apply`. Para importar CSV manual: `/ui/importar/`.

### Variables de entorno (`.env`)

| Variable                | Default                                          | Descripción                                                                                               |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`              | `development`                                    | `development` \| `test` \| `production`                                                                   |
| `PORT`                  | `3000`                                           | Puerto HTTP                                                                                               |
| `DATABASE_URL`          | `postgres://tagger:tagger@localhost:5432/tagger` | Connection string Postgres                                                                                |
| `API_KEY`               | _(requerido, mín 16 chars)_                      | Header `x-api-key` para todas las rutas excepto `/health*`, `/ui/*`, `/`                                  |
| `OLLAMA_URL`            | `http://localhost:11434`                         | URL del servidor Ollama                                                                                   |
| `OLLAMA_MODEL`          | `gemma2:2b`                                      | Modelo a usar para IA fallback                                                                            |
| `OLLAMA_MAX_CONCURRENT` | `4`                                              | Máximo de llamadas IA en paralelo (queue interna evita saturar Ollama)                                    |
| `IA_ENABLED`            | `true`                                           | Si `false` → no schedula IA fallback. Movimientos sin match quedan `requiere_revision=true` sin categoría |
| `CONFIDENCE_THRESHOLD`  | `0.7`                                            | Umbral para marcar `requiere_revision=true`                                                               |
| `LOG_LEVEL`             | `info`                                           | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace`                                              |

---

## API endpoints

### Categorización

| Método | Path                          | Descripción                                                                                                                        |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/categorizar-movimiento`     | Categoriza un movimiento. Body: `{descripcion?, nombre_bancard?, nombre_comercio?, mcc?, monto?, bancard_id?, codigo_comercio?, bypass_catalogo?, origen?, batch_id?, categoria_id?, aprender?}`. Si `categoria_id` viene → saltea cascada, guarda como manual (`fuente='manual'` `confianza=1`). `aprender=true` (con `categoria_id` + `origen`) además guarda regla user-scope |
| GET    | `/movimientos/:id`            | Detalle movimiento (incluye evidencia IA)                                                                                          |
| POST   | `/movimientos/:id/correccion` | Corrección manual. Body: `{categoria_id_nueva, usuario?, motivo?, aprender?}`. `aprender=true` (default) crea regla user-scope (capa 0). `aprender=false` aplica sólo a este mov (excepción puntual, no contamina memoria) |
| POST   | `/movimientos/:id/reprocesar` | Re-ejecuta cascada + IA sobre movimiento existente. Body: `{bypass_catalogo?}` (opcional). Response incluye `ia_disparada: bool`.  |

### CRUD recursos

| Método                | Path                      | Función                                                                                                                    |
| --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET/POST/PATCH/DELETE | `/categorias`             | CRUD categorías                                                                                                            |
| GET                   | `/categorias/:slug/usage` | Counts refs (movimientos/mcc_por_nombre/mcc_catalogo)                                                                      |
| GET/POST/PATCH/DELETE | `/reglas`                 | CRUD reglas. `GET /reglas?scope=global` o `scope=usuario:<X>`. `GET /reglas/sugerencias?usuario=X&umbral=N` agrupa correcciones del usuario. `GET /reglas/sugerencias-globales?min_usuarios=3&min_total=5` lista patrones que **varios usuarios distintos** corrigieron a la misma categoría (candidatos a regla global). `POST` crea regla, `PATCH /:id` activa/desactiva o cambia prioridad, `DELETE /:id` o `DELETE /reglas?scope=&valor=`. Tipos: `literal` / `contiene` / `regex` |
| GET/POST/PATCH/DELETE | `/mcc`                    | CRUD MCC mapping                                                                                                           |
| GET/POST/PATCH/DELETE | `/marcas`                 | CRUD marcas conocidas IA                                                                                                   |
| GET/PATCH             | `/comercios`              | Listar paginado + cambio categoría individual (sobre `mcc_por_nombre`)                                                     |

### Stats / Dashboard

| Método | Path                                      | Descripción                                                                                                                                                                                              |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/stats/pipeline?ventana=1h\|24h\|7d\|30d\|all` | Distribución de movimientos por capa del pipeline en la ventana especificada. Incluye conteo por capa+fuente, revisiones pendientes, correcciones aplicadas, latencia p50/p95/p99/avg. Default 24h |
| GET    | `/reglas/sugerencias-globales`            | Lista nombres normalizados que ≥N usuarios distintos corrigieron a la misma categoría. Params: `min_usuarios` (default 3), `min_total` (default 5). Excluye los que ya tienen regla global activa        |

### Importación bulk

| Método | Path                           | Función                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| POST   | `/catalogo/importar`           | Importa rows a `mcc_por_nombre` (chunked, async). Body: `{rows, correr_cascada?}`     |
| GET    | `/catalogo/importar/status`    | Estado import                                                                         |
| POST   | `/movimientos/importar`        | Importa rows a `movimientos` ejecutando cascada (async). Body: `{rows, batch_id?, bypass_catalogo?}` |
| GET    | `/movimientos/importar/status` | Estado import                                                                         |

### Test masivo / Validación pipeline

| Método | Path                                                                                                | Función                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/test-batch/start`                                                                                 | Dispara worker test masivo in-process                                                                                                                |
| POST   | `/test-batch/stop`                                                                                  | Cancela batch corriendo                                                                                                                              |
| GET    | `/test-batch/list`                                                                                  | Batches activos                                                                                                                                      |
| GET    | `/test-batch/:batch_id/stats`                                                                       | Stats agregadas (latencia, fuente, agreement, mismatches)                                                                                            |
| GET    | `/test-batch/:batch_id/agreement?ground_truth=<batch>`                                              | Agreement pipeline vs `categoria_xlsx` de `test_ground_truth`                                                                                        |
| GET    | `/test-batch/:batch_id/agreement-mcc?reference=mcc\|combined_mcc&include_ambiguo=&include_generic=` | Agreement pipeline vs MCC catalog (proxy ground truth)                                                                                               |
| GET    | `/test-batch/:batch_id/analisis`                                                                    | Análisis profundo: distribución por fuente/categoría, patrones más usados, top sin-predicción por volumen, latencia p50/p95/p99, cobertura por decil |

### Salud

| Método | Path            | Devuelve                                  |
| ------ | --------------- | ----------------------------------------- |
| GET    | `/health`       | `{status:'ok'}` (no requiere auth)        |
| GET    | `/health/ready` | `{status, db, ollama}` (no requiere auth) |

**Auth**: header `x-api-key: <API_KEY>` excepto `/health*`, `/ui/*`, `/favicon.ico`, `/`.

---

## Cascada categorización

Confianzas asignadas por fuente (constantes en `src/domain/confianza.ts`):

| Capa pipeline  | Fuente devuelta            | Confianza  | Cuándo dispara                                                                                                                                |
| -------------- | -------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. reglas usuario | `manual` (origen correccion/manual) o `literal/contiene/regex` | 1.00 / 0.80-0.95 | Lookup en `reglas WHERE scope='usuario:<X>' AND activo=true`. Cache LRU por scope, TTL 60s. Si origen='correccion' o 'manual' devuelve fuente='manual' confianza=1.0 |
| 1. reglas global  | `literal`                  | 0.95       | Match exacto contra `valor_normalizado` (mayúsculas, sin acentos)                                                                             |
| 1. reglas global  | `regex`                    | 0.95       | Patrón tipo regex matchea                                                                                                                     |
| 1. reglas global  | `contiene`                 | 0.80       | Patrón tipo contiene matchea                                                                                                                  |
| 3. patrones      | `prefijo`                  | 0.90       | Patrón tipo prefijo matchea                                                                                                                   |
| 4. MCC           | `mcc`                      | 0.75       | MCC del input mapeado a categoría no-ambigua                                                                                                  |
| 5. IA fallback   | `ia`                       | 0.50 (cap) | Gemma async (concurrency `OLLAMA_MAX_CONCURRENT`) — `requiere_revision` siempre `true`. Deshabilitable con `IA_ENABLED=false`                 |
| Corrección     | `manual`                   | 1.00       | POST `/movimientos/:id/correccion`. Body `{categoria_id_nueva, usuario?, aprender?}`. Si `aprender=true` (default) y hay usuario, auto-upsert en `reglas` con `scope='usuario:X' tipo='literal' origen='correccion' prioridad=1`. Si `aprender=false`, sólo modifica este mov (excepción puntual, no contamina memoria). Audit en `correcciones_usuario` se inserta siempre — `GET /reglas/sugerencias-globales` capta consensos aunque varios usuarios marquen `aprender=false` |

Valores legacy en DB enum (movimientos viejos, no usados por pipeline actual): `bancard` (0.90), `nombre` (0.80), `patrones` (0.90).

**Threshold revisión**: confianza < 0.70 → `requiere_revision=true`.

**Bypass MCC por nombre** (testing): flag `bypass_catalogo=true` (nombre legacy) salta el fallback MCC-por-nombre dentro de capa MCC → solo MCC directo del input. Útil para medir el impacto del catálogo precomputado.

**IA fire-and-forget**: cuando todas las capas sync devuelven null, response inmediato es null + revisión, y `setImmediate` dispara IA. Cliente debe re-fetchear `/movimientos/:id` después para ver categoría asignada por IA.

---

## Modelo de datos

```sql
categorias       (id uuid PK, slug unique, nombre, descripcion, activo)
reglas           (id, scope text, tipo text [literal|contiene|regex], valor,
                  valor_normalizado, categoria_id FK, prioridad, activo, hits,
                  origen, descripcion,
                  UNIQUE (scope, tipo, valor_normalizado))
mcc_catalogo     (cod_mcc PK, descripcion, categoria_id FK, ambiguo)
mcc_por_nombre   (id, nombre, nombre_normalizado UNIQUE, mcc, categoria_id FK,
                  requiere_revision)
marcas_conocidas (id, marca unique, categoria_id FK, descripcion)
movimientos      (id, descripcion, nombre_comercio, nombre_bancard, mcc, monto,
                  categoria_predicha_id, categoria_confirmada_id,
                  fuente_categoria enum, confianza, requiere_revision,
                  raw_input jsonb, evidencia jsonb,
                  origen, batch_id, bancard_id, codigo_comercio, latency_ms,
                  created_at, updated_at)
correcciones_usuario (id, movimiento_id FK, categoria_anterior_id, categoria_nueva_id,
                      usuario, motivo)
test_ground_truth (id, batch_id, nombre, nombre_normalizado, bancard_id,
                   codigo_comercio, mcc, combined_mcc, categoria_xlsx,
                   sector_xlsx, cantidad, fuente_origen)
```

Índices clave:
- `reglas (scope, tipo, valor_normalizado)` único — evita duplicados por scope
- `reglas (scope, activo, prioridad)` — load por scope con cache LRU 60s
- `reglas (valor_normalizado)` — lookup literal cross-scope
- `mcc_por_nombre (nombre_normalizado)` único — lookup MCC inferido
- `movimientos (batch_id)` — query test masivo

`scope` puede ser `'global'` o `'usuario:<X>'` (texto libre, no enum, para soportar miles de usuarios sin migrar enum).

Ver `src/db/schema/` para definición drizzle.

---

## UIs

Todas servidas por mismo Fastify (mismo origen, sin CORS).

| URL                 | Función                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| `/ui/`              | Landing con health + counts                                                        |
| `/ui/dashboard/`    | **NUEVO** — % por capa del pipeline + sugerencias globales (cross-user) para promover a reglas |
| `/ui/categorias/`   | CRUD categorías + reglas globales + MCC + marcas + comercios                       |
| `/ui/importar/`     | Importa XLSX/CSV a `mcc_por_nombre` o `movimientos` con mapping de campos          |
| `/ui/test-monitor/` | Dashboard tests masivos realtime                                                   |
| `/ui/memoria/`      | Playground end-to-end: crear movimiento, corregir, ver reglas tuyas + sugerencias  |
| `/ui/api/`          | Swagger UI sobre `openapi.yaml` con "Try it out" + Postman collection downloadable |

**Shared layout** (`ui/shared/`):

- `theme.css` — CSS variables, dark theme
- `state.js` — `window.tagger` singleton (apiKey, baseUrl)
- `api.js` — `window.taggerApi(path, opts)` fetch wrapper unificado
- `nav.js` — navbar auto-inyectado con active state + health badge

API key se setea **una vez** en cualquier UI y persiste en localStorage.

---

## SDK JavaScript / TypeScript

Cliente oficial en `sdk/`. Wrapper tipado sobre la API HTTP con manejo de auth, errores tipados, serialización camelCase ↔ snake_case y soporte para todos los endpoints.

```ts
import { TaggerClient } from '@mango/tagger-sdk';

const tagger = new TaggerClient({
  url: process.env.TAGGER_URL,            // default: https://tagger.n8negri.xyz
  apiKey: process.env.TAGGER_API_KEY!,
});

const r = await tagger.movimientos.categorizar({
  nombreBancard: 'MANGO - JUAN PEREZ',
  monto: 50000,
  origen: 'usuario_123',                  // ← REQUERIDO para memoria por-usuario
});
```

Estructura modular: `tagger.movimientos`, `tagger.categorias`, `tagger.reglas`, `tagger.mcc`, `tagger.marcas`, `tagger.comercios`, `tagger.catalogo`, `tagger.testBatch`, `tagger.stats`, `tagger.descripciones`, `tagger.health()`.

**Tip clave**: pasar `descripcion` con el contexto del gasto (concepto libre, asunto de la transferencia, dictado por voz) cambia drásticamente la categorización. El pipeline concatena `nombreBancard + nombreComercio + descripcion` antes de evaluar reglas, por lo que palabras como "alquiler", "taxi", "remedio" pueden ganar sobre regex de plataforma (`^MANGO\b`).

**Sugerencias contextuales**: `tagger.movimientos.categoriasSugeridas(id, {q})` y `tagger.categorias.similares(id, {q?})` devuelven top-K categorías por similitud trigram sobre las descripciones enriquecidas — útil para mostrar "¿quisiste decir X?" o curar reglas nuevas.

**Autocomplete per-user de descripciones**: `tagger.descripciones.sugerir({usuario, q, limit?, categoriaId?})` devuelve top-K descripciones que ESE usuario ya tipeó antes y empiezan con `q` (lookup btree prefix, scope estricto per-user, p99 < 50ms). El sistema aprende solo: cada `categorizar()` con `descripcion` + `origen` hace upsert async en `descripcion_uso`. Backfill desde corpus existente: `pnpm tsx scripts/backfill-descripcion-uso.ts`.

Errores tipados: `ValidationError` (400), `AuthError` (401/403), `NotFoundError` (404), `ConflictError` (409), `ServerError` (5xx), `NetworkError` (timeout).

**Build + smoke**:

```bash
cd sdk
pnpm install && pnpm build
API_KEY=xxx pnpm smoke    # corre 27 checks contra el dev server
```

Docs completas: [`docs/sdk.md`](docs/sdk.md) o `/ui/docs/sdk.html` en cualquier deploy.

---

## Scripts útiles

### DB

```bash
pnpm db:generate                # Drizzle migrations desde schema
pnpm db:migrate                 # Aplicar migrations
pnpm db:studio                  # Drizzle Studio (GUI)
pnpm db:seed:dump               # Re-genera data/seed.sql desde DB actual
```

### Operación

```bash
pnpm dev                        # Hot-reload foreground
pnpm test                       # Vitest run
pnpm test:watch                 # Vitest watch
pnpm lint                       # ESLint
pnpm typecheck                  # tsc --noEmit
pnpm format                     # Prettier write
```

### Análisis / utilidades

```bash
node scripts/analyze-test-batch.mjs <batch_id>     # Stats de un batch
node scripts/report-cobertura.mjs                  # Distribución catálogo
node scripts/xlsx-to-tsv.mjs <ruta.xlsx>           # XLSX → TSV
node scripts/export-mcc-mapping.mjs                # Exporta plantilla MCC
pnpm tsx scripts/clean-db.ts                       # Limpia DB (idempotente)
pnpm tsx scripts/sync-mcc-tufi.ts                  # Sync MCC desde TuFi
pnpm tsx scripts/aplicar-recat.ts                  # Promueve recat shadow → live
pnpm tsx scripts/dump-seed.ts                      # Dump seed.sql desde DB
```

### Validación pipeline con ground truth

```bash
# 1. Cargar XLSX de Bancard a test_ground_truth (idempotente por nombre)
pnpm tsx scripts/load-ground-truth.ts \
  --file /path/XLSX.xlsx --sheet DataMayo \
  --batch-id datamayo-2026-05 [--top-n 5000]

# 2. Categorizar contra ground truth (modo realista: solo nombre)
pnpm tsx scripts/test-ground-truth.ts \
  --ground-truth-batch datamayo-2026-05 \
  --test-batch-id mi-test-2026-05 \
  --solo-nombre --bypass-catalogo --concurrency 20

# 3. Reprocesar movimientos pendientes (IA fallback)
pnpm tsx scripts/reprocesar-pendientes.ts \
  --batch-id mi-test-2026-05 --concurrency 4

# 4. Ver agreement vs MCC proxy
curl http://localhost:3000/test-batch/mi-test-2026-05/agreement-mcc \
  -H "x-api-key: $API_KEY"

# 5. Análisis profundo
curl http://localhost:3000/test-batch/mi-test-2026-05/analisis \
  -H "x-api-key: $API_KEY"
```

---

## Estructura del proyecto

```
tagger/
├── src/
│   ├── api/
│   │   ├── routes/         (categorizar, categorias, reglas, mcc, marcas,
│   │   │                    comercios, importar-*, test-batch-*, health, ...)
│   │   ├── schemas/        (zod schemas request/response)
│   │   └── plugins/        (auth API key, request-log)
│   ├── config/             (env zod validation)
│   ├── db/
│   │   ├── client.ts       (Drizzle pool)
│   │   ├── schema/         (tablas Drizzle: categorias, reglas, mcc_catalogo, mcc_por_nombre, ...)
│   │   ├── repos/          (CRUD writers/readers + cache)
│   │   ├── loaders/        (csv stream helper)
│   │   └── migrations/     (drizzle-kit generated)
│   ├── domain/             (types, normalize, confianza)
│   ├── layers/             (reglas, mcc, ia)
│   ├── pipeline/           (categorizar, persistir, ia-fallback)
│   ├── lib/                (ollama client, logger)
│   ├── test-batch/         (worker masivo)
│   └── main.ts             (wire-up + listen)
├── ui/
│   ├── index.html          (landing)
│   ├── shared/             (theme + state + api + nav)
│   ├── categorias/         (CRUD + detalle tabs)
│   ├── importar/           (XLSX/CSV → mcc_por_nombre/movimientos)
│   ├── test-monitor/       (dashboard masivo realtime)
│   ├── memoria/            (playground end-to-end)
│   └── api/                (Swagger UI sobre openapi.yaml)
├── scripts/                (utilidades + análisis)
├── docs/                   (runbook, integration-guide, decisiones, histórico)
├── data/                   (gitignore excepto mcc-mapping.json)
├── postman/                (colección API)
├── drizzle.config.ts
├── docker-compose.yml
├── Dockerfile
└── start.sh / stop.sh / restart.sh
```

---

## Despliegue Docker

```bash
docker compose up -d                       # Solo Postgres
docker compose --profile ai up -d          # + Ollama
```

`docker-compose.yml`:

- `postgres` con healthcheck + volumen
- `ollama` con profile `ai` (opcional)

---

## Licencia

Privado. Mango Apps Paraguay.
