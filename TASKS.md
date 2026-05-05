# tagger — Tareas

> Servicio categorización gastos. Cascada regex→Bancard→comercio→MCC→IA(Gemma).

**Stack:** TypeScript, Node, Fastify, Drizzle, Postgres, Vitest, Ollama

**Progreso global:** 115/129 (89%)

## Reglas

- Cada tarea atómica. Una responsabilidad.
- No avanzar a siguiente tarea sin pasar 3 gates: test, lint, consistency.
- Cada tarea = commit. Mensaje: 'task(<id>): <title>'.
- Si gate falla, fix antes seguir. Nunca skip.
- Tareas en fase PNH (nice-to-have) NO bloquean MVP. Atacar después de completar P0-P10.

## Gates obligatorios por tarea

| Gate | Comando |
|------|---------|
| test | `pnpm test` |
| lint | `pnpm lint && pnpm typecheck` |
| consistency | `pnpm check:consistency` |

## Estados

- ⬜ pending
- 🟡 in_progress
- ✅ done
- 🛑 blocked

## P0 — Bootstrap repo (9/9)

### ✅ T001 — Init package.json + pnpm

**Detalle:**
- pnpm init
- Set name=tagger, type=module, engines.node>=20
- Add scripts placeholders: dev, build, test, lint, typecheck, check:consistency

**Archivos:** `package.json`, `.nvmrc`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T002 — TypeScript config strict _deps: T001_

**Detalle:**
- Install typescript, @types/node, tsx
- tsconfig.json strict=true, noUncheckedIndexedAccess, target ES2022, module NodeNext
- Add typecheck script: tsc --noEmit

**Archivos:** `tsconfig.json`, `src/index.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T003 — ESLint + Prettier _deps: T002_

**Detalle:**
- Install eslint, @typescript-eslint, eslint-config-prettier, prettier
- eslint.config.js flat config, rules: no-unused-vars error, no-explicit-any warn
- .prettierrc: singleQuote, trailingComma all, printWidth 100

**Archivos:** `eslint.config.js`, `.prettierrc`, `.prettierignore`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T004 — Vitest setup _deps: T002_

**Detalle:**
- Install vitest, @vitest/coverage-v8
- vitest.config.ts: globals true, env node, coverage v8
- Add scripts: test, test:watch, test:cov

**Archivos:** `vitest.config.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T005 — Folder layout src/ _deps: T002_

**Detalle:**
- Create: src/{db,domain,pipeline,layers,api,lib,config}
- Each folder index.ts barrel placeholder
- Add README mini en cada carpeta explicando rol (1 línea)

**Archivos:** `src/**`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T006 — Env loader + zod schema _deps: T005_

**Detalle:**
- Install dotenv, zod
- src/config/env.ts: schema con DATABASE_URL, OLLAMA_URL, OLLAMA_MODEL, API_KEY, PORT, NODE_ENV, CONFIDENCE_THRESHOLD
- Parse process.env, throw if invalid
- .env.example commiteado

**Archivos:** `src/config/env.ts`, `.env.example`, `.gitignore`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T007 — Logger pino _deps: T006_

**Detalle:**
- Install pino, pino-pretty
- src/lib/logger.ts: pino instance, pretty en dev, json en prod
- Test: logger.info debe no throw

**Archivos:** `src/lib/logger.ts`, `src/lib/logger.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T008 — Script consistencia inicial _deps: T001_

**Detalle:**
- scripts/check-consistency.mjs
- Verifica: tasks.json válido JSON, todos task.depends_on existen, IDs únicos, no ciclos
- Verifica: TASKS.md regenerado coincide con tasks.json (sync)
- Exit 1 si falla

**Archivos:** `scripts/check-consistency.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T009 — Script sync TASKS.md _deps: T001_

**Detalle:**
- scripts/sync-tasks.mjs: lee tasks.json y regenera TASKS.md
- Genera ui/tasks.data.js pa dashboard
- Agrega script pnpm tasks:sync

**Archivos:** `scripts/sync-tasks.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

## P1 — Docker infra (2/2)

### ✅ T101 — Dockerfile API _deps: T005_

**Detalle:**
- Multi-stage: base node:20-alpine, deps, build, runtime
- Final image solo dist + node_modules prod
- Expose PORT, CMD node dist/api/server.js

**Archivos:** `Dockerfile`, `.dockerignore`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T102 — docker-compose.yml _deps: T101_

**Detalle:**
- Servicios: api, postgres:16, ollama (opt profile 'ai')
- Volúmenes: pgdata, ollama_models
- Healthcheck postgres
- depends_on con condition: service_healthy

**Archivos:** `docker-compose.yml`

**Gates:** consistency ✅  lint ✅  test ✅

## P2 — DB schema (Drizzle) (10/10)

### ✅ T201 — Install Drizzle + pg _deps: T006_

**Detalle:**
- Install drizzle-orm pg, drizzle-kit
- src/db/client.ts: pool postgres, drizzle instance
- drizzle.config.ts apuntando a src/db/schema/*

**Archivos:** `src/db/client.ts`, `drizzle.config.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T202 — Schema categorias _deps: T201_

**Detalle:**
- src/db/schema/categorias.ts
- Cols: id (uuid pk), slug (text unique), nombre, descripcion, activo (bool default true), created_at, updated_at
- Test: insert + select

**Archivos:** `src/db/schema/categorias.ts`, `src/db/schema/categorias.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T203 — Schema reglas_regex _deps: T202_

**Detalle:**
- Cols: id uuid pk, patron text not null, categoria_id fk categorias, prioridad int default 100, activo bool, descripcion, created_at, updated_at
- Index (activo, prioridad)

**Archivos:** `src/db/schema/reglas_regex.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T204 — Schema comercios_catalogo _deps: T202_

**Detalle:**
- Cols: id uuid pk, nombre text, nombre_bancard text, nombre_normalizado text, categoria_id fk, mcc text nullable, created_at, updated_at
- Index unique (nombre_bancard) where not null
- Index (nombre_normalizado)

**Archivos:** `src/db/schema/comercios_catalogo.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T205 — Schema mcc_catalogo _deps: T202_

**Detalle:**
- Cols: cod_mcc text pk, cod_rubro text, desc_rubro text, descripcion text, categoria_id fk nullable, ambiguo bool default false
- Campo source pa trazabilidad

**Archivos:** `src/db/schema/mcc_catalogo.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T206 — Schema movimientos _deps: T202_

**Detalle:**
- Cols: id uuid pk, descripcion text, nombre_comercio text, nombre_bancard text, mcc text, monto numeric(18,2), categoria_predicha_id fk nullable, categoria_confirmada_id fk nullable, fuente_categoria enum(regex,bancard,nombre,mcc,ia,manual) nullable, confianza numeric(3,2), requiere_revision bool default false, raw_input jsonb, created_at, updated_at
- Index (created_at), (requiere_revision)

**Archivos:** `src/db/schema/movimientos.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T206b — Campo evidencia en movimientos _deps: T206_

**Detalle:**
- Agregar columna evidencia jsonb nullable a movimientos
- Estructura: { regla_id?, comercio_id?, mcc_match?, ia_prompt?, ia_response? } según fuente
- Permite auditar por qué se categorizó así

**Archivos:** `src/db/schema/movimientos.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T207 — Schema correcciones_usuario _deps: T206_

**Detalle:**
- Cols: id uuid pk, movimiento_id fk, categoria_anterior_id fk nullable, categoria_nueva_id fk, usuario text nullable, motivo text nullable, created_at

**Archivos:** `src/db/schema/correcciones_usuario.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T208 — Migración inicial _deps: T206b, T207_

**Detalle:**
- drizzle-kit generate
- Verificar SQL output limpio
- Script pnpm db:migrate (drizzle-kit migrate)

**Archivos:** `src/db/migrations/**`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T209 — Seed categorías default _deps: T208_

**Detalle:**
- scripts/seed-categorias.ts
- Insert: alimentacion, supermercado, combustible, farmacia, restaurante, transporte, salud, educacion, hogar, servicios, entretenimiento, ropa, tecnologia, viajes, financiero, otros
- Idempotente (on conflict do nothing)

**Archivos:** `scripts/seed-categorias.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P3 — Dominio + normalización (3/3)

### ✅ T301 — Tipos dominio _deps: T206b_

**Detalle:**
- src/domain/types.ts
- MovimientoInput, MovimientoCategorizado, FuenteCategoria union, ResultadoCapa { categoriaId, confianza, fuente, evidencia }

**Archivos:** `src/domain/types.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T302 — Normalizador texto _deps: T301_

**Detalle:**
- src/domain/normalize.ts: uppercase, strip acentos, colapsar espacios, trim, remove puntuación irrelevante
- Tests: 'Biggie  S.A.' → 'BIGGIE SA', acentos, ñ preserva, números preservan

**Archivos:** `src/domain/normalize.ts`, `src/domain/normalize.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T303 — Constantes confianza _deps: T301_

**Detalle:**
- src/domain/confianza.ts: REGEX=0.95, BANCARD=0.90, NOMBRE=0.80, MCC=0.75, IA_MAX=0.70, THRESHOLD_REVISION=0.70
- Frozen const objects

**Archivos:** `src/domain/confianza.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P4 — Capas categorización (6/6)

### ✅ T401 — Capa regex _deps: T203, T302, T303_

**Detalle:**
- src/layers/regex.ts: clase/función que carga reglas activas ordenadas por prioridad, prueba patron contra texto normalizado
- Cache reglas en memoria con TTL 60s + invalidación manual
- Devuelve evidencia { regla_id, patron }
- Tests: match BIGGIE → supermercado, no match → null, prioridad respetada

**Archivos:** `src/layers/regex.ts`, `src/layers/regex.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T402 — Capa Bancard _deps: T204, T302_

**Detalle:**
- src/layers/bancard.ts: lookup exacto por nombre_bancard normalizado
- Devuelve evidencia { comercio_id, nombre_bancard }
- Tests: hit, miss, normalización aplicada antes lookup

**Archivos:** `src/layers/bancard.ts`, `src/layers/bancard.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T403 — Capa nombre comercio _deps: T204, T302_

**Detalle:**
- src/layers/comercio.ts: match por nombre_normalizado (LIKE/contains o trigram)
- Devuelve evidencia { comercio_id, match_type, score }
- Tests: match parcial, multiple matches → tomar mejor (más larga coincidencia)

**Archivos:** `src/layers/comercio.ts`, `src/layers/comercio.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T404 — Capa MCC _deps: T205_

**Detalle:**
- src/layers/mcc.ts: lookup cod_mcc en mcc_catalogo, devolver categoria si no ambiguo
- Si ambiguo=true → null (forzar IA)
- Tests: hit, ambiguo, no encontrado

**Archivos:** `src/layers/mcc.ts`, `src/layers/mcc.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T405 — Cliente Ollama _deps: T006_

**Detalle:**
- src/lib/ollama.ts: fetch a OLLAMA_URL/api/generate, modelo gemma2:2b
- Timeout 15s, retry 1, structured output prompt
- Tests con mock fetch

**Archivos:** `src/lib/ollama.ts`, `src/lib/ollama.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T406 — Capa IA _deps: T405, T303_

**Detalle:**
- src/layers/ia.ts: prompt con categorías activas + descripción movimiento, parsea JSON respuesta {categoria, confianza}
- Validar que categoría exista en DB, sino null
- Confianza max IA_MAX (0.70)
- Tests con cliente Ollama mockeado

**Archivos:** `src/layers/ia.ts`, `src/layers/ia.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P5 — Pipeline orquestador (4/4)

### ✅ T501 — Pipeline cascada síncrona _deps: T401, T402, T403, T404_

**Detalle:**
- src/pipeline/categorizar.ts: ejecuta regex→bancard→comercio→mcc, devuelve primer match
- Si ninguna capa síncrona acierta → marcar requiere_revision=true
- Tests con stubs por capa

**Archivos:** `src/pipeline/categorizar.ts`, `src/pipeline/categorizar.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T501b — IA fallback fire-and-forget _deps: T501, T406_

**Detalle:**
- src/pipeline/ia-fallback.ts: si pipeline síncrono falla, dispara llamada IA sin await
- Función schedule(movimientoId): setImmediate → ejecuta capa IA → update movimiento.categoria_predicha + fuente=ia + confianza + evidencia
- Errores logged, no throw al caller
- Tests verifican no bloquea respuesta y eventualmente actualiza DB

**Archivos:** `src/pipeline/ia-fallback.ts`, `src/pipeline/ia-fallback.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T502 — Persistencia movimiento _deps: T501, T206b_

**Detalle:**
- src/pipeline/persistir.ts: insert movimiento con resultado pipeline + evidencia
- Si confianza < THRESHOLD → requiere_revision=true
- Idempotencia opcional por hash(descripcion+monto+fecha) — diferir a V2
- Tests: insert ok, flag revision correcto

**Archivos:** `src/pipeline/persistir.ts`, `src/pipeline/persistir.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T503 — Test E2E pipeline _deps: T501b, T502_

**Detalle:**
- src/pipeline/e2e.test.ts: usa DB de test real (testcontainers o postgres test)
- Casos: input matchea regex → categorizado regex; input solo MCC → categorizado mcc; input nada → requiere_revision + IA dispara async
- Verifica row en DB final correcta

**Archivos:** `src/pipeline/e2e.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P6 — API HTTP (9/9)

### ✅ T601 — Fastify server skeleton _deps: T007_

**Detalle:**
- Install fastify @fastify/sensible
- src/api/server.ts: build() devuelve instance, start() listen
- Healthcheck GET /health → {status:ok}
- Tests con inject

**Archivos:** `src/api/server.ts`, `src/api/server.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T601b — Healthcheck profundo _deps: T601, T201_

**Detalle:**
- GET /health/ready: pinga DB (select 1), opcional Ollama reachable (HEAD /api/tags)
- Devuelve { db: ok|fail, ollama: ok|skip|fail, status: ok|degraded }
- 200 si todo ok, 503 si DB falla

**Archivos:** `src/api/routes/health.ts`, `src/api/routes/health.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T602 — Auth middleware api-key _deps: T601_

**Detalle:**
- src/api/plugins/auth.ts: hook onRequest, lee header x-api-key, compara con env API_KEY (timing-safe)
- 401 si falla. Skip /health, /health/ready
- Tests: ok, missing, wrong

**Archivos:** `src/api/plugins/auth.ts`, `src/api/plugins/auth.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T603 — Schema zod request/response _deps: T301_

**Detalle:**
- src/api/schemas/categorizar.ts: zod schema input (descripcion, nombre_comercio, nombre_bancard, mcc, monto)
- Output: movimiento_id, categoria, fuente, confianza, requiere_revision

**Archivos:** `src/api/schemas/categorizar.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T604 — POST /categorizar-movimiento _deps: T502, T501b, T602, T603_

**Detalle:**
- src/api/routes/categorizar.ts: valida con zod, llama pipeline, persiste, dispara IA fallback si aplica, devuelve respuesta
- Errores: 400 input inválido, 500 unexpected (loggea no expone)
- Tests integración con DB de test

**Archivos:** `src/api/routes/categorizar.ts`, `src/api/routes/categorizar.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T605 — GET /movimientos/:id _deps: T604_

**Detalle:**
- Lookup por id, incluye evidencia
- 404 si no existe
- Tests

**Archivos:** `src/api/routes/movimiento-get.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T606 — POST /movimientos/:id/correccion _deps: T605, T207_

**Detalle:**
- Body: { categoria_id_nueva, motivo? }
- Update movimientos.categoria_confirmada_id + insert correcciones_usuario
- Tests

**Archivos:** `src/api/routes/correccion.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T607 — GET /categorias _deps: T602, T202_

**Detalle:**
- Lista categorías activas
- Necesario pa prompt IA y validaciones
- POST/PATCH se difieren a PNH (gestionar via SQL inicialmente)

**Archivos:** `src/api/routes/categorias.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T610 — Wire-up adapters Drizzle + montar rutas _deps: T607, T606, T605, T604, T601b, T901_

**Detalle:**
- src/db/repos/*.ts: implementaciones concretas de las interfaces (ReglasLoader, BancardLookup, ComercioLookup, MccLookup, MovimientoRepository, MovimientoReader, MovimientoUpdater, CategoriasLoader, CategoriasReader, CorreccionService)
- main.ts compone deps: db client → repos → capas → pipeline → ia-fallback → rutas
- Registra plugins en orden: requestLog → auth → todas las rutas
- Health excluido de auth (ya en lista skip)
- Tests integración mínimos por adapter usando mocks de drizzle

**Archivos:** `src/db/repos/categorias.ts`, `src/db/repos/reglas.ts`, `src/db/repos/comercios.ts`, `src/db/repos/mcc.ts`, `src/db/repos/movimientos.ts`, `src/db/repos/correccion.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P8 — Seeds + datasets (4/4)

### ✅ T801 — Loader MCC desde CSV _deps: T205_

**Detalle:**
- scripts/seed-mcc.ts: lee data/mcc.csv (Cód.Rubro, Desc.Rubro, Cód.MCC, Descripción)
- Mapeo manual mcc→categoria en data/mcc-mapping.json
- Insert idempotente

**Archivos:** `scripts/seed-mcc.ts`, `data/mcc-mapping.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T802 — Loader comercios _deps: T204, T302_

**Detalle:**
- scripts/seed-comercios.ts: lee data/comercios.csv (cuando exista)
- Normaliza nombre_bancard antes insert

**Archivos:** `scripts/seed-comercios.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T803 — Reglas regex semilla _deps: T203_

**Detalle:**
- scripts/seed-reglas.ts: insert reglas iniciales (BIGGIE, COPETROL, PUNTO FARMA, SHELL, PETROBRAS, ...)
- Mínimo 20 reglas verificadas

**Archivos:** `scripts/seed-reglas.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T804 — Loader CSV genérico + dataset comercios PY _deps: T801, T802, T803_

**Detalle:**
- src/db/loaders/csv.ts: helper genérico loadFromCsv({ file, mapRow, table, onConflict, log })
- src/db/loaders/{categorias,reglas,comercios,mcc}.ts: una definición por tabla con field mapper explícito
- scripts/load.ts: CLI unificado pnpm db:load <tabla|all> [path]
- data/comercios.csv: ~40 comercios PY (BIGGIE, COPETROL, ANDE, etc.)
- Idempotencia por target apropiado (slug, codMcc, nombre_bancard)
- Reemplaza scripts/seed-*.ts con wrappers thin (mantienen pnpm db:seed:* compat)

**Archivos:** `src/db/loaders/csv.ts`, `src/db/loaders/categorias.ts`, `src/db/loaders/reglas.ts`, `src/db/loaders/comercios.ts`, `src/db/loaders/mcc.ts`, `scripts/load.ts`, `data/comercios.csv`

**Gates:** consistency ✅  lint ✅  test ✅

## P9 — Observabilidad básica + decisiones (2/2)

### ✅ T901 — Request logging _deps: T601_

**Detalle:**
- Plugin Fastify log request/response con request_id
- Sample body en debug only

**Archivos:** `src/api/plugins/request-log.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T901b — Documentar política recategorización

**Detalle:**
- docs/decisiones/recategorizacion.md
- Cuando cambien reglas/comercios/mcc, ¿qué pasa con movimientos viejos?
- Decisión MVP: no recategorizar automático. Categorización es snapshot del momento.
- Job manual recategorizar = PNH
- Solo doc, sin código

**Archivos:** `docs/decisiones/recategorizacion.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P10 — Dashboard tareas (1/1)

### ✅ TX01 — UI estática dashboard

**Detalle:**
- ui/index.html + ui/app.js + ui/styles.css
- Lee tasks.data.js (window.__TASKS__) o fetch tasks.json fallback
- Filtros: estado, fase. Stats: % completado
- Sin framework, vanilla JS

**Archivos:** `ui/index.html`, `ui/app.js`, `ui/styles.css`, `ui/tasks.data.js`

**Gates:** consistency ✅  lint ✅  test ✅

## P11 — Catálogo masivo Bancard + MCC enriquecido (14/14)

### ✅ T1101 — Migration: tabla mcc agregar categoria_id

**Detalle:**
- drizzle: agregar columna categoria_id uuid nullable, FK categorias(id)
- Mantener mcc.codigo unique pa lookup
- Generar migration con drizzle-kit generate
- Aplicar con drizzle-kit migrate

**Archivos:** `src/db/schema/mcc.ts`, `drizzle/*.sql`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1102 — Migration: comercios_catalogo enriquecer columnas _deps: T1101_

**Detalle:**
- Agregar: bancard_id text, codigo_comercio text, mcc_original text
- Agregar: fuente_categoria fuente_categoria_enum, confianza numeric(3,2), requiere_revision boolean default false
- Agregar: evidencia jsonb
- Index único compuesto (bancard_id, codigo_comercio) where bancard_id is not null

**Archivos:** `src/db/schema/comercios.ts`, `drizzle/*.sql`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1103 — Convertir xlsx → TSV (3 archivos)

**Detalle:**
- Script scripts/xlsx-to-tsv.mjs
- Lee 'Comercios pagados por QR 2026-csv (1).xlsx'
- Output data/mcc-general.tsv (541 filas) + data/comercios-bancard-raw.tsv (108982)
- Descartar hoja MCC COMMERCES (basura #N/A)

**Archivos:** `scripts/xlsx-to-tsv.mjs`, `data/mcc-general.tsv`, `data/comercios-bancard-raw.tsv`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1104 — Loader MCC GENERAL → tabla mcc _deps: T1101, T1103_

**Detalle:**
- src/db/loaders/mcc-general.ts usa runLoader genérico
- Mapea codigo, descripcion. categoria_id queda null inicial
- Upsert por codigo (onConflictDoUpdate descripcion)
- Script package.json: db:load:mcc-general

**Archivos:** `src/db/loaders/mcc-general.ts`, `scripts/load.ts`, `package.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1105 — Plantilla mapeo MCC → categoría _deps: T1104_

**Detalle:**
- Script scripts/export-mcc-mapping.mjs lee tabla mcc
- Output data/mcc-categoria-mapping.tsv (codigo, descripcion, categoria_slug vacío)
- User llena slug manualmente (off-task)
- Documentar workflow en README sección 'Mapeo MCC'

**Archivos:** `scripts/export-mcc-mapping.mjs`, `data/mcc-categoria-mapping.tsv`, `README.md`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1106 — Loader mapeo MCC→categoria (aplica plantilla) _deps: T1105_

**Detalle:**
- src/db/loaders/mcc-categoria.ts
- Lee mcc-categoria-mapping.tsv, resolve categoria_slug → id
- UPDATE mcc SET categoria_id donde codigo match
- Skip filas sin slug. Reporta cobertura final

**Archivos:** `src/db/loaders/mcc-categoria.ts`, `scripts/load.ts`, `package.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1107 — Preprocess: split MANGO-P2P vs comercios reales _deps: T1103_

**Detalle:**
- Script scripts/preprocess-bancard.mjs
- Lee comercios-bancard-raw.tsv
- Split: Nombre prefijo /^MANGO-/ → mango-p2p.tsv (~60k)
- Resto → comercios-bancard-staged.tsv (~49k)
- Log conteos pa verificación

**Archivos:** `scripts/preprocess-bancard.mjs`, `data/mango-p2p.tsv`, `data/comercios-bancard-staged.tsv`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1108 — Preprocess: dedup bancardId con MCC ganador _deps: T1107_

**Detalle:**
- Extender preprocess-bancard.mjs
- Group by bancardId+codigoComercio, elegir MCC más frecuente no-null/SIN RUBRO
- Si conflicto irresoluble (>1 MCC válido distinto) → flag conflicto en columna extra
- Output sobrescribe comercios-bancard-staged.tsv

**Archivos:** `scripts/preprocess-bancard.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1109 — Refactor csv.ts: streaming + batches _deps: T1102_

**Detalle:**
- Soporte readCsvStream con csv-parse stream API
- runLoader en modo batch: insert 500 filas con onConflictDoUpdate
- Progress log cada 1000 filas
- Backwards compat con loaders existentes (sync mode default)

**Archivos:** `src/db/loaders/csv.ts`, `src/db/loaders/csv.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1110 — Loader transferencias P2P (MANGO-*) _deps: T1109_

**Detalle:**
- src/db/loaders/mango-p2p.ts
- Insert masivo en comercios_catalogo categoria=transferencia (slug fijo)
- fuente_categoria='heuristica', confianza=0.95, evidencia={patron:'MANGO-'}
- Asegurar categoria 'transferencia' existe en seed
- Script: db:load:mango-p2p

**Archivos:** `src/db/loaders/mango-p2p.ts`, `src/db/seeds/categorias.ts`, `package.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1111 — Cascada catálogo: extracción a función pura _deps: T1106_

**Detalle:**
- src/pipeline/cascada-catalogo.ts
- Función categorizarComercio(row, ctx) → {categoriaId, fuente, confianza, requiereRevision, evidencia}
- Orden: regex(reglas) → MCC oficial → patrones nombre → fallback otros+revisión
- Reusa capas existentes (regex, mcc) en modo batch (load reglas/mcc 1 vez)

**Archivos:** `src/pipeline/cascada-catalogo.ts`, `src/pipeline/cascada-catalogo.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1112 — Loader masivo comercios-bancard con cascada _deps: T1110, T1111_

**Detalle:**
- src/db/loaders/comercios-bancard-masivo.ts
- Lee comercios-bancard-staged.tsv en stream
- Aplica cascada-catalogo por fila
- Batch upsert 500 filas en comercios_catalogo (target: bancard_id+codigo_comercio)
- Progress log cobertura por fuente cada 5000
- Script: db:load:comercios-bancard-masivo

**Archivos:** `src/db/loaders/comercios-bancard-masivo.ts`, `scripts/load.ts`, `package.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1113 — Reporte cobertura SQL _deps: T1112_

**Detalle:**
- Script scripts/report-cobertura.mjs
- Queries: count por fuente_categoria, % requiere_revision, top categorias, MCCs sin mapeo usados
- Output tabla en consola pa validar resultado masivo
- Documentar en README cómo correr

**Archivos:** `scripts/report-cobertura.mjs`, `README.md`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1114 — Pipeline runtime: priorizar catálogo enriquecido _deps: T1112_

**Detalle:**
- Verificar capa comercio usa nuevo catálogo (bancard_id lookup directo)
- Si comercios_catalogo trae fuente+confianza, propagar a movimiento sin recalcular
- Test integración: movimiento con bancardId conocido → categoría inmediata sin IA

**Archivos:** `src/layers/comercio.ts`, `src/layers/comercio.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P12 — Inferencia por marca (recuperar MCC de sucursales hermanas) (5/5)

### ✅ T1201 — Migration: comercios_catalogo agregar marca + mcc_inferido _deps: T1114_

**Detalle:**
- Agregar columna marca text nullable (brand_key extraído)
- Agregar columna mcc_inferido boolean default false
- Index marca (no único) pa lookups por marca
- drizzle generate + migrate

**Archivos:** `src/db/schema/comercios_catalogo.ts`, `src/db/migrations/*.sql`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1202 — Función pura extractBrand(nombre)

**Detalle:**
- src/domain/brand.ts: extractBrand(nombre): string | null
- Normaliza, quita sufijos ubicación/numéricos (-YPANE, -CENTRO, -SUCURSAL, II, III, números)
- Corta en primer separador (- / espacio+digit)
- Mínimo 4 chars válidos. Si menos → null
- Tests unit con casos: BRISTOL-YPANE→BRISTOL, ENERGY 2→ENERGY, COPETROL→COPETROL, EL CACIQUE-ITAUGUA→EL CACIQUE

**Archivos:** `src/domain/brand.ts`, `src/domain/brand.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1203 — Preprocess: brand grouping + MCC inference _deps: T1202_

**Detalle:**
- Extender scripts/preprocess-bancard.mjs
- Para cada fila: calcular brand_key (puerta a JS port de extractBrand o duplicar lógica)
- Group by brand_key, contar MCCs válidos
- Si grupo tiene >=2 filas y >=1 MCC válido → MCC ganador (más frecuente)
- Filas con MCC inválido (SIN RUBRO/null/'') heredan ganador, flag mcc_inferido=1
- Output: agregar columnas 'marca' y 'mcc_inferido' al staged.tsv
- Log conteos: filas rescatadas por inferencia, top 10 marcas por filas afectadas

**Archivos:** `scripts/preprocess-bancard.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1204 — Cascada: soportar MCC inferido con confianza reducida _deps: T1201_

**Detalle:**
- Extender FilaBancard con marca, mccInferido
- En categorizarComercio: si mccInferido y MCC mapea a categoría → fuente='mcc', confianza=0.60, evidencia.mcc_inferido=true, evidencia.marca
- requiereRevision=true (confianza < threshold 0.7)
- Tests: BRISTOL inferido 5399→ropa con confianza 0.6 + revisión
- MCC válido directo sigue confianza 0.75 (sin cambio)

**Archivos:** `src/pipeline/cascada-catalogo.ts`, `src/pipeline/cascada-catalogo.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1205 — Loader masivo: persistir marca + mcc_inferido + reporte _deps: T1203, T1204_

**Detalle:**
- Actualizar comercios-bancard-masivo.ts: leer columnas marca/mcc_inferido del TSV
- Pasar a categorizarComercio + persistir en comercios_catalogo
- Extender scripts/report-cobertura.mjs: nueva sección 'rescatados por inferencia marca'
- Re-correr loader masivo, verificar mejora cobertura en reporte

**Archivos:** `src/db/loaders/comercios-bancard-masivo.ts`, `scripts/report-cobertura.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

## P13 — Activar catálogo en runtime + fixes integración (5/5)

### ✅ T1301 — Fix validador MCC: aceptar vacío/SIN RUBRO → null

**Detalle:**
- src/api/routes/categorizar.ts: ajustar zod schema mcc
- Pre-process: '' / 'SIN RUBRO' / 'null' (case-insensitive) → null antes de validar regex
- Mantener regex /^\d{2,4}$/ pa valores no-null
- Tests: aceptar mcc=null, mcc='', mcc='SIN RUBRO', rechazar 'foo'

**Archivos:** `src/api/routes/categorizar.ts`, `src/api/routes/categorizar.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1302 — Lookup runtime por bancardId/codigoComercio en catálogo _deps: T1301_

**Detalle:**
- Extender MovimientoInput con bancardId? + codigoComercio? opcionales
- src/db/repos/comercios.ts: nuevo lookup porBancardCodigo(bancardId, codigoComercio)
- Nueva capa src/layers/catalogo.ts: evalúa por bancardId+codigo, propaga fuente/confianza/evidencia del catálogo
- Pipeline cascada: insertar capa catálogo PRIMERO (antes regex)
- Si hit catálogo con confianza ≥0.7 + !requiere_revision → return inmediato sin más capas

**Archivos:** `src/domain/types.ts`, `src/db/repos/comercios.ts`, `src/layers/catalogo.ts`, `src/layers/catalogo.test.ts`, `src/pipeline/categorizar.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1303 — Seed reglas_regex: MANGO, AZAR, SLOTS, juego

**Detalle:**
- Extender data/reglas.csv con: ^MANGO\b → transferencia, AZAR|SLOT|TRAGAMONEDA|CASINO|GAMING|APUESTA → azar
- Verificar prioridad correcta (MANGO antes que otras)
- Re-correr pnpm db:load:reglas
- Test: capa regex evalúa 'MANGO PEREZ' → transferencia, 'AZAR LATINO' → azar

**Archivos:** `data/reglas.csv`, `src/layers/regex.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1304 — Agregar 13 MCCs faltantes a mcc_catalogo

**Detalle:**
- MCCs presentes en COMMERCES pero no en MCC GENERAL: 7995, 4812, 6513, 8699, 8398, 3722, 8661, 5631, 8641, 7994, 5122, 5912, 5310 (verificar)
- Agregar manualmente con descripción + categoría: 7995→azar, 4812→servicios, 6513→financiero, 8699→servicios, etc.
- Insertar en data/mcc-categoria-mapping.tsv
- Re-correr pnpm db:load:mcc-categoria

**Archivos:** `data/mcc-categoria-mapping.tsv`, `scripts/load.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1305 — Tests e2e runtime con catálogo cargado _deps: T1302, T1303, T1304_

**Detalle:**
- src/pipeline/e2e.test.ts: agregar casos
- BRISTOL-YPANE+SIN RUBRO → ropa via catálogo (MCC inferido)
- MANGO-PEREZ → transferencia via regex
- AZAR LATINO → azar via regex
- BIGGIE → supermercado via catálogo o regex
- Comercio desconocido → IA fallback con requiere_revision
- Asegurar mocks DB con catálogo populado

**Archivos:** `src/pipeline/e2e.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

## P14 — Test masivo 109k vía API + análisis baseline (7/7)

### ✅ T1401 — Migration: movimientos agregar origen + batch_id

**Detalle:**
- Schema: origen text not null default 'api', batch_id text nullable
- Index parcial batch_id (where batch_id is not null) pa filtrado rápido
- drizzle generate + migrate
- Tests: insert con/sin batch_id

**Archivos:** `src/db/schema/movimientos.ts`, `src/db/migrations/*.sql`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1402 — API acepta origen + batch_id en request _deps: T1401_

**Detalle:**
- Extender categorizar.schema.ts: origen?, batch_id? opcionales (max 100 chars)
- Pasar a MovimientoInput → persistirMovimiento → INSERT movimientos
- Default origen='api' si no viene
- Tests schema: acepta vacíos, valida longitud
- Tests route: row tiene origen+batch_id correcto

**Archivos:** `src/api/schemas/categorizar.ts`, `src/api/routes/categorizar.ts`, `src/domain/types.ts`, `src/db/repos/movimientos.ts`, `src/pipeline/persistir.ts`, `src/api/schemas/categorizar.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1403 — Runner test masivo concurrente _deps: T1402_

**Detalle:**
- scripts/test-masivo.ts: lee comercios-bancard-staged.tsv + mango-p2p.tsv
- Para cada fila POST /categorizar-movimiento con bancard_id, codigo_comercio, nombre_bancard, mcc
- Concurrencia 30 (semáforo simple, sin libs externas)
- Captura: status HTTP, latency_ms, response body
- batch_id = 'test-' + ISO timestamp
- Output streaming a data/test-results.ndjson (1 línea por request)
- Progress log cada 5000 filas
- Args: --limit N (sample), --concurrency N, --base-url

**Archivos:** `scripts/test-masivo.ts`, `package.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1404 — Análisis SQL post-batch + reporte _deps: T1403_

**Detalle:**
- scripts/analyze-test-batch.mjs <batch_id>
- Queries: count total, distribución fuente, agreement vs catálogo, top mismatches
- Comparar movimientos.categoria_predicha_id vs catálogo (join por bancard_id+codigo)
- Output: tabla consola + data/test-summary-<batch>.json
- Sección mismatches: top 50 con nombre, fuente runtime, fuente catálogo, ambas categorías

**Archivos:** `scripts/analyze-test-batch.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1405 — Endpoint stats: GET /test-batch/:batch_id/stats _deps: T1402_

**Detalle:**
- Nueva ruta src/api/routes/test-batch-stats.ts
- Path param batch_id, valida no vacío
- Auth con apiKeyAuth (igual que otras rutas)
- Queries agregadas: total, fuente dist, latencia (p50/p95/p99/max/avg), cobertura, top categorías, agreement vs catálogo, últimos N mismatches, últimos N movimientos
- Response JSON estructurado pa consumir desde UI
- Cache resultado 1s pa no saturar DB con polling
- Tests con fastify.inject

**Archivos:** `src/api/routes/test-batch-stats.ts`, `src/api/routes/test-batch-stats.test.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1406 — UI test monitor: dashboard realtime _deps: T1405_

**Detalle:**
- ui/test-monitor/index.html + app.js + styles.css (vanilla, sin frameworks)
- Input: batch_id + API key (persiste en localStorage)
- Polling /test-batch/:batch/stats cada 2s
- Render KPIs: total/objetivo + barra progreso, throughput req/s, elapsed, ETA, errores
- Histograma latencia (buckets 0-10/10-25/25-50/50-100/100-500/500+ ms)
- Gráfico fuente categoría (barras horizontales count + %)
- Donut cobertura sync_ok / revisión / sin_categoría
- Buckets confianza ≥0.9 / 0.7-0.89 / 0.5-0.69 / <0.5
- Top 10 categorías live
- Agreement % vs catálogo + tabla últimos 20 mismatches
- Stream últimos 30 movimientos auto-scroll
- Botón pause/resume polling

**Archivos:** `ui/test-monitor/index.html`, `ui/test-monitor/app.js`, `ui/test-monitor/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1407 — Ejecutar 109k + investigar mismatches _deps: T1406_

**Detalle:**
- Levantar API: ./restart.sh, verificar /health
- Correr test-masivo.ts con full dataset, batch_id 'baseline-v1'
- Esperar finalización (estimado: 109k @ 30 conc @ 50ms = ~3 min)
- Correr analyze-test-batch.mjs baseline-v1
- Documentar baseline en docs/test-baseline-v1.md: agreement %, latencia p50/p95/p99, fuente dist
- Identificar top 5 patrones de mismatch (ej. capa nombre LIKE muy laxo)
- Si mismatch >5% → crear sub-tareas fix

**Archivos:** `docs/test-baseline-v1.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P15 — Dashboard control + UI integrada (5/5)

### ✅ T1501 — Fastify static: servir ui/ desde API

**Detalle:**
- Instalar @fastify/static
- Registrar plugin con root=ui/, prefix=/ui/
- Verificar acceso http://localhost:3000/ui/test-monitor/index.html
- Ajustar UI default base-url a window.location.origin si está bajo /ui/

**Archivos:** `src/api/server.ts`, `src/main.ts`, `ui/test-monitor/app.js`, `package.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1502 — Worker controller in-process pa runs

**Detalle:**
- src/test-batch/runner.ts: clase TestBatchRunner con start(batchId, opts), stop(batchId), list()
- Lee TSV streaming, ejecuta ejecutarCascada + persistirMovimiento directo (sin HTTP)
- Concurrencia configurable (default 30) con semáforo simple
- Estado: queued | running | done | cancelled | error
- Tracking por batchId: total, processed, ok, errors, startedAt, finishedAt
- Cancellation: AbortController, worker chequea entre filas
- Tests unit con mocks pipeline + repo

**Archivos:** `src/test-batch/runner.ts`, `src/test-batch/runner.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1503 — Endpoints control: start/stop/list _deps: T1502_

**Detalle:**
- POST /test-batch/start body {batch_id, files?, limit?, concurrency?}
- POST /test-batch/stop body {batch_id}
- GET /test-batch/list
- Auth con apiKeyAuth
- Validación zod (batch_id min 1, concurrency 1-100, limit positivo)
- Tests con fastify.inject

**Archivos:** `src/api/routes/test-batch-control.ts`, `src/api/routes/test-batch-control.test.ts`, `src/api/schemas/test-batch.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1504 — UI controls: start/stop/list + status _deps: T1503, T1501_

**Detalle:**
- Form en topbar: batch_id, limit, concurrency, files
- Botones: Start (POST /test-batch/start), Stop (POST /test-batch/stop)
- Indicador estado worker: idle/running/done/cancelled/error
- Auto-fetch stats cada 1s mientras running, cada 5s done
- Mostrar progress (processed/total) del runner además de DB stats
- Tabla 'Runs activos' (GET /test-batch/list refresca cada 3s)

**Archivos:** `ui/test-monitor/index.html`, `ui/test-monitor/app.js`, `ui/test-monitor/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1505 — Validación end-to-end + cleanup _deps: T1504_

**Detalle:**
- Test manual: abrir /ui/test-monitor/, start batch sample 1k → verificar UI live
- Test 109k full vía dashboard, comparar vs CLI baseline-v2
- Verificar stop cancela worker correctamente (movimientos parciales OK)
- Doc: README sección 'Test interactivo via UI'
- Cleanup batches viejos opcional (DELETE WHERE batch_id IN (...))

**Archivos:** `README.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P16 — Precisión runtime: fix falsos positivos capa nombre + propagación catálogo (4/4)

### ✅ T1601 — Capa comercio: longitud mínima + score umbral

**Detalle:**
- src/layers/comercio.ts: rechazar input texto <5 chars antes de buscar (skip CIT, GAB, NGO, EDU, etc)
- Score mínimo configurable (default 0.75) pa match parcial
- Tests: input 'CIT' → null, 'COMERC SAN CAYETANO' vs 'SAN CAYETANO' (score 0.68) → null
- Test: 'COPETROL' vs 'COPETROL' (score 1.0) → match exacto sigue funcionando
- Documentar threshold en código

**Archivos:** `src/layers/comercio.ts`, `src/layers/comercio.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1602 — Capa catálogo: devolver hit aunque requiereRevision=true

**Detalle:**
- src/layers/catalogo.ts: si hit existe, devolver siempre (no skip por requiereRevision)
- Propagar requiereRevision al resultado pipeline
- Pipeline persistir respeta requiereRevision del catálogo
- Trade-off: runtime usa categoría conservadora del catálogo en vez de buscar falso positivo en capas inferiores
- Tests: hit revision=true → devuelve categoría con flag, no sigue cascada

**Archivos:** `src/layers/catalogo.ts`, `src/layers/catalogo.test.ts`, `src/pipeline/categorizar.ts`, `src/domain/types.ts`, `src/pipeline/persistir.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1603 — Regla regex COMERC/COMERCIAL → supermercado

**Detalle:**
- Agregar reglas en src/db/loaders/reglas.ts: \bCOMERC\b|\bCOMERCIAL\b → supermercado prioridad 25 (no compite con BIGGIE etc)
- Verificar no rompe AZAR/MANGO existentes
- Re-correr db:load:reglas
- Test capa regex

**Archivos:** `src/db/loaders/reglas.ts`, `src/layers/regex.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1604 — Re-test 109k baseline-v3 + comparar mejoras _deps: T1601, T1602, T1603_

**Detalle:**
- Limpiar baseline-v1 y baseline-v2: DELETE FROM movimientos WHERE batch_id IN ('baseline-v1','baseline-v2','test-1','ui-test-1')
- Restart API
- Correr pnpm test:masivo --batch-id baseline-v3
- node scripts/analyze-test-batch.mjs baseline-v3
- Comparar agreement % vs baseline-v2 (esperar mejora 99.87% → ≥99.95%)
- Documentar en docs/test-baseline-v3.md cambios + delta

**Archivos:** `docs/test-baseline-v3.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P17 — Validación real cascada: bypass catálogo + agreement honesto (5/5)

### ✅ T1701 — Flag bypass_catalogo en API /categorizar-movimiento

**Detalle:**
- src/api/schemas/categorizar.ts: agregar bypass_catalogo? boolean optional
- src/api/routes/categorizar.ts: pasar flag a ejecutarCascada
- src/pipeline/categorizar.ts: si bypass_catalogo=true, saltar capa catálogo
- Tests schema + e2e
- Persistir movimiento con evidencia.bypass_catalogo=true pa trazabilidad

**Archivos:** `src/api/schemas/categorizar.ts`, `src/api/routes/categorizar.ts`, `src/pipeline/categorizar.ts`, `src/db/schema/movimientos.ts`, `src/api/schemas/categorizar.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1702 — Worker masivo soporta bypass + endpoint start _deps: T1701_

**Detalle:**
- src/test-batch/runner.ts: BatchOpts.bypassCatalogo? boolean
- Worker pasa flag a ejecutarCascada
- src/api/schemas/test-batch.ts: agregar bypass_catalogo en start request
- Endpoint start propaga al runner
- Tests runner + endpoint

**Archivos:** `src/test-batch/runner.ts`, `src/test-batch/runner.test.ts`, `src/api/schemas/test-batch.ts`, `src/api/routes/test-batch-control.ts`, `src/api/routes/test-batch-control.test.ts`, `src/pipeline/categorizar.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1703 — Stats: agreement honesto en bypass batches _deps: T1702_

**Detalle:**
- Detectar si batch corrió con bypass (chequear evidencia.bypass_catalogo en muestra)
- Mostrar tag visible en endpoint response (modo='cascada_pura' vs 'con_catalogo')
- Agreement query igual (sigue comparando vs catálogo)
- UI: badge en runner status indicando modo bypass
- Tests

**Archivos:** `src/api/routes/test-batch-stats.ts`, `src/db/repos/test-batch-stats.ts`, `ui/test-monitor/app.js`, `ui/test-monitor/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1704 — UI control: checkbox bypass en form Run _deps: T1703_

**Detalle:**
- ui/test-monitor/index.html: checkbox bypass_catalogo
- app.js: incluir flag en payload start
- Visualmente diferenciar batches con bypass (color/icon en runner status)
- Tooltip explicando trade-off

**Archivos:** `ui/test-monitor/index.html`, `ui/test-monitor/app.js`, `ui/test-monitor/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1705 — Ejecutar baseline-v4 con bypass + análisis honesto _deps: T1704_

**Detalle:**
- TRUNCATE movimientos pa baseline limpio
- Run dash UI con batch_id 'baseline-v4' bypass=true
- Comparar agreement v3 (100% trampa) vs v4 (cascada pura real)
- Identificar dónde cascada pierde sin catálogo: ¿qué fuente cambia? ¿qué categorías?
- Documentar docs/test-baseline-v4.md con análisis honesto
- Si agreement <90% → identificar palancas pa mejorar cascada (más reglas regex, ampliar mcc, etc)

**Archivos:** `docs/test-baseline-v4.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P18 — Gestión categorías UI completa (8/8)

### ✅ T1801 — CRUD categorías endpoints + persistencia extras

**Detalle:**
- POST /categorias { slug, nombre, descripcion? }
- PATCH /categorias/:slug
- DELETE /categorias/:slug (check refs)
- GET /categorias/:slug/usage (counts movimientos/reglas/mcc/comercios)
- Persiste a data/categorias-extras.tsv
- Loader extras tras DEFAULTS
- Invalidar cache CategoriaResolver
- Validar slug [a-z0-9_]+ max 30
- Tests fastify.inject CRUD + edge cases

**Archivos:** `src/api/routes/categorias.ts`, `src/api/routes/categorias.test.ts`, `src/api/schemas/categorias.ts`, `src/db/repos/categorias.ts`, `src/db/loaders/categorias.ts`, `src/db/loaders/categorias-extras.ts`, `src/main.ts`, `data/categorias-extras.tsv`, `scripts/load.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1802 — CRUD reglas regex endpoints + persistencia extras _deps: T1801_

**Detalle:**
- GET /reglas?categoria=X
- POST /reglas {patron,categoria_slug,prioridad,descripcion?}
- PATCH /reglas/:id
- DELETE /reglas/:id
- POST /reglas/test {patron,texto} pa probar live
- Validar regex compilable (try new RegExp)
- Persiste data/reglas-extras.tsv
- Loader extras tras inline DEFAULTS
- Invalidar cache CapaRegex
- Tests

**Archivos:** `src/api/routes/reglas.ts`, `src/api/routes/reglas.test.ts`, `src/api/schemas/reglas.ts`, `src/db/repos/reglas.ts`, `src/db/loaders/reglas.ts`, `src/db/loaders/reglas-extras.ts`, `src/main.ts`, `data/reglas-extras.tsv`, `scripts/load.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1803 — CRUD MCC mapping endpoints _deps: T1801_

**Detalle:**
- GET /mcc?categoria=X|sin_categoria=true
- POST /mcc {cod_mcc,descripcion,categoria_slug?,ambiguo?}
- PATCH /mcc/:cod_mcc
- DELETE /mcc/:cod_mcc (block si refs)
- Persiste cambios a data/mcc-extras.tsv (existing file)
- Cache invalidate
- Tests

**Archivos:** `src/api/routes/mcc.ts`, `src/api/routes/mcc.test.ts`, `src/api/schemas/mcc.ts`, `src/db/repos/mcc.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1804 — Endpoint reproceso catálogo masivo _deps: T1803_

**Detalle:**
- POST /catalogo/reprocess {truncate_first?:bool} → spawn worker
- Reutiliza TestBatchRunner extendido o nuevo CatalogoMassiveRunner
- Returns {batch_id,status} pa monitorear via /test-batch/list
- Mutex: solo 1 reproceso simultáneo
- Tests con sample

**Archivos:** `src/api/routes/catalogo.ts`, `src/api/routes/catalogo.test.ts`, `src/api/schemas/catalogo.ts`, `src/test-batch/catalogo-runner.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1805 — Tabla marcas_conocidas + IA dinámica _deps: T1801_

**Detalle:**
- Migration: marcas_conocidas (id, categoria_id FK, marca, descripcion?)
- Seed migra constante MARCAS_PY actual
- CRUD endpoints /marcas
- Refactor src/layers/ia.ts: leer marcas DB con cache 60s
- Generar bloque MARCAS_PY dinámico
- Tests integración prompt incluye marca nueva tras crear

**Archivos:** `src/db/schema/marcas_conocidas.ts`, `src/db/migrations/*.sql`, `src/db/repos/marcas.ts`, `src/api/routes/marcas.ts`, `src/api/routes/marcas.test.ts`, `src/api/schemas/marcas.ts`, `src/layers/ia.ts`, `src/main.ts`, `src/db/loaders/marcas.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1806 — UI listado categorías _deps: T1804, T1805_

**Detalle:**
- ui/categorias/index.html + app.js + styles.css (dark theme consistente)
- Lista con counts (mov/reglas/mcc/comercios)
- Botón + Nueva (modal form)
- Click row → /ui/categorias/[slug]/
- Botón Re-procesar catálogo (confirm + link a test-monitor)
- Nav links desde tester y test-monitor

**Archivos:** `ui/categorias/index.html`, `ui/categorias/app.js`, `ui/categorias/styles.css`, `ui/test-monitor/index.html`, `ui/tester/index.html`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1807 — UI detalle categoría con tabs _deps: T1806_

**Detalle:**
- ui/categorias/[slug]/index.html (single file, query param ?slug=X)
- Tabs: Info | Reglas | MCCs | Marcas
- Form editar info
- Tabla reglas inline CRUD + probar patron
- Tabla MCCs filtrable + asignar/quitar
- Tabla marcas CRUD
- Eliminar categoría (mostrar usage si bloqueado)

**Archivos:** `ui/categorias/detalle.html`, `ui/categorias/detalle.js`, `ui/categorias/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1808 — E2E verificación + doc _deps: T1807_

**Detalle:**
- Test integración src/api/categorias-flow.test.ts cubriendo pasos 1-12
- doc docs/categorias-e2e.md con pasos manuales UI
- README sección 'Gestión categorías via UI'
- Manual: crear mascotas, regla, MCC, marca, reprocess, validar predicciones, eliminar

**Archivos:** `src/api/categorias-flow.test.ts`, `docs/categorias-e2e.md`, `README.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P19 — UIs unificadas con shared layout + landing (8/8)

### ✅ T1901 — Shared layout: theme.css + state.js + api.js + nav.js

**Detalle:**
- ui/shared/theme.css: CSS variables dark theme (colores, espaciados, tipografía)
- ui/shared/state.js: singleton window.tagger {baseUrl, apiKey, setApiKey, on(event,cb)}
- ui/shared/api.js: fetch wrapper con auth + manejo errores
- ui/shared/nav.js: auto-inject navbar (detecta página activa, persist API key entre tabs)
- Verificar: importar 4 scripts en HTML simple muestra nav + funciona api key sync

**Archivos:** `ui/shared/theme.css`, `ui/shared/state.js`, `ui/shared/api.js`, `ui/shared/nav.js`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1902 — Landing /ui/index.html con health + counts + cards _deps: T1901_

**Detalle:**
- Landing usa shared layout
- Cards: Categorías / Tester / Monitor / Tareas (con icons)
- Health badges: DB ok/fail, Ollama ok/fail (fetch /health)
- Counts: GET /categorias (count), GET /reglas (count), /marcas (count)
- Click card navega a sección

**Archivos:** `ui/index.html`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1903 — Mover dashboard tareas a /ui/tasks/index.html _deps: T1901_

**Detalle:**
- mv ui/index.html → ui/tasks/index.html (renombrando, antiguo era dashboard tareas)
- Mover ui/app.js, ui/styles.css, ui/tasks.data.js → ui/tasks/
- Actualizar scripts/sync-tasks.mjs a generar ui/tasks/tasks.data.js
- Refactor pa usar shared nav

**Archivos:** `ui/tasks/index.html`, `ui/tasks/app.js`, `ui/tasks/styles.css`, `ui/tasks/tasks.data.js`, `scripts/sync-tasks.mjs`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1904 — Refactor ui/categorias usa shared _deps: T1901_

**Detalle:**
- Reemplazar topbar custom por shared nav
- Migrar API client a shared api.js
- Migrar config persistencia a shared state
- Theme.css en lugar de styles propios donde aplique

**Archivos:** `ui/categorias/index.html`, `ui/categorias/detalle.html`, `ui/categorias/app.js`, `ui/categorias/detalle.js`, `ui/categorias/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1905 — Refactor ui/test-monitor usa shared _deps: T1901_

**Detalle:**
- Reemplazar topbar custom por shared nav
- Migrar API client
- Mantener KPIs y gráficos
- Theme consistente

**Archivos:** `ui/test-monitor/index.html`, `ui/test-monitor/app.js`, `ui/test-monitor/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1906 — Refactor ui/tester usa shared _deps: T1901_

**Detalle:**
- Reemplazar header custom por shared nav
- Migrar API client
- Mantener form + history + correccion
- Theme consistente

**Archivos:** `ui/tester/index.html`, `ui/tester/app.js`, `ui/tester/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1907 — Fastify: redirect /ui → /ui/index.html _deps: T1902_

**Detalle:**
- src/api/server.ts: agregar redirect 302 /ui → /ui/index.html
- Verificar /ui/ devuelve landing
- Asegurar /ui/shared/* sirve correctamente

**Archivos:** `src/api/server.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T1908 — Verificación e2e nav unificada + doc _deps: T1903, T1904, T1905, T1906, T1907_

**Detalle:**
- Probar nav entre todas: landing→tareas→tester→monitor→categorias→landing
- Verificar API key sync (set en una página, leer en otra)
- Verificar active state correcto en cada sección
- Doc README sección 'Servicio web unificado'

**Archivos:** `README.md`

**Gates:** consistency ✅  lint ✅  test ✅

## P20 — Comercios CRUD via UI categoria detalle (4/4)

### ✅ T2001 — Endpoints comercios listar + actualizar

**Detalle:**
- GET /comercios?categoria=X&q=&limit=&offset= → lista paginada
- Filter: nombre LIKE %q%, default limit 50, max 500
- PATCH /comercios/:id { categoria_slug?, requiere_revision? }
- Repo writer + zod schemas
- Cache invalidation comercios lookup

**Archivos:** `src/api/routes/comercios.ts`, `src/api/schemas/comercios.ts`, `src/db/repos/comercios-writer.ts`, `src/main.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T2002 — Tests endpoints comercios _deps: T2001_

**Detalle:**
- Tests fastify.inject GET con filtros
- Test PATCH cambio categoría
- Test 404 si no existe
- Test 400 categoria_slug inexistente

**Archivos:** `src/api/routes/comercios.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T2003 — UI tab Comercios en detalle categoría _deps: T2001_

**Detalle:**
- Nueva tab Comercios en ui/categorias/detalle.html
- Tabla: nombre, bancard_id, codigo_comercio, mcc, fuente, confianza, revisión
- Input búsqueda nombre
- Paginación (Anterior/Siguiente con offset+limit)
- Dropdown cambio categoría inline (lista todas categorías)
- Toggle revisión inline
- Refresh tras cambio

**Archivos:** `ui/categorias/detalle.html`, `ui/categorias/detalle.js`, `ui/categorias/styles.css`

**Gates:** consistency ✅  lint ✅  test ✅

### ✅ T2004 — Validación e2e + doc _deps: T2003_

**Detalle:**
- Manual: abrir mascotas → tab Comercios → buscar PETSHOP → cambiar comercio a otra cat
- Verificar usage counts cambian en lista
- doc actualizar README/categorias-e2e.md

**Archivos:** `docs/categorias-e2e.md`, `README.md`

**Gates:** consistency ✅  lint ✅  test ✅

## PNH — Nice to have (post-MVP) (0/14)

### ⬜ T010 — Husky + lint-staged _deps: T003_

**Detalle:**
- Install husky lint-staged
- pre-commit: lint-staged + typecheck + tasks:sync
- lint-staged: *.ts → eslint --fix + prettier --write
- Razón diferida: check-task.mjs ya enforza gates antes done

**Archivos:** `.husky/pre-commit`, `.lintstagedrc.json`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T103 — Compose dev override _deps: T102_

**Detalle:**
- docker-compose.override.yml: bind mount src, command tsx watch
- Hot reload local sin rebuild
- Razón diferida: tsx watch local sin docker es más simple en dev

**Archivos:** `docker-compose.override.yml`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T607b — POST/PATCH categorías _deps: T607_

**Detalle:**
- POST /categorias (crear)
- PATCH /categorias/:id (rename, activo)
- Validar slug único
- Razón diferida: SQL directo basta MVP

**Archivos:** `src/api/routes/categorias.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T701 — Setup BullMQ _deps: T006_

**Detalle:**
- Install bullmq ioredis
- src/workers/queue.ts: queue 'ia-categorizacion'
- Conexión Redis desde env
- Razón diferida: T501b fire-and-forget cubre MVP. BullMQ cuando volumen justifique

**Archivos:** `src/workers/queue.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T702 — Producer encola desde pipeline _deps: T701, T501_

**Detalle:**
- Reemplaza T501b con queue producer
- Job {movimiento_id} cuando capas síncronas fallan

**Archivos:** `src/pipeline/categorizar.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T703 — Worker consumer BullMQ _deps: T702, T406_

**Detalle:**
- src/workers/ia-worker.ts: procesa job, llama capa IA, update movimiento
- Reintentos 3 con backoff exponencial
- Tests con queue test mode

**Archivos:** `src/workers/ia-worker.ts`, `src/workers/ia-worker.test.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T704 — Entrypoint worker _deps: T703_

**Detalle:**
- src/workers/index.ts: arranca worker standalone
- Servicio compose separado, graceful shutdown SIGTERM

**Archivos:** `src/workers/index.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T902 — Métricas Prometheus _deps: T601_

**Detalle:**
- Install prom-client
- Counters: categorizaciones_total{fuente}, ia_jobs_total{status}
- Histogram latencia pipeline. GET /metrics
- Razón diferida: sin tráfico real no aporta señal

**Archivos:** `src/api/plugins/metrics.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T903 — Rate limit _deps: T602_

**Detalle:**
- @fastify/rate-limit, 100 req/min por api-key
- Razón diferida: single tenant interno, sin vector abuso

**Archivos:** `src/api/plugins/rate-limit.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ T904 — CI Github Actions _deps: T009_

**Detalle:**
- .github/workflows/ci.yml
- Jobs: install, lint, typecheck, test (con postgres service), build
- Cache pnpm
- Razón diferida: gates locales cubren MVP

**Archivos:** `.github/workflows/ci.yml`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ TX02 — Servir UI desde API _deps: TX01, T601_

**Detalle:**
- @fastify/static sirve ui/ en /tasks-ui
- Razón diferida: UI funciona file://, no justifica mezclar concerns

**Archivos:** `src/api/plugins/tasks-ui.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ TPH01 — Job recategorización masiva _deps: T501_

**Detalle:**
- Script CLI: recorre movimientos, recorre pipeline, actualiza si cambia categoría
- Útil cuando se agregan reglas o se corrige mapping MCC
- Dry-run flag obligatorio

**Archivos:** `scripts/recategorizar.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ TPH02 — Idempotencia movimientos _deps: T502_

**Detalle:**
- Hash (descripcion+monto+fecha+nombre_bancard) como unique constraint o lookup
- Endpoint detecta duplicado y devuelve movimiento existente sin recategorizar

**Archivos:** `src/pipeline/persistir.ts`

**Gates:** consistency ✅  lint ✅  test ✅

### ⬜ TPH03 — Auto-aprendizaje correcciones _deps: T606_

**Detalle:**
- Analizar correcciones_usuario, sugerir reglas regex o entries comercio
- Admin aprueba antes activar (V3 según roadmap)

**Archivos:** `scripts/sugerir-reglas.ts`

**Gates:** consistency ✅  lint ✅  test ✅
