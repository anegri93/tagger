# 🏷️ tagger

**Servicio de categorización automática de movimientos bancarios paraguayos.**

Pipeline en cascada multi-capa con cache inteligente: catálogo precomputado → reglas regex → lookup bancard → match nombre comercio → MCC oficial → fallback IA (Gemma 2:2b vía Ollama).

Throughput **7.000+ req/s** en hardware dev. Latencia **p99 < 50ms**. Cobertura sync **>99%** sobre 109k comercios reales.

---

## 📚 Tabla de contenidos

- [Arquitectura](#-arquitectura)
- [Stack](#-stack)
- [Quick start](#-quick-start)
- [Servicio web unificado](#-servicio-web-unificado)
- [API endpoints](#-api-endpoints)
- [Cascada categorización](#-cascada-categorización)
- [Modelo de datos](#-modelo-de-datos)
- [Workflow de tareas](#-workflow-de-tareas)
- [Catálogo masivo Bancard](#-catálogo-masivo-bancard-109k-comercios)
- [Gestión categorías via UI](#-gestión-categorías-via-ui)
- [Test interactivo via UI](#-test-interactivo-via-ui)
- [Tests masivos baseline](#-tests-masivos-baseline)
- [Scripts útiles](#-scripts-útiles)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Despliegue Docker](#-despliegue-docker)

---

## 🧱 Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│  Cliente (banco upstream / tester / postman)             │
└──────────────────────┬───────────────────────────────────┘
                       │ POST /categorizar-movimiento
                       │ { nombre_bancard, bancard_id, codigo_comercio, mcc, monto }
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Fastify API (auth API key)                              │
│  ─ schema validation (zod)                               │
│  ─ middleware request-log (pino)                         │
└──────────────────────┬───────────────────────────────────┘
                       │ ejecutarCascada(input, capas)
                       ▼
       ┌───────────────────────────────────────────────┐
       │ 1. CATÁLOGO  bancardId+codigo (lookup directo)│ ← 80% hits
       │ 2. REGEX     reglas DB ordenadas por prioridad│
       │ 3. BANCARD   nombre exacto (legacy)           │
       │ 4. COMERCIO  LIKE nombre_normalizado (≥0.75)  │
       │ 5. MCC       código mapeado a categoría       │
       │ 6. RESPUESTA inmediata (puede ser null)       │
       │ 7. IA        Gemma async (fire-and-forget)    │
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
  ├─ reglas_regex            (patrón → categoría_id)
  ├─ mcc_catalogo            (cod_mcc → categoría_id)
  ├─ comercios_catalogo      (109k entries, bancard_id+codigo unique)
  ├─ marcas_conocidas        (IA hints dinámicos)
  ├─ movimientos             (histórico predicciones)
  └─ correcciones_usuario    (correcciones manual cliente)
```

---

## 🛠 Stack

| Capa | Tecnología |
|------|-----------|
| Lenguaje | TypeScript strict (NodeNext, exactOptionalPropertyTypes) |
| Runtime | Node.js ≥20 |
| HTTP | Fastify 5 + @fastify/cors + @fastify/static |
| ORM | Drizzle ORM (drizzle-orm/node-postgres) |
| DB | Postgres 16 |
| Migrations | drizzle-kit |
| Tests | Vitest |
| Validación | Zod |
| Logger | Pino + pino-pretty |
| LLM | Ollama (Gemma 2:2b) |
| CSV/TSV | csv-parse (sync + stream) |
| XLSX | xlsx (sheetjs) |
| Build/Dev | tsx + tsc |
| Lint | ESLint + Prettier |
| Package mgr | pnpm 10 |

---

## 🚀 Quick start

```bash
# 1. Pre-requisitos
docker --version              # Postgres + Ollama (opcional)
node --version                # >=20
pnpm --version                # corepack enable pnpm

# 2. Instalar deps
pnpm install

# 3. Levantar Postgres + Ollama
docker compose up -d                      # Postgres
docker compose --profile ai up -d ollama  # Ollama opcional

# 4. Configurar .env
cp .env.example .env
# editar API_KEY, DATABASE_URL, OLLAMA_URL

# 5. Migrar + seed
pnpm db:migrate
pnpm db:load:all       # categorias + reglas + mcc + comercios + comercios-bancard

# 6. Levantar API
bash start.sh          # background con .tagger.pid
# o pnpm dev           # foreground hot-reload

# 7. Verificar
curl http://localhost:3000/health
# → {"status":"ok"}

# 8. Abrir UI
open http://localhost:3000     # redirect a landing
```

---

## 🌐 Servicio web unificado

Todas las UIs servidas por el mismo servidor Fastify en mismo origen (sin CORS, mismo localStorage):

| URL | Función |
|-----|---------|
| `/` | Redirect → `/ui/` |
| `/ui/` | Landing con health + counts + cards de navegación |
| `/ui/categorias/` | CRUD categorías + reglas + MCC + marcas + comercios |
| `/ui/tester/` | Tester de movimientos uno a uno |
| `/ui/test-monitor/` | Dashboard tests masivos realtime |
| `/ui/tasks/` | Dashboard fases/tareas del proyecto |

**Shared layout** (`ui/shared/`):
- `theme.css` — CSS variables, dark theme GitHub-like
- `state.js` — `window.tagger` singleton (apiKey, baseUrl, sync entre tabs vía `storage` event)
- `api.js` — `window.taggerApi(path, opts)` fetch wrapper unificado con auth + errors
- `nav.js` — navbar auto-inyectado con active state + health badge live (10s polling)

API key se setea **una vez** en cualquier UI y persiste en localStorage compartido. Cambios sincronizan a otros tabs abiertos automáticamente.

---

## 🔌 API endpoints

### Categorización
| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/categorizar-movimiento` | Categoriza un movimiento. Body: `{nombre_bancard?, bancard_id?, codigo_comercio?, mcc?, monto?, descripcion?, bypass_catalogo?, origen?, batch_id?}` |
| GET | `/movimientos/:id` | Detalle movimiento (incluye evidencia IA) |
| POST | `/movimientos/:id/correccion` | Corrección manual usuario |

### CRUD recursos
| Método | Path | Función |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/categorias` | CRUD categorías |
| GET | `/categorias/:slug/usage` | Counts refs (movimientos/reglas/mcc/comercios) |
| GET/POST/PATCH/DELETE | `/reglas` | CRUD reglas regex |
| POST | `/reglas/test` | Probar `{patron, texto}` → `{match: bool}` |
| GET/POST/PATCH/DELETE | `/mcc` | CRUD MCC mapping |
| GET/POST/PATCH/DELETE | `/marcas` | CRUD marcas conocidas IA |
| GET/PATCH | `/comercios` | Listar paginado + cambio categoría individual |

### Operaciones
| Método | Path | Función |
|--------|------|---------|
| POST | `/catalogo/reprocess` | Re-procesa catálogo masivo (loader Bancard) |
| GET | `/catalogo/reprocess/status` | Progreso reproceso |
| POST | `/test-batch/start` | Dispara worker test masivo in-process |
| POST | `/test-batch/stop` | Cancela batch corriendo |
| GET | `/test-batch/list` | Batches activos |
| GET | `/test-batch/:batch_id/stats` | Stats agregadas (latencia, fuente, agreement, mismatches) |

### Salud
| Método | Path | Devuelve |
|--------|------|----------|
| GET | `/health` | `{status:'ok'}` (no requiere auth) |
| GET | `/health/ready` | `{status, db, ollama}` (no requiere auth) |

**Auth**: header `x-api-key: <API_KEY>` excepto `/health*`, `/ui/*`, `/`.

---

## 🔁 Cascada categorización

Confianzas asignadas por capa (constantes en `src/domain/confianza.ts`):

| Fuente | Confianza | Cuándo dispara |
|--------|-----------|----------------|
| `regex` | 0.95 | Patrón regex DB matchea texto |
| `bancard` | 0.90 | Match exacto en `nombre_bancard` (legacy) |
| `nombre` | 0.80 | LIKE en `nombre_normalizado` (≥0.75 score) |
| `mcc` | 0.75 | MCC mapeado a categoría |
| `mcc` (inferido) | 0.60 | Heredado de marca hermana (sucursales) |
| `ia` | 0.70 (cap) | Gemma fallback (puede devolver más, pero techo 0.70) |
| `manual` | 1.00 | Corrección usuario |

**Threshold revisión**: confianza < 0.70 → `requiere_revision=true`.

**Bypass catálogo** (testing): flag `bypass_catalogo=true` salta capa 1 → fuerza cascada pura.

**IA fire-and-forget**: cuando todas las capas sync devuelven null, response inmediato es null + revisión, y `setImmediate` dispara IA. Cliente debe re-fetchear `/movimientos/:id` después para ver categoría asignada por IA.

---

## 🗃 Modelo de datos

```sql
categorias       (id uuid PK, slug unique, nombre, descripcion, activo)
reglas_regex     (id, patron, categoria_id FK, prioridad, activo)
mcc_catalogo     (cod_mcc PK, descripcion, categoria_id FK, ambiguo)
comercios_catalogo (id, nombre, nombre_normalizado, bancard_id, codigo_comercio,
                   categoria_id, mcc, mcc_original, fuente_categoria,
                   confianza, requiere_revision, evidencia jsonb,
                   marca, mcc_inferido)
marcas_conocidas (id, marca unique, categoria_id FK, descripcion)
movimientos      (id, descripcion, nombre_comercio, nombre_bancard, mcc, monto,
                  categoria_predicha_id, categoria_confirmada_id,
                  fuente_categoria enum, confianza, requiere_revision,
                  raw_input jsonb, evidencia jsonb,
                  origen, batch_id, bancard_id, codigo_comercio, latency_ms,
                  created_at, updated_at)
correcciones_usuario (id, movimiento_id FK, categoria_anterior_id, categoria_nueva_id, motivo)
```

Índices clave: `comercios_catalogo (bancard_id, codigo_comercio)` único parcial, `nombre_normalizado` GiST-like, `requiere_revision` parcial. Ver `src/db/schema/`.

---

## 📋 Workflow de tareas

Sistema atómico con **3 gates** por tarea (consistency → lint → test) antes de avanzar.

```bash
# Ver siguiente disponible
pnpm tasks:next

# Iniciar tarea (marca in_progress, valida deps)
node scripts/start-task.mjs T1801

# Implementar...

# Verificar + cerrar (corre 3 gates)
node scripts/check-task.mjs T1801

# Si gate falla → estado intacto, fix obligatorio
```

**Reglas:**
- Solo 1 tarea `in_progress` a la vez
- No avanza si dependencias `pending`
- Falla cualquier gate → estado no cambia (jamás skip)
- Última tarea de fase → auto-valida fase

| Comando | Acción |
|---------|--------|
| `next-task.mjs` | Imprime siguiente tarea disponible |
| `start-task.mjs <ID>` | Marca `in_progress`, valida deps, sync TASKS.md |
| `check-task.mjs <ID>` | Corre 3 gates; pasa → done + sync; falla → intacto |
| `validate-phase.mjs <PHASE>` | Validación final fase |
| `sync-tasks.mjs` | Regenera `TASKS.md` + `ui/tasks/tasks.data.js` desde JSON |
| `check-consistency.mjs` | Valida JSON, IDs únicos, deps, ciclos, sync con MD |

**Source de verdad**: [`tasks.json`](./tasks.json). **Vista MD**: [`TASKS.md`](./TASKS.md). **Dashboard**: `/ui/tasks/`.

### Gates

| Gate | Comando |
|------|---------|
| consistency | `pnpm check:consistency` |
| lint | `pnpm lint && pnpm typecheck` |
| test | `pnpm test` |

---

## 📦 Catálogo masivo Bancard (109k comercios)

Pipeline para pre-categorizar dataset completo de comercios Bancard:

### Workflow paso a paso

```bash
# 1. Convertir xlsx → TSV (descarta hojas basura)
node scripts/xlsx-to-tsv.mjs "/ruta/Comercios pagados por QR.xlsx"
#   → data/mcc-general.tsv (541 MCCs oficiales)
#   → data/comercios-bancard-raw.tsv (108.982 filas)

# 2. Cargar MCCs oficiales a DB
pnpm db:load:mcc-general
#   → 170 MCCs únicos en mcc_catalogo (sin categoria_id aún)

# 3. Exportar plantilla mapeo MCC → categoría
node scripts/export-mcc-mapping.mjs
#   → data/mcc-categoria-mapping.tsv (170 filas)

# 4. EDITAR data/mcc-categoria-mapping.tsv manualmente
#    Llenar columna categoria_slug (ver lista slugs disponibles abajo)
#    Idempotente: re-correr export preserva slugs ya editados.

# 5. Aplicar mapeo
pnpm db:load:mcc-categoria
#   → UPDATE mcc_catalogo.categoria_id desde plantilla

# 6. (Opcional) Agregar MCCs faltantes en data/mcc-extras.tsv
pnpm db:load:mcc-extras

# 7. Preprocess Bancard: split MANGO P2P + dedup + brand inference
pnpm tsx scripts/preprocess-bancard.ts
#   → data/mango-p2p.tsv (60k transferencias)
#   → data/comercios-bancard-staged.tsv (49k comercios + columna marca + mcc_inferido)

# 8. Loader masivo MANGO P2P (categoría=transferencia)
pnpm db:load:mango-p2p
#   → ~60k filas en comercios_catalogo

# 9. Loader masivo comercios con cascada
pnpm db:load:comercios-bancard-masivo
#   → ~49k filas con categoría asignada (regex/mcc/nombre/fallback)

# 10. Reporte cobertura
node scripts/report-cobertura.mjs
#    → distribución por fuente, % requiere_revision, top categorías,
#      MCCs sin mapeo (priorizar manualmente)
```

### Slugs disponibles
```
alimentacion · supermercado · combustible · farmacia · restaurante
transporte · salud · educacion · hogar · servicios · entretenimiento
ropa · tecnologia · viajes · financiero · azar · transferencia · otros
```

Más slugs: agregar en `src/db/loaders/categorias.ts` o vía UI `/ui/categorias/`.

### Inferencia por marca

`scripts/preprocess-bancard.ts` extrae `brand_key` del nombre (ej. `BRISTOL-YPANE` → `BRISTOL`), agrupa hermanos y propaga MCC ganador a sucursales sin rubro. Ej: 65 sucursales BRISTOL sin MCC heredan `5399 → ropa` (confianza 0.60 + requiere_revision).

### Reproceso desde UI

```
http://localhost:3000/ui/categorias/  → botón "Re-procesar catálogo"
```

Endpoint: `POST /catalogo/reprocess { truncate_first?: bool }`. Estado en `GET /catalogo/reprocess/status`. Solo 1 reproceso simultáneo (mutex).

---

## 🗂 Gestión categorías via UI

UI completa CRUD para categorías + reglas regex + MCC + marcas IA + comercios. Persistencia que sobrevive re-deploys.

### URLs

- **Lista**: http://localhost:3000/ui/categorias/
- **Detalle**: http://localhost:3000/ui/categorias/detalle.html?slug=mascotas
- Tabs: **Info** | **Reglas** | **MCCs** | **Marcas** | **Comercios**

### Cobertura de los 8 pasos manuales

Cuando creás una categoría desde UI, el sistema cubre automáticamente:

| Paso | Cobertura |
|------|-----------|
| 1. Editar seed | ✅ persiste a `data/categorias-extras.tsv` |
| 2. Cargar a DB | ✅ POST /categorias inserta directo |
| 3. Reglas regex | ✅ tab Reglas + persistencia `data/reglas-extras.tsv` |
| 4. MCC mapping | ✅ tab MCCs + persistencia `data/mcc-extras.tsv` |
| 5. Re-procesar catálogo | ✅ botón global → POST /catalogo/reprocess |
| 6. IA Gemma | ✅ auto: lee categorías + marcas DB con cache 60s |
| 7. MARCAS_PY prompt | ✅ tabla `marcas_conocidas` → IA prompt dinámico |
| 8. Tester dropdown | ✅ GET /categorias auto |

Tab **Comercios** (P20): tabla paginada con búsqueda + dropdown cambio categoría inline → fuente='manual', confianza=1.00.

Ver `docs/categorias-e2e.md` para workflow completo de verificación.

---

## 🧪 Test interactivo via UI

### Tester (1 a 1)

```
http://localhost:3000/ui/tester/
```

Form con campos `descripcion / nombre_comercio / nombre_bancard / mcc / bancard_id / codigo_comercio / monto`. Submit → POST `/categorizar-movimiento` → ver fuente, confianza, evidencia. Historial localStorage. Botón "Marcar incorrecto" → POST `/movimientos/:id/correccion`.

### Monitor masivo (109k vía UI)

```
http://localhost:3000/ui/test-monitor/
```

| Botón | Función |
|-------|---------|
| ▶ Run | Dispara worker in-process. Form: batch_id, limit, concurrency, bypass_catalogo |
| ■ Stop | Cancela worker activo |
| 👁 Monitor | Solo polea stats existentes (sin lanzar) |
| ⏸ Pause poll | Detiene refresh sin cancelar worker |

Worker ejecuta cascada **directo** (sin loopback HTTP). Mide latencia pipeline puro. Persiste con `origen='test_masivo'` + `batch_id` (filtrable en SQL).

Para test "vía HTTP real" (con red/auth/serialize) usar CLI:

```bash
pnpm test:masivo --batch-id baseline-cli --concurrency 30
# Output: data/test-results-baseline-cli.ndjson
```

Cleanup batch viejo:
```sql
DELETE FROM movimientos WHERE batch_id = 'mi-batch';
-- O truncate completo si DB es de pruebas:
TRUNCATE movimientos RESTART IDENTITY CASCADE;
```

---

## 📈 Tests masivos baseline

3 baselines documentados en `docs/`:

| Baseline | Modo | Throughput | p99 latencia | Agreement |
|----------|------|-----------|--------------|-----------|
| v2 | con catálogo (pre-fix) | 2.051 req/s | 48ms | 99.87% (145 mismatches) |
| v3 | con catálogo (post-P16 fix) | 7.177 req/s | 3ms | 100% (tautológico) |
| **v4** | **bypass catálogo** | **1.434 req/s** | **49ms** | **98.16% (1.999 mismatches reales)** |

**Lectura**:
- v3 = catálogo da 6x throughput + 22x mejor latencia + 1.84pp más precisión vs cascada pura
- v4 = test honesto: 98.16% accuracy real (cascada sin "trampa" del cache)

**Producción**: catálogo activo. **Validación periódica**: bypass para detectar regresiones cascada.

---

## 🛠 Scripts útiles

### DB / loaders
```bash
pnpm db:generate                      # Drizzle migrations desde schema
pnpm db:migrate                       # Aplicar migrations
pnpm db:studio                        # Drizzle Studio (GUI tablas)
pnpm db:load:all                      # Seed completo
pnpm db:load:categorias               # Solo categorías base
pnpm db:load:categorias-extras        # Categorías agregadas via UI
pnpm db:load:reglas                   # Reglas regex base
pnpm db:load:reglas-extras            # Reglas agregadas via UI
pnpm db:load:mcc                      # MCC con mapping JSON viejo
pnpm db:load:mcc-general              # MCCs oficiales (de xlsx)
pnpm db:load:mcc-categoria            # Aplica plantilla mapeo
pnpm db:load:mcc-extras               # MCCs faltantes manuales
pnpm db:load:marcas                   # Seed marcas conocidas (IA)
pnpm db:load:comercios-bancard-masivo # Loader masivo cascada
pnpm db:load:mango-p2p                # 60k transferencias MANGO
```

### Análisis y reportes
```bash
node scripts/report-cobertura.mjs                  # Distribución catálogo
node scripts/analyze-test-batch.mjs <batch_id>     # Stats batch test
```

### Conversión datos
```bash
node scripts/xlsx-to-tsv.mjs <ruta.xlsx>           # Excel Bancard → TSV
node scripts/export-mcc-mapping.mjs                # Exporta plantilla MCC
pnpm tsx scripts/preprocess-bancard.ts             # Split + dedup + brand
```

### Operación
```bash
bash start.sh           # Levantar API en background
bash stop.sh            # Detener
bash restart.sh         # Reiniciar
tail -f .tagger.log     # Ver logs
pnpm dev                # Hot-reload foreground
pnpm test               # Vitest run
pnpm test:watch         # Vitest watch
pnpm lint               # ESLint
pnpm typecheck          # tsc --noEmit
pnpm format             # Prettier write
```

---

## 📁 Estructura del proyecto

```
tagger/
├── src/
│   ├── api/
│   │   ├── routes/         (categorizar, categorias, reglas, mcc, marcas,
│   │   │                    comercios, catalogo, test-batch-*, health, ...)
│   │   ├── schemas/        (zod schemas request/response)
│   │   └── plugins/        (auth API key, request-log)
│   ├── config/             (env zod validation)
│   ├── db/
│   │   ├── client.ts       (Drizzle pool)
│   │   ├── schema/         (tablas Drizzle)
│   │   ├── repos/          (CRUD writers/readers + cache)
│   │   ├── loaders/        (CSV/TSV → DB con upsert + streaming + batches)
│   │   └── migrations/     (drizzle-kit generated)
│   ├── domain/             (types, normalize, brand, confianza)
│   ├── layers/             (regex, bancard, comercio, mcc, ia, catalogo)
│   ├── pipeline/           (categorizar, persistir, ia-fallback, cascada-catalogo)
│   ├── lib/                (ollama client, logger)
│   ├── test-batch/         (worker masivo + catálogo runner)
│   └── main.ts             (wire-up + listen)
├── ui/
│   ├── index.html          (landing)
│   ├── shared/             (theme + state + api + nav)
│   ├── categorias/         (CRUD + detalle tabs)
│   ├── tester/             (movimiento 1 a 1)
│   ├── test-monitor/       (dashboard masivo realtime)
│   └── tasks/              (dashboard tareas proyecto)
├── data/                   (TSV/CSV seeds + extras + xlsx convertidos)
├── scripts/                (loaders + workflow tareas + análisis)
├── docs/                   (baselines, e2e, decisiones)
├── tasks.json              (source verdad fases/tareas)
├── TASKS.md                (vista markdown auto-generada)
├── docker-compose.yml      (Postgres + Ollama)
├── Dockerfile              (build prod)
└── start.sh / stop.sh / restart.sh
```

---

## 🐳 Despliegue Docker

```bash
docker compose up -d                       # Solo Postgres
docker compose --profile ai up -d          # + Ollama Gemma 2:2b
docker compose logs -f tagger              # ver logs API (si está en compose)
```

`docker-compose.yml` define:
- `postgres` con healthcheck + volumen
- `ollama` con profile `ai` (opcional, descarga modelo on-start)

---

## 🤝 Contribuir

1. Fork
2. Crear fase nueva en `tasks.json` con tareas atómicas
3. `node scripts/start-task.mjs <ID>` → implementar → `check-task.mjs <ID>`
4. Commit con mensaje `task(<ID>): <title>`
5. PR al branch principal

Reglas:
- TypeScript strict, sin `any`
- Tests vitest para toda lógica nueva
- 3 gates limpios antes de cerrar tarea
- No skip de gates jamás

---

## 📜 Licencia

Privado. Mango Apps Paraguay.
