# 🏷️ tagger

**Servicio de categorización automática de movimientos bancarios.**

Pipeline en cascada: memoria por usuario (transferencias) → patrones-usuario (reglas personales) → catálogo (bancard+codigo o nombre normalizado) → patrones (regex/contiene/prefijo/literal) → MCC oficial → fallback IA (Gemma vía Ollama).

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
| 0 | **Memoria del usuario** | Recuerda movimientos que el usuario ya corrigió (transferencias MANGO y/o comercios). Si el mismo nombre vuelve a aparecer para ese usuario, sale automático | `memoria_usuario_destinatario` (+ `categorias` para resolver el nombre) | "usuario_42 ya marcó MANGO-PEREZ JUAN como Alquiler", o "usuario_42 marcó BMW como Transporte" |
| 1 | **Reglas personales** | Reglas que solo aplican a un usuario | `patrones_usuario` (+ `categorias`) | "Para usuario_42, todo lo que contenga STRIPE es Software" |
| 2 | **Catálogo de comercios** | Lista oficial de Bancard (~25k comercios) + match por nombre normalizado del comercio | `comercios_catalogo` (+ `categorias`) | "Bancard ID 12345 + código 678 = Supermercado Stock", o "nombre 'SHELL LDM' coincide con catálogo" |
| 3 | **Reglas globales** | Reglas compartidas entre todos | `patrones` (+ `categorias`) | "Cualquier texto que contenga FARMA o BOTICA es Farmacia" |
| 4 | **MCC** | Código de categoría que viene en la tarjeta (estándar Visa/Master) | `mcc_catalogo` (+ `categorias`) | "MCC 5411 = Supermercado" |
| 5 | **IA (Gemma)** | Si nadie reconoció el movimiento, le pregunta al modelo de lenguaje | `categorias` (lista de opciones) + opcional `marcas_conocidas` (hints) — no consulta tablas de matching | "COMERCIAL XYZ S.A. con monto 50.000 → modelo dice Alimentación" |

> Toda categoría resuelta termina escrita en la tabla `movimientos` (campos `categoria_predicha_id`, `fuente_categoria`, `confianza`, `evidencia`, `requiere_revision`). Las correcciones manuales se persisten en `correcciones_usuario` y, según el caso, retroalimentan `memoria_usuario_destinatario` o las sugerencias de `patrones_usuario`.

**Cómo aprende sin re-entrenar.** Tagger mejora solo, a medida que se usa, por 3 vías:

1. **El usuario corrige una transferencia MANGO** → se guarda en su memoria. Próxima vez sale automático (estación 0).
2. **El usuario corrige el mismo comercio varias veces** → aparece como sugerencia para crear una regla personal. Si aprueba, futuras compras en ese comercio salen automático (estación 1).
3. **Un equipo de operaciones agrega reglas globales o catálogo Bancard** → afecta a todos los usuarios (estaciones 2 y 3).

**Por qué 6 estaciones y no una sola IA.** Costo, velocidad y trazabilidad:

- Estaciones 0-4 son consultas a base de datos: tardan menos de 10 milisegundos.
- IA tarda 1 a 5 segundos por movimiento y consume CPU/memoria del modelo.
- Estaciones 0-4 cubren ~70% del volumen real. IA solo procesa el 30% restante.
- Cada movimiento queda con un registro de **qué estación lo categorizó** y **con qué evidencia** (regex usada, MCC, id del comercio, etc.). Esto permite auditar y corregir errores sistemáticamente.

**Niveles de confianza.** No todas las estaciones tienen la misma certeza:

- Memoria del usuario y correcciones manuales: **1.00** (máxima)
- Catálogo, regex, reglas: **0.80 a 0.95**
- MCC: **0.75**
- IA: **0.50** (siempre marca el movimiento como "requiere revisión")

Cualquier movimiento con confianza menor a **0.70** queda flagueado como `requiere_revisión=true` para que se revise manualmente si hace falta.

**Resumen en una línea.** Tagger es una cadena de reglas y memorias que reconocen movimientos
conocidos en milisegundos, y solo molesta a la IA cuando no tiene mejor opción.

### Diagrama del flujo

```mermaid
flowchart LR
    IN([Movimiento]) --> C0[0 · Memoria usuario]
    C0 -->|hit| OK([Categoría asignada])
    C0 -->|no| C1[1 · Reglas personales]
    C1 -->|hit| OK
    C1 -->|no| C2[2 · Catálogo Bancard + nombre]
    C2 -->|hit| OK
    C2 -->|no| C3[3 · Reglas globales]
    C3 -->|hit| OK
    C3 -->|no| C4[4 · MCC oficial]
    C4 -->|hit| OK
    C4 -->|no| C5[5 · IA Gemma async]
    C5 --> OK
```

**Bucle de aprendizaje** — qué pasa cuando un usuario corrige un movimiento:

```mermaid
flowchart LR
    U([Usuario corrige]) --> Q{Tipo de movimiento}
    Q -->|transferencia MANGO| M[(memoria_usuario_<br/>destinatario)]
    Q -->|comercio repetido| S[(sugerencia<br/>patrones-usuario)]
    M -->|próxima vez| C0[Capa 0]
    S -->|usuario aprueba| C1[Capa 1]
```

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
       │ 0. MEMORIA       (usuario, destinatario) → cat │
       │                  (solo transferencias MANGO-)  │
       │ 1. PATRONES-USR  reglas personales del usuario │
       │ 2. CATÁLOGO      bancard+codigo o nombre exacto│
       │ 3. PATRONES      regex/contiene/prefijo/literal│
       │ 4. MCC           código MCC del input          │
       │ 5. RESPUESTA     inmediata (puede ser null)    │
       │ 6. IA            Gemma async (fire-and-forget) │
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
  ├─ patrones                (tipo + valor → categoría)
  ├─ mcc_catalogo            (cod_mcc → categoría)
  ├─ comercios_catalogo      (bancard+codigo o nombre normalizado, incluye recategorización shadow)
  ├─ marcas_conocidas        (IA hints dinámicos)
  ├─ movimientos             (histórico predicciones)
  ├─ correcciones_usuario    (correcciones manual cliente)
  ├─ test_ground_truth       (ground truth para validación pipeline)
  ├─ memoria_usuario_destinatario  (memoria por usuario — transferencias MANGO y comercios)
  └─ patrones_usuario              (reglas personales por usuario + sugerencias)
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
- 291 patrones
- 76 marcas conocidas
- ~65k comercios (sheet TuFi, `bancard_id` NULL, match por nombre)

**Catálogo de comercios** (`comercios_catalogo`): cargado automático por seed (incluye sheet TuFi: ~65k nombres → MCC). Match por `bancard_id+codigo_comercio` o por `nombre_normalizado`. Para sincronizar desde XLSX nuevo: `pnpm tsx scripts/sync-comercios-tufi.ts --apply`. Para importar CSV manual: `/ui/importar/`.

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
| POST   | `/categorizar-movimiento`     | Categoriza un movimiento. Body: `{descripcion, mcc?, monto?, bancard_id?, codigo_comercio?, bypass_catalogo?, origen?, batch_id?}` |
| GET    | `/movimientos/:id`            | Detalle movimiento (incluye evidencia IA)                                                                                          |
| POST   | `/movimientos/:id/correccion` | Corrección manual usuario                                                                                                          |
| POST   | `/movimientos/:id/reprocesar` | Re-ejecuta cascada + IA sobre movimiento existente. Body: `{bypass_catalogo?}` (opcional). Response incluye `ia_disparada: bool`.  |

### CRUD recursos

| Método                | Path                      | Función                                                                                                                    |
| --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET/POST/PATCH/DELETE | `/categorias`             | CRUD categorías                                                                                                            |
| GET                   | `/categorias/:slug/usage` | Counts refs (movimientos/comercios/mcc)                                                                                    |
| GET/POST/PATCH/DELETE | `/patrones`               | CRUD patrones (contiene/regex/prefijo/literal)                                                                             |
| GET/POST/PATCH/DELETE | `/mcc`                    | CRUD MCC mapping                                                                                                           |
| GET/POST/PATCH/DELETE | `/marcas`                 | CRUD marcas conocidas IA                                                                                                   |
| GET/PATCH             | `/comercios`              | Listar paginado + cambio categoría individual                                                                              |
| GET/DELETE            | `/memoria/:usuario`       | Memoria por usuario (transferencias auto-aprendidas). DELETE `/memoria/:usuario/:destinatario` para olvidar una asociación |
| GET/POST/PATCH/DELETE | `/patrones-usuario`       | Reglas personales por usuario (capa 1). `GET /patrones-usuario/:usuario`, `GET /patrones-usuario/:usuario/sugerencias?umbral=N`, `POST` crea, `PATCH /:id` activa/desactiva, `DELETE /:id` |

### Importación bulk

| Método | Path                           | Función                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| POST   | `/catalogo/importar`           | Importa rows a `comercios_catalogo` (chunked, async). Body: `{rows, correr_cascada?}` |
| GET    | `/catalogo/importar/status`    | Estado import                                                                         |
| POST   | `/movimientos/importar`        | Importa rows a `movimientos` ejecutando cascada (async). Body: `{rows, batch_id?}`    |
| GET    | `/movimientos/importar/status` | Estado import                                                                         |

### Recategorización catálogo

| Método | Path                                                         | Función                                                                            |
| ------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| POST   | `/catalogo/recategorizar`                                    | Recategoriza `comercios_catalogo` con cascada actual a columnas shadow (`*_nueva`) |
| GET    | `/catalogo/recategorizar/status`                             | Progreso                                                                           |
| GET    | `/catalogo/recategorizar/comparacion`                        | Totales: match / diff / sin_categoria + top diffs                                  |
| GET    | `/catalogo/recategorizar/diff-detalle?actual=&nueva=&limit=` | Rows diff entre dos categorías                                                     |
| POST   | `/catalogo/aplicar-diff`                                     | Aplica `categoria_nueva_id → categoria_id`                                         |
| POST   | `/catalogo/aplicar-diff-patron`                              | Aplica diff filtrado por patrón                                                    |

### Sugerencias / IA

| Método | Path                               | Función                                                                                                              |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET    | `/patrones/sugerencias`            | Lista sugerencias rule-based desde sin-cat (params: freq_min, pureza_min, longitud_min, impacto_min, categoria_slug) |
| POST   | `/patrones/sugerencias/aplicar`    | Aplica sugerencias seleccionadas                                                                                     |
| POST   | `/patrones/sugerencias-ia/run`     | Dispara run IA iterativo                                                                                             |
| GET    | `/patrones/sugerencias-ia/status`  | Estado run IA                                                                                                        |
| POST   | `/patrones/sugerencias-ia/aplicar` | Aplica sugerencias IA seleccionadas                                                                                  |
| GET    | `/datasets/marcas-candidatas`      | Prefijos frecuentes candidatos a patrón                                                                              |

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
| 0. memoria       | `manual`                   | 1.00       | Lookup `(usuario, clave_normalizada)` en `memoria_usuario_destinatario`. Clave: si nombre es `MANGO-*` usa destinatario; sino usa `nombreComercio` / `nombreBancard` / `descripcion`. Evidencia incluye `memoria_destinatario` (nombre crudo de la clave) |
| 1. patrones-usr  | `regex/literal/contiene/prefijo` | 0.80-0.95 | Reglas personales del usuario (tabla `patrones_usuario`). Solo si `usuario` presente en input. Cache LRU por usuario, TTL 60s             |
| 2. catálogo      | (hereda de la fila stored) | (hereda)   | Hit exacto por `bancard_id + codigo_comercio` o por `nombre_normalizado`. Evidencia: `match_type: 'bancard' \| 'nombre_exacto'`                |
| 3. patrones      | `regex`                    | 0.95       | Patrón tipo regex matchea                                                                                                                     |
| 3. patrones      | `literal`                  | 0.95       | Patrón tipo literal matchea                                                                                                                   |
| 3. patrones      | `contiene`                 | 0.80       | Patrón tipo contiene matchea                                                                                                                  |
| 3. patrones      | `prefijo`                  | 0.90       | Patrón tipo prefijo matchea                                                                                                                   |
| 4. MCC           | `mcc`                      | 0.75       | MCC del input mapeado a categoría no-ambigua                                                                                                  |
| 5. IA fallback   | `ia`                       | 0.50 (cap) | Gemma async (concurrency `OLLAMA_MAX_CONCURRENT`) — `requiere_revision` siempre `true`. Deshabilitable con `IA_ENABLED=false`                 |
| Corrección     | `manual`                   | 1.00       | POST `/movimientos/:id/correccion`. Si hay usuario y se puede derivar una clave (transferencia MANGO o nombre comercio), auto-upsert en `memoria_usuario_destinatario`. Aporta a sugerencias de `patrones_usuario` |

Valores legacy en DB enum (movimientos viejos, no usados por pipeline actual): `bancard` (0.90), `nombre` (0.80), `patrones` (0.90).

**Threshold revisión**: confianza < 0.70 → `requiere_revision=true`.

**Bypass catálogo** (testing): flag `bypass_catalogo=true` salta capa catálogo → fuerza cascada pura.

**IA fire-and-forget**: cuando todas las capas sync devuelven null, response inmediato es null + revisión, y `setImmediate` dispara IA. Cliente debe re-fetchear `/movimientos/:id` después para ver categoría asignada por IA.

---

## Modelo de datos

```sql
categorias       (id uuid PK, slug unique, nombre, descripcion, activo)
patrones         (id, tipo enum [regex|contiene|prefijo|literal], valor,
                  categoria_id FK, prioridad, descripcion, fuente, activo)
mcc_catalogo     (cod_mcc PK, descripcion, categoria_id FK, ambiguo)
comercios_catalogo (id, nombre, nombre_normalizado, bancard_id, codigo_comercio,
                   categoria_id, mcc_original, fuente_categoria,
                   confianza, requiere_revision, evidencia jsonb,
                   marca, mcc_inferido,
                   -- columnas shadow para recategorización:
                   categoria_nueva_id, fuente_nueva, confianza_nueva,
                   evidencia_nueva jsonb, recategorizado_at)
marcas_conocidas (id, marca unique, categoria_id FK, descripcion)
movimientos      (id, descripcion, nombre_comercio, nombre_bancard, mcc, monto,
                  categoria_predicha_id, categoria_confirmada_id,
                  fuente_categoria enum, confianza, requiere_revision,
                  raw_input jsonb, evidencia jsonb,
                  origen, batch_id, bancard_id, codigo_comercio, latency_ms,
                  created_at, updated_at)
correcciones_usuario (id, movimiento_id FK, categoria_anterior_id, categoria_nueva_id,
                      usuario, motivo)
memoria_usuario_destinatario (id, usuario, destinatario, destinatario_normalizado,
                              categoria_id FK, origen, hits,
                              UNIQUE (usuario, destinatario_normalizado))
test_ground_truth (id, batch_id, nombre, nombre_normalizado, bancard_id,
                   codigo_comercio, mcc, combined_mcc, categoria_xlsx,
                   sector_xlsx, cantidad, fuente_origen)
```

Índices clave: `comercios_catalogo (bancard_id, codigo_comercio)` único parcial, `patrones (categoria_id)`, `movimientos (batch_id)`. Ver `src/db/schema/`.

---

## UIs

Todas servidas por mismo Fastify (mismo origen, sin CORS).

| URL                 | Función                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| `/ui/`              | Landing con health + counts                                                        |
| `/ui/categorias/`   | CRUD categorías + patrones + MCC + marcas + comercios                              |
| `/ui/importar/`     | Importa XLSX/CSV a `comercios_catalogo` o `movimientos` con mapping de campos      |
| `/ui/recat/`        | Recategorizar catálogo + ver diffs + aplicar + sugerencias IA + marcas candidatas  |
| `/ui/test-monitor/` | Dashboard tests masivos realtime                                                   |
| `/ui/memoria/`      | Playground end-to-end: crear movimiento, corregir, ver memoria por usuario         |
| `/ui/api/`          | Swagger UI sobre `openapi.yaml` con "Try it out" + Postman collection downloadable |

**Shared layout** (`ui/shared/`):

- `theme.css` — CSS variables, dark theme
- `state.js` — `window.tagger` singleton (apiKey, baseUrl)
- `api.js` — `window.taggerApi(path, opts)` fetch wrapper unificado
- `nav.js` — navbar auto-inyectado con active state + health badge

API key se setea **una vez** en cualquier UI y persiste en localStorage.

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
│   │   ├── routes/         (categorizar, categorias, patrones, mcc, marcas,
│   │   │                    comercios, importar-*, recategorizar-catalogo,
│   │   │                    sugerencias-*, test-batch-*, health, ...)
│   │   ├── schemas/        (zod schemas request/response)
│   │   └── plugins/        (auth API key, request-log)
│   ├── config/             (env zod validation)
│   ├── db/
│   │   ├── client.ts       (Drizzle pool)
│   │   ├── schema/         (tablas Drizzle)
│   │   ├── repos/          (CRUD writers/readers + cache)
│   │   ├── loaders/        (csv stream helper)
│   │   └── migrations/     (drizzle-kit generated)
│   ├── domain/             (types, normalize, brand, confianza)
│   ├── layers/             (memoria, catalogo, patrones, mcc, ia)
│   ├── pipeline/           (categorizar, persistir, ia-fallback)
│   ├── lib/                (ollama client, logger)
│   ├── services/           (recategorizar-catalogo, sugerir-patrones-*)
│   ├── test-batch/         (worker masivo)
│   └── main.ts             (wire-up + listen)
├── ui/
│   ├── index.html          (landing)
│   ├── shared/             (theme + state + api + nav)
│   ├── categorias/         (CRUD + detalle tabs)
│   ├── importar/           (XLSX/CSV → catalogo/movimientos)
│   ├── recat/              (recat + diffs + sugerencias)
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
