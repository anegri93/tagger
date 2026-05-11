# 🏷️ tagger

**Servicio de categorización automática de movimientos bancarios.**

Pipeline en cascada: catálogo precomputado → patrones (regex/contiene/prefijo/literal) → MCC oficial → fallback IA (Gemma vía Ollama).

---

## 📚 Contenido

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
       │ 1. CATÁLOGO  bancard_id+codigo (lookup exacto)│
       │ 2. PATRONES  contiene/regex/prefijo/literal   │
       │ 3. MCC       código mapeado a categoría       │
       │ 4. RESPUESTA inmediata (puede ser null)       │
       │ 5. IA        Gemma async (fire-and-forget)    │
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
  ├─ comercios_catalogo      (bancard_id+codigo, incluye recategorización shadow)
  ├─ marcas_conocidas        (IA hints dinámicos)
  ├─ movimientos             (histórico predicciones)
  └─ correcciones_usuario    (correcciones manual cliente)
```

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Lenguaje | TypeScript strict (NodeNext, exactOptionalPropertyTypes) |
| Runtime | Node.js ≥20 |
| HTTP | Fastify 5 + @fastify/cors + @fastify/static + @fastify/sensible |
| ORM | Drizzle ORM (postgres-js) |
| DB | Postgres 16 |
| Migrations | drizzle-kit |
| Tests | Vitest |
| Validación | Zod |
| Logger | Pino + pino-pretty |
| LLM | Ollama (Gemma) |
| XLSX | xlsx (SheetJS) |
| Build/Dev | tsx + tsc |
| Lint | ESLint + Prettier |
| Package mgr | pnpm 10 |

---

## Quick start

```bash
# 0. Prerequisitos: node >=20, pnpm (corepack enable), docker

# 1. Configurar .env (primer run copia desde .env.example y aborta)
bash start.sh                       # editá .env, especialmente API_KEY

# 2. Levantar todo
bash start.sh                       # postgres + deps + migrate + seed + API
# o con IA fallback:
OLLAMA=1 bash start.sh              # + ollama (descarga modelo on demand)

# 3. Verificar
curl http://localhost:3000/health   # → {"status":"ok"}

# 4. UI
open http://localhost:3000/ui/
```

`start.sh` es idempotente: levanta lo que falte (postgres, deps, migrations, seed), arranca API foreground. `stop.sh` baja todo. `restart.sh` = stop + start.

Datos iniciales (categorías, MCCs, patrones, catálogo de comercios) se cargan vía importador UI en `/ui/importar/`.

---

## API endpoints

### Categorización
| Método | Path | Descripción |
|--------|------|-------------|
| POST | `/categorizar-movimiento` | Categoriza un movimiento. Body: `{descripcion, mcc?, monto?, bancard_id?, codigo_comercio?, bypass_catalogo?, origen?, batch_id?}` |
| GET | `/movimientos/:id` | Detalle movimiento (incluye evidencia IA) |
| POST | `/movimientos/:id/correccion` | Corrección manual usuario |

### CRUD recursos
| Método | Path | Función |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/categorias` | CRUD categorías |
| GET | `/categorias/:slug/usage` | Counts refs (movimientos/comercios/mcc) |
| GET/POST/PATCH/DELETE | `/patrones` | CRUD patrones (contiene/regex/prefijo/literal) |
| GET/POST/PATCH/DELETE | `/mcc` | CRUD MCC mapping |
| GET/POST/PATCH/DELETE | `/marcas` | CRUD marcas conocidas IA |
| GET/PATCH | `/comercios` | Listar paginado + cambio categoría individual |

### Importación bulk
| Método | Path | Función |
|--------|------|---------|
| POST | `/catalogo/importar` | Importa rows a `comercios_catalogo` (chunked, async). Body: `{rows, correr_cascada?}` |
| GET | `/catalogo/importar/status` | Estado import |
| POST | `/movimientos/importar` | Importa rows a `movimientos` ejecutando cascada (async). Body: `{rows, batch_id?}` |
| GET | `/movimientos/importar/status` | Estado import |

### Recategorización catálogo
| Método | Path | Función |
|--------|------|---------|
| POST | `/catalogo/recategorizar` | Recategoriza `comercios_catalogo` con cascada actual a columnas shadow (`*_nueva`) |
| GET | `/catalogo/recategorizar/status` | Progreso |
| GET | `/catalogo/recategorizar/comparacion` | Totales: match / diff / sin_categoria + top diffs |
| GET | `/catalogo/recategorizar/diff-detalle?actual=&nueva=&limit=` | Rows diff entre dos categorías |
| POST | `/catalogo/aplicar-diff` | Aplica `categoria_nueva_id → categoria_id` |
| POST | `/catalogo/aplicar-diff-patron` | Aplica diff filtrado por patrón |

### Sugerencias / IA
| Método | Path | Función |
|--------|------|---------|
| GET | `/patrones/sugerencias` | Lista sugerencias rule-based desde sin-cat (params: freq_min, pureza_min, longitud_min, impacto_min, categoria_slug) |
| POST | `/patrones/sugerencias/aplicar` | Aplica sugerencias seleccionadas |
| POST | `/patrones/sugerencias-ia/run` | Dispara run IA iterativo |
| GET | `/patrones/sugerencias-ia/status` | Estado run IA |
| POST | `/patrones/sugerencias-ia/aplicar` | Aplica sugerencias IA seleccionadas |
| GET | `/datasets/marcas-candidatas` | Prefijos frecuentes candidatos a patrón |

### Test masivo
| Método | Path | Función |
|--------|------|---------|
| POST | `/test-batch/start` | Dispara worker test masivo in-process |
| POST | `/test-batch/stop` | Cancela batch corriendo |
| GET | `/test-batch/list` | Batches activos |
| GET | `/test-batch/:batch_id/stats` | Stats agregadas (latencia, fuente, agreement, mismatches) |

### Salud
| Método | Path | Devuelve |
|--------|------|----------|
| GET | `/health` | `{status:'ok'}` (no requiere auth) |
| GET | `/health/ready` | `{status, db, ollama}` (no requiere auth) |

**Auth**: header `x-api-key: <API_KEY>` excepto `/health*`, `/ui/*`, `/favicon.ico`, `/`.

---

## Cascada categorización

Confianzas asignadas por fuente (constantes en `src/domain/confianza.ts`):

| Capa pipeline | Fuente devuelta | Confianza | Cuándo dispara |
|---------------|-----------------|-----------|----------------|
| 1. catálogo | (hereda de la fila stored) | (hereda) | Hit exacto `bancard_id + codigo_comercio` |
| 2. patrones | `regex` | 0.95 | Patrón tipo regex matchea |
| 2. patrones | `literal` | 0.95 | Patrón tipo literal matchea |
| 2. patrones | `contiene` | 0.90 | Patrón tipo contiene matchea |
| 2. patrones | `prefijo` | 0.90 | Patrón tipo prefijo matchea |
| 3. MCC | `mcc` | 0.75 | MCC mapeado a categoría |
| 4. IA fallback | `ia` | 0.70 (cap) | Gemma async |
| Corrección | `manual` | 1.00 | POST `/movimientos/:id/correccion` |

Valores legacy en DB enum (movimientos viejos, no usados por pipeline actual): `bancard` (0.90), `nombre` (0.80), `patrones` (0.90).

**Threshold revisión**: confianza < 0.70 → `requiere_revision=true`.

**Bypass catálogo** (testing): flag `bypass_catalogo=true` salta capa 1 → fuerza cascada pura.

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
correcciones_usuario (id, movimiento_id FK, categoria_anterior_id, categoria_nueva_id, motivo)
```

Índices clave: `comercios_catalogo (bancard_id, codigo_comercio)` único parcial, `patrones (categoria_id)`, `movimientos (batch_id)`. Ver `src/db/schema/`.

---

## UIs

Todas servidas por mismo Fastify (mismo origen, sin CORS).

| URL | Función |
|-----|---------|
| `/ui/` | Landing con health + counts |
| `/ui/categorias/` | CRUD categorías + patrones + MCC + marcas + comercios |
| `/ui/importar/` | Importa XLSX/CSV a `comercios_catalogo` o `movimientos` con mapping de campos |
| `/ui/recat/` | Recategorizar catálogo + ver diffs + aplicar + sugerencias IA + marcas candidatas |
| `/ui/test-monitor/` | Dashboard tests masivos realtime |

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
```

### Operación
```bash
pnpm dev                        # Hot-reload foreground
pnpm test                       # Vitest run
pnpm test:watch                 # Vitest watch
pnpm lint                       # ESLint
pnpm typecheck                  # tsc --noEmit
pnpm format                     # Prettier write
pnpm test:masivo                # Test masivo CLI
```

### Análisis / utilidades
```bash
node scripts/analyze-test-batch.mjs <batch_id>     # Stats de un batch
node scripts/report-cobertura.mjs                  # Distribución catálogo
node scripts/xlsx-to-tsv.mjs <ruta.xlsx>           # XLSX → TSV
node scripts/export-mcc-mapping.mjs                # Exporta plantilla MCC
node scripts/backfill-gates.mjs                    # Backfill gates
node scripts/validate-phase.mjs                    # Validación fase
node scripts/check-consistency.mjs                 # Consistency check
pnpm tsx scripts/clean-db.ts                       # Limpia DB (idempotente)
pnpm tsx scripts/sync-mcc-tufi.ts                  # Sync MCC desde TuFi
pnpm tsx scripts/aplicar-recat.ts                  # Promueve recat shadow → live
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
│   ├── layers/             (catalogo, patrones, mcc, ia)
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
│   └── test-monitor/       (dashboard masivo realtime)
├── scripts/                (utilidades + análisis)
├── docs/                   (runbook, integration-guide, patrones, histórico)
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
