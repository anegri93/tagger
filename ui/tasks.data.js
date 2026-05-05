window.__TASKS__ = {
  "meta": {
    "project": "tagger",
    "description": "Servicio categorización gastos. Cascada regex→Bancard→comercio→MCC→IA(Gemma).",
    "stack": [
      "TypeScript",
      "Node",
      "Fastify",
      "Drizzle",
      "Postgres",
      "Vitest",
      "Ollama"
    ],
    "gates": {
      "test": "pnpm test",
      "lint": "pnpm lint && pnpm typecheck",
      "consistency": "pnpm check:consistency"
    },
    "rules": [
      "Cada tarea atómica. Una responsabilidad.",
      "No avanzar a siguiente tarea sin pasar 3 gates: test, lint, consistency.",
      "Cada tarea = commit. Mensaje: 'task(<id>): <title>'.",
      "Si gate falla, fix antes seguir. Nunca skip.",
      "Tareas en fase PNH (nice-to-have) NO bloquean MVP. Atacar después de completar P0-P10."
    ]
  },
  "phases": [
    {
      "id": "P0",
      "name": "Bootstrap repo",
      "tasks": [
        {
          "id": "T001",
          "title": "Init package.json + pnpm",
          "detail": [
            "pnpm init",
            "Set name=tagger, type=module, engines.node>=20",
            "Add scripts placeholders: dev, build, test, lint, typecheck, check:consistency"
          ],
          "files": [
            "package.json",
            ".nvmrc"
          ],
          "depends_on": [],
          "status": "done",
          "started_at": "2026-05-04T14:41:44.704Z",
          "completed_at": "2026-05-04T14:43:00.213Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T002",
          "title": "TypeScript config strict",
          "detail": [
            "Install typescript, @types/node, tsx",
            "tsconfig.json strict=true, noUncheckedIndexedAccess, target ES2022, module NodeNext",
            "Add typecheck script: tsc --noEmit"
          ],
          "files": [
            "tsconfig.json",
            "src/index.ts"
          ],
          "depends_on": [
            "T001"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:43:04.313Z",
          "completed_at": "2026-05-04T14:44:06.313Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T003",
          "title": "ESLint + Prettier",
          "detail": [
            "Install eslint, @typescript-eslint, eslint-config-prettier, prettier",
            "eslint.config.js flat config, rules: no-unused-vars error, no-explicit-any warn",
            ".prettierrc: singleQuote, trailingComma all, printWidth 100"
          ],
          "files": [
            "eslint.config.js",
            ".prettierrc",
            ".prettierignore"
          ],
          "depends_on": [
            "T002"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:44:11.340Z",
          "completed_at": "2026-05-04T14:44:49.324Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T004",
          "title": "Vitest setup",
          "detail": [
            "Install vitest, @vitest/coverage-v8",
            "vitest.config.ts: globals true, env node, coverage v8",
            "Add scripts: test, test:watch, test:cov"
          ],
          "files": [
            "vitest.config.ts"
          ],
          "depends_on": [
            "T002"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:44:53.533Z",
          "completed_at": "2026-05-04T14:45:28.494Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T005",
          "title": "Folder layout src/",
          "detail": [
            "Create: src/{db,domain,pipeline,layers,api,lib,config}",
            "Each folder index.ts barrel placeholder",
            "Add README mini en cada carpeta explicando rol (1 línea)"
          ],
          "files": [
            "src/**"
          ],
          "depends_on": [
            "T002"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:45:31.709Z",
          "completed_at": "2026-05-04T14:46:26.558Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T006",
          "title": "Env loader + zod schema",
          "detail": [
            "Install dotenv, zod",
            "src/config/env.ts: schema con DATABASE_URL, OLLAMA_URL, OLLAMA_MODEL, API_KEY, PORT, NODE_ENV, CONFIDENCE_THRESHOLD",
            "Parse process.env, throw if invalid",
            ".env.example commiteado"
          ],
          "files": [
            "src/config/env.ts",
            ".env.example",
            ".gitignore"
          ],
          "depends_on": [
            "T005"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:46:29.863Z",
          "completed_at": "2026-05-04T14:46:50.850Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T007",
          "title": "Logger pino",
          "detail": [
            "Install pino, pino-pretty",
            "src/lib/logger.ts: pino instance, pretty en dev, json en prod",
            "Test: logger.info debe no throw"
          ],
          "files": [
            "src/lib/logger.ts",
            "src/lib/logger.test.ts"
          ],
          "depends_on": [
            "T006"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:46:53.940Z",
          "completed_at": "2026-05-04T14:47:13.108Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T008",
          "title": "Script consistencia inicial",
          "detail": [
            "scripts/check-consistency.mjs",
            "Verifica: tasks.json válido JSON, todos task.depends_on existen, IDs únicos, no ciclos",
            "Verifica: TASKS.md regenerado coincide con tasks.json (sync)",
            "Exit 1 si falla"
          ],
          "files": [
            "scripts/check-consistency.mjs"
          ],
          "depends_on": [
            "T001"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:47:20.451Z",
          "completed_at": "2026-05-04T14:47:21.855Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        },
        {
          "id": "T009",
          "title": "Script sync TASKS.md",
          "detail": [
            "scripts/sync-tasks.mjs: lee tasks.json y regenera TASKS.md",
            "Genera ui/tasks.data.js pa dashboard",
            "Agrega script pnpm tasks:sync"
          ],
          "files": [
            "scripts/sync-tasks.mjs"
          ],
          "depends_on": [
            "T001"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:47:25.634Z",
          "completed_at": "2026-05-04T14:47:27.010Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          }
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T14:52:34.135Z"
    },
    {
      "id": "P1",
      "name": "Docker infra",
      "tasks": [
        {
          "id": "T101",
          "title": "Dockerfile API",
          "detail": [
            "Multi-stage: base node:20-alpine, deps, build, runtime",
            "Final image solo dist + node_modules prod",
            "Expose PORT, CMD node dist/api/server.js"
          ],
          "files": [
            "Dockerfile",
            ".dockerignore"
          ],
          "depends_on": [
            "T005"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:50:21.094Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:50:56.208Z"
        },
        {
          "id": "T102",
          "title": "docker-compose.yml",
          "detail": [
            "Servicios: api, postgres:16, ollama (opt profile 'ai')",
            "Volúmenes: pgdata, ollama_models",
            "Healthcheck postgres",
            "depends_on con condition: service_healthy"
          ],
          "files": [
            "docker-compose.yml"
          ],
          "depends_on": [
            "T101"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:50:59.847Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:51:15.008Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T14:52:35.573Z"
    },
    {
      "id": "P2",
      "name": "DB schema (Drizzle)",
      "tasks": [
        {
          "id": "T201",
          "title": "Install Drizzle + pg",
          "detail": [
            "Install drizzle-orm pg, drizzle-kit",
            "src/db/client.ts: pool postgres, drizzle instance",
            "drizzle.config.ts apuntando a src/db/schema/*"
          ],
          "files": [
            "src/db/client.ts",
            "drizzle.config.ts"
          ],
          "depends_on": [
            "T006"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:51:20.048Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:52:07.860Z"
        },
        {
          "id": "T202",
          "title": "Schema categorias",
          "detail": [
            "src/db/schema/categorias.ts",
            "Cols: id (uuid pk), slug (text unique), nombre, descripcion, activo (bool default true), created_at, updated_at",
            "Test: insert + select"
          ],
          "files": [
            "src/db/schema/categorias.ts",
            "src/db/schema/categorias.test.ts"
          ],
          "depends_on": [
            "T201"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:53:27.276Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:53:58.223Z"
        },
        {
          "id": "T203",
          "title": "Schema reglas_regex",
          "detail": [
            "Cols: id uuid pk, patron text not null, categoria_id fk categorias, prioridad int default 100, activo bool, descripcion, created_at, updated_at",
            "Index (activo, prioridad)"
          ],
          "files": [
            "src/db/schema/reglas_regex.ts"
          ],
          "depends_on": [
            "T202"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:54:01.074Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:54:21.690Z"
        },
        {
          "id": "T204",
          "title": "Schema comercios_catalogo",
          "detail": [
            "Cols: id uuid pk, nombre text, nombre_bancard text, nombre_normalizado text, categoria_id fk, mcc text nullable, created_at, updated_at",
            "Index unique (nombre_bancard) where not null",
            "Index (nombre_normalizado)"
          ],
          "files": [
            "src/db/schema/comercios_catalogo.ts"
          ],
          "depends_on": [
            "T202"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:54:24.759Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:54:43.516Z"
        },
        {
          "id": "T205",
          "title": "Schema mcc_catalogo",
          "detail": [
            "Cols: cod_mcc text pk, cod_rubro text, desc_rubro text, descripcion text, categoria_id fk nullable, ambiguo bool default false",
            "Campo source pa trazabilidad"
          ],
          "files": [
            "src/db/schema/mcc_catalogo.ts"
          ],
          "depends_on": [
            "T202"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:54:46.825Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:55:05.994Z"
        },
        {
          "id": "T206",
          "title": "Schema movimientos",
          "detail": [
            "Cols: id uuid pk, descripcion text, nombre_comercio text, nombre_bancard text, mcc text, monto numeric(18,2), categoria_predicha_id fk nullable, categoria_confirmada_id fk nullable, fuente_categoria enum(regex,bancard,nombre,mcc,ia,manual) nullable, confianza numeric(3,2), requiere_revision bool default false, raw_input jsonb, created_at, updated_at",
            "Index (created_at), (requiere_revision)"
          ],
          "files": [
            "src/db/schema/movimientos.ts"
          ],
          "depends_on": [
            "T202"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:55:09.310Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:55:33.074Z"
        },
        {
          "id": "T206b",
          "title": "Campo evidencia en movimientos",
          "detail": [
            "Agregar columna evidencia jsonb nullable a movimientos",
            "Estructura: { regla_id?, comercio_id?, mcc_match?, ia_prompt?, ia_response? } según fuente",
            "Permite auditar por qué se categorizó así"
          ],
          "files": [
            "src/db/schema/movimientos.ts"
          ],
          "depends_on": [
            "T206"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:55:36.557Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:55:56.657Z"
        },
        {
          "id": "T207",
          "title": "Schema correcciones_usuario",
          "detail": [
            "Cols: id uuid pk, movimiento_id fk, categoria_anterior_id fk nullable, categoria_nueva_id fk, usuario text nullable, motivo text nullable, created_at"
          ],
          "files": [
            "src/db/schema/correcciones_usuario.ts"
          ],
          "depends_on": [
            "T206"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:56:04.792Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:56:23.372Z"
        },
        {
          "id": "T208",
          "title": "Migración inicial",
          "detail": [
            "drizzle-kit generate",
            "Verificar SQL output limpio",
            "Script pnpm db:migrate (drizzle-kit migrate)"
          ],
          "files": [
            "src/db/migrations/**"
          ],
          "depends_on": [
            "T206b",
            "T207"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:56:26.580Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:57:01.169Z"
        },
        {
          "id": "T209",
          "title": "Seed categorías default",
          "detail": [
            "scripts/seed-categorias.ts",
            "Insert: alimentacion, supermercado, combustible, farmacia, restaurante, transporte, salud, educacion, hogar, servicios, entretenimiento, ropa, tecnologia, viajes, financiero, otros",
            "Idempotente (on conflict do nothing)"
          ],
          "files": [
            "scripts/seed-categorias.ts"
          ],
          "depends_on": [
            "T208"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:57:05.336Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:57:26.421Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T14:57:28.143Z"
    },
    {
      "id": "P3",
      "name": "Dominio + normalización",
      "tasks": [
        {
          "id": "T301",
          "title": "Tipos dominio",
          "detail": [
            "src/domain/types.ts",
            "MovimientoInput, MovimientoCategorizado, FuenteCategoria union, ResultadoCapa { categoriaId, confianza, fuente, evidencia }"
          ],
          "files": [
            "src/domain/types.ts"
          ],
          "depends_on": [
            "T206b"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:58:41.445Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T14:58:54.592Z"
        },
        {
          "id": "T302",
          "title": "Normalizador texto",
          "detail": [
            "src/domain/normalize.ts: uppercase, strip acentos, colapsar espacios, trim, remove puntuación irrelevante",
            "Tests: 'Biggie  S.A.' → 'BIGGIE SA', acentos, ñ preserva, números preservan"
          ],
          "files": [
            "src/domain/normalize.ts",
            "src/domain/normalize.test.ts"
          ],
          "depends_on": [
            "T301"
          ],
          "status": "done",
          "started_at": "2026-05-04T14:58:57.830Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:01:00.109Z"
        },
        {
          "id": "T303",
          "title": "Constantes confianza",
          "detail": [
            "src/domain/confianza.ts: REGEX=0.95, BANCARD=0.90, NOMBRE=0.80, MCC=0.75, IA_MAX=0.70, THRESHOLD_REVISION=0.70",
            "Frozen const objects"
          ],
          "files": [
            "src/domain/confianza.ts"
          ],
          "depends_on": [
            "T301"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:01:03.653Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:01:32.309Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T15:01:34.049Z"
    },
    {
      "id": "P4",
      "name": "Capas categorización",
      "tasks": [
        {
          "id": "T401",
          "title": "Capa regex",
          "detail": [
            "src/layers/regex.ts: clase/función que carga reglas activas ordenadas por prioridad, prueba patron contra texto normalizado",
            "Cache reglas en memoria con TTL 60s + invalidación manual",
            "Devuelve evidencia { regla_id, patron }",
            "Tests: match BIGGIE → supermercado, no match → null, prioridad respetada"
          ],
          "files": [
            "src/layers/regex.ts",
            "src/layers/regex.test.ts"
          ],
          "depends_on": [
            "T203",
            "T302",
            "T303"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:02:09.279Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:02:43.035Z"
        },
        {
          "id": "T402",
          "title": "Capa Bancard",
          "detail": [
            "src/layers/bancard.ts: lookup exacto por nombre_bancard normalizado",
            "Devuelve evidencia { comercio_id, nombre_bancard }",
            "Tests: hit, miss, normalización aplicada antes lookup"
          ],
          "files": [
            "src/layers/bancard.ts",
            "src/layers/bancard.test.ts"
          ],
          "depends_on": [
            "T204",
            "T302"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:02:46.697Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:03:10.445Z"
        },
        {
          "id": "T403",
          "title": "Capa nombre comercio",
          "detail": [
            "src/layers/comercio.ts: match por nombre_normalizado (LIKE/contains o trigram)",
            "Devuelve evidencia { comercio_id, match_type, score }",
            "Tests: match parcial, multiple matches → tomar mejor (más larga coincidencia)"
          ],
          "files": [
            "src/layers/comercio.ts",
            "src/layers/comercio.test.ts"
          ],
          "depends_on": [
            "T204",
            "T302"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:03:10.493Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:03:36.548Z"
        },
        {
          "id": "T404",
          "title": "Capa MCC",
          "detail": [
            "src/layers/mcc.ts: lookup cod_mcc en mcc_catalogo, devolver categoria si no ambiguo",
            "Si ambiguo=true → null (forzar IA)",
            "Tests: hit, ambiguo, no encontrado"
          ],
          "files": [
            "src/layers/mcc.ts",
            "src/layers/mcc.test.ts"
          ],
          "depends_on": [
            "T205"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:03:36.594Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:03:58.950Z"
        },
        {
          "id": "T405",
          "title": "Cliente Ollama",
          "detail": [
            "src/lib/ollama.ts: fetch a OLLAMA_URL/api/generate, modelo gemma2:2b",
            "Timeout 15s, retry 1, structured output prompt",
            "Tests con mock fetch"
          ],
          "files": [
            "src/lib/ollama.ts",
            "src/lib/ollama.test.ts"
          ],
          "depends_on": [
            "T006"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:03:58.997Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:04:30.019Z"
        },
        {
          "id": "T406",
          "title": "Capa IA",
          "detail": [
            "src/layers/ia.ts: prompt con categorías activas + descripción movimiento, parsea JSON respuesta {categoria, confianza}",
            "Validar que categoría exista en DB, sino null",
            "Confianza max IA_MAX (0.70)",
            "Tests con cliente Ollama mockeado"
          ],
          "files": [
            "src/layers/ia.ts",
            "src/layers/ia.test.ts"
          ],
          "depends_on": [
            "T405",
            "T303"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:04:30.065Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:05:05.654Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T15:05:07.500Z"
    },
    {
      "id": "P5",
      "name": "Pipeline orquestador",
      "tasks": [
        {
          "id": "T501",
          "title": "Pipeline cascada síncrona",
          "detail": [
            "src/pipeline/categorizar.ts: ejecuta regex→bancard→comercio→mcc, devuelve primer match",
            "Si ninguna capa síncrona acierta → marcar requiere_revision=true",
            "Tests con stubs por capa"
          ],
          "files": [
            "src/pipeline/categorizar.ts",
            "src/pipeline/categorizar.test.ts"
          ],
          "depends_on": [
            "T401",
            "T402",
            "T403",
            "T404"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:05:11.098Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:05:45.669Z"
        },
        {
          "id": "T501b",
          "title": "IA fallback fire-and-forget",
          "detail": [
            "src/pipeline/ia-fallback.ts: si pipeline síncrono falla, dispara llamada IA sin await",
            "Función schedule(movimientoId): setImmediate → ejecuta capa IA → update movimiento.categoria_predicha + fuente=ia + confianza + evidencia",
            "Errores logged, no throw al caller",
            "Tests verifican no bloquea respuesta y eventualmente actualiza DB"
          ],
          "files": [
            "src/pipeline/ia-fallback.ts",
            "src/pipeline/ia-fallback.test.ts"
          ],
          "depends_on": [
            "T501",
            "T406"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:05:45.715Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:06:14.177Z"
        },
        {
          "id": "T502",
          "title": "Persistencia movimiento",
          "detail": [
            "src/pipeline/persistir.ts: insert movimiento con resultado pipeline + evidencia",
            "Si confianza < THRESHOLD → requiere_revision=true",
            "Idempotencia opcional por hash(descripcion+monto+fecha) — diferir a V2",
            "Tests: insert ok, flag revision correcto"
          ],
          "files": [
            "src/pipeline/persistir.ts",
            "src/pipeline/persistir.test.ts"
          ],
          "depends_on": [
            "T501",
            "T206b"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:06:14.222Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:45:04.327Z"
        },
        {
          "id": "T503",
          "title": "Test E2E pipeline",
          "detail": [
            "src/pipeline/e2e.test.ts: usa DB de test real (testcontainers o postgres test)",
            "Casos: input matchea regex → categorizado regex; input solo MCC → categorizado mcc; input nada → requiere_revision + IA dispara async",
            "Verifica row en DB final correcta"
          ],
          "files": [
            "src/pipeline/e2e.test.ts"
          ],
          "depends_on": [
            "T501b",
            "T502"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:45:04.373Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:45:40.738Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T15:45:42.648Z"
    },
    {
      "id": "P6",
      "name": "API HTTP",
      "tasks": [
        {
          "id": "T601",
          "title": "Fastify server skeleton",
          "detail": [
            "Install fastify @fastify/sensible",
            "src/api/server.ts: build() devuelve instance, start() listen",
            "Healthcheck GET /health → {status:ok}",
            "Tests con inject"
          ],
          "files": [
            "src/api/server.ts",
            "src/api/server.test.ts"
          ],
          "depends_on": [
            "T007"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:45:47.534Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:46:32.627Z"
        },
        {
          "id": "T601b",
          "title": "Healthcheck profundo",
          "detail": [
            "GET /health/ready: pinga DB (select 1), opcional Ollama reachable (HEAD /api/tags)",
            "Devuelve { db: ok|fail, ollama: ok|skip|fail, status: ok|degraded }",
            "200 si todo ok, 503 si DB falla"
          ],
          "files": [
            "src/api/routes/health.ts",
            "src/api/routes/health.test.ts"
          ],
          "depends_on": [
            "T601",
            "T201"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:46:35.737Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:47:03.136Z"
        },
        {
          "id": "T602",
          "title": "Auth middleware api-key",
          "detail": [
            "src/api/plugins/auth.ts: hook onRequest, lee header x-api-key, compara con env API_KEY (timing-safe)",
            "401 si falla. Skip /health, /health/ready",
            "Tests: ok, missing, wrong"
          ],
          "files": [
            "src/api/plugins/auth.ts",
            "src/api/plugins/auth.test.ts"
          ],
          "depends_on": [
            "T601"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:47:03.184Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:47:51.708Z"
        },
        {
          "id": "T603",
          "title": "Schema zod request/response",
          "detail": [
            "src/api/schemas/categorizar.ts: zod schema input (descripcion, nombre_comercio, nombre_bancard, mcc, monto)",
            "Output: movimiento_id, categoria, fuente, confianza, requiere_revision"
          ],
          "files": [
            "src/api/schemas/categorizar.ts"
          ],
          "depends_on": [
            "T301"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:47:55.515Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:48:15.719Z"
        },
        {
          "id": "T604",
          "title": "POST /categorizar-movimiento",
          "detail": [
            "src/api/routes/categorizar.ts: valida con zod, llama pipeline, persiste, dispara IA fallback si aplica, devuelve respuesta",
            "Errores: 400 input inválido, 500 unexpected (loggea no expone)",
            "Tests integración con DB de test"
          ],
          "files": [
            "src/api/routes/categorizar.ts",
            "src/api/routes/categorizar.test.ts"
          ],
          "depends_on": [
            "T502",
            "T501b",
            "T602",
            "T603"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:48:15.765Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:49:01.512Z"
        },
        {
          "id": "T605",
          "title": "GET /movimientos/:id",
          "detail": [
            "Lookup por id, incluye evidencia",
            "404 si no existe",
            "Tests"
          ],
          "files": [
            "src/api/routes/movimiento-get.ts"
          ],
          "depends_on": [
            "T604"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:49:04.829Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:49:57.779Z"
        },
        {
          "id": "T606",
          "title": "POST /movimientos/:id/correccion",
          "detail": [
            "Body: { categoria_id_nueva, motivo? }",
            "Update movimientos.categoria_confirmada_id + insert correcciones_usuario",
            "Tests"
          ],
          "files": [
            "src/api/routes/correccion.ts"
          ],
          "depends_on": [
            "T605",
            "T207"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:50:00.870Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:50:31.099Z"
        },
        {
          "id": "T607",
          "title": "GET /categorias",
          "detail": [
            "Lista categorías activas",
            "Necesario pa prompt IA y validaciones",
            "POST/PATCH se difieren a PNH (gestionar via SQL inicialmente)"
          ],
          "files": [
            "src/api/routes/categorias.ts"
          ],
          "depends_on": [
            "T602",
            "T202"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:50:31.147Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:50:50.681Z"
        },
        {
          "id": "T610",
          "title": "Wire-up adapters Drizzle + montar rutas",
          "detail": [
            "src/db/repos/*.ts: implementaciones concretas de las interfaces (ReglasLoader, BancardLookup, ComercioLookup, MccLookup, MovimientoRepository, MovimientoReader, MovimientoUpdater, CategoriasLoader, CategoriasReader, CorreccionService)",
            "main.ts compone deps: db client → repos → capas → pipeline → ia-fallback → rutas",
            "Registra plugins en orden: requestLog → auth → todas las rutas",
            "Health excluido de auth (ya en lista skip)",
            "Tests integración mínimos por adapter usando mocks de drizzle"
          ],
          "files": [
            "src/db/repos/categorias.ts",
            "src/db/repos/reglas.ts",
            "src/db/repos/comercios.ts",
            "src/db/repos/mcc.ts",
            "src/db/repos/movimientos.ts",
            "src/db/repos/correccion.ts",
            "src/main.ts"
          ],
          "depends_on": [
            "T607",
            "T606",
            "T605",
            "T604",
            "T601b",
            "T901"
          ],
          "status": "done",
          "started_at": "2026-05-04T16:21:04.337Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T16:22:25.440Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T16:22:27.916Z"
    },
    {
      "id": "P8",
      "name": "Seeds + datasets",
      "tasks": [
        {
          "id": "T801",
          "title": "Loader MCC desde CSV",
          "detail": [
            "scripts/seed-mcc.ts: lee data/mcc.csv (Cód.Rubro, Desc.Rubro, Cód.MCC, Descripción)",
            "Mapeo manual mcc→categoria en data/mcc-mapping.json",
            "Insert idempotente"
          ],
          "files": [
            "scripts/seed-mcc.ts",
            "data/mcc-mapping.json"
          ],
          "depends_on": [
            "T205"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:52:04.244Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:53:05.337Z"
        },
        {
          "id": "T802",
          "title": "Loader comercios",
          "detail": [
            "scripts/seed-comercios.ts: lee data/comercios.csv (cuando exista)",
            "Normaliza nombre_bancard antes insert"
          ],
          "files": [
            "scripts/seed-comercios.ts"
          ],
          "depends_on": [
            "T204",
            "T302"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:53:05.383Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:53:30.554Z"
        },
        {
          "id": "T803",
          "title": "Reglas regex semilla",
          "detail": [
            "scripts/seed-reglas.ts: insert reglas iniciales (BIGGIE, COPETROL, PUNTO FARMA, SHELL, PETROBRAS, ...)",
            "Mínimo 20 reglas verificadas"
          ],
          "files": [
            "scripts/seed-reglas.ts"
          ],
          "depends_on": [
            "T203"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:53:30.600Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:54:11.286Z"
        },
        {
          "id": "T804",
          "title": "Loader CSV genérico + dataset comercios PY",
          "detail": [
            "src/db/loaders/csv.ts: helper genérico loadFromCsv({ file, mapRow, table, onConflict, log })",
            "src/db/loaders/{categorias,reglas,comercios,mcc}.ts: una definición por tabla con field mapper explícito",
            "scripts/load.ts: CLI unificado pnpm db:load <tabla|all> [path]",
            "data/comercios.csv: ~40 comercios PY (BIGGIE, COPETROL, ANDE, etc.)",
            "Idempotencia por target apropiado (slug, codMcc, nombre_bancard)",
            "Reemplaza scripts/seed-*.ts con wrappers thin (mantienen pnpm db:seed:* compat)"
          ],
          "files": [
            "src/db/loaders/csv.ts",
            "src/db/loaders/categorias.ts",
            "src/db/loaders/reglas.ts",
            "src/db/loaders/comercios.ts",
            "src/db/loaders/mcc.ts",
            "scripts/load.ts",
            "data/comercios.csv"
          ],
          "depends_on": [
            "T801",
            "T802",
            "T803"
          ],
          "status": "done",
          "started_at": "2026-05-04T17:12:48.756Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T17:15:44.616Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T17:15:47.133Z"
    },
    {
      "id": "P9",
      "name": "Observabilidad básica + decisiones",
      "tasks": [
        {
          "id": "T901",
          "title": "Request logging",
          "detail": [
            "Plugin Fastify log request/response con request_id",
            "Sample body en debug only"
          ],
          "files": [
            "src/api/plugins/request-log.ts"
          ],
          "depends_on": [
            "T601"
          ],
          "status": "done",
          "started_at": "2026-05-04T15:54:18.283Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:54:41.880Z"
        },
        {
          "id": "T901b",
          "title": "Documentar política recategorización",
          "detail": [
            "docs/decisiones/recategorizacion.md",
            "Cuando cambien reglas/comercios/mcc, ¿qué pasa con movimientos viejos?",
            "Decisión MVP: no recategorizar automático. Categorización es snapshot del momento.",
            "Job manual recategorizar = PNH",
            "Solo doc, sin código"
          ],
          "files": [
            "docs/decisiones/recategorizacion.md"
          ],
          "depends_on": [],
          "status": "done",
          "started_at": "2026-05-04T15:54:41.928Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:55:08.004Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T15:55:10.320Z"
    },
    {
      "id": "P10",
      "name": "Dashboard tareas",
      "tasks": [
        {
          "id": "TX01",
          "title": "UI estática dashboard",
          "detail": [
            "ui/index.html + ui/app.js + ui/styles.css",
            "Lee tasks.data.js (window.__TASKS__) o fetch tasks.json fallback",
            "Filtros: estado, fase. Stats: % completado",
            "Sin framework, vanilla JS"
          ],
          "files": [
            "ui/index.html",
            "ui/app.js",
            "ui/styles.css",
            "ui/tasks.data.js"
          ],
          "depends_on": [],
          "status": "done",
          "started_at": "2026-05-04T15:55:15.150Z",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "completed_at": "2026-05-04T15:55:17.688Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T15:55:20.017Z"
    },
    {
      "id": "P11",
      "name": "Catálogo masivo Bancard + MCC enriquecido",
      "tasks": [
        {
          "id": "T1101",
          "title": "Migration: tabla mcc agregar categoria_id",
          "detail": [
            "drizzle: agregar columna categoria_id uuid nullable, FK categorias(id)",
            "Mantener mcc.codigo unique pa lookup",
            "Generar migration con drizzle-kit generate",
            "Aplicar con drizzle-kit migrate"
          ],
          "files": [
            "src/db/schema/mcc.ts",
            "drizzle/*.sql"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "test": "pass",
            "lint": "pass",
            "consistency": "pass"
          },
          "started_at": "2026-05-04T18:09:57.637Z",
          "completed_at": "2026-05-04T18:10:35.984Z"
        },
        {
          "id": "T1102",
          "title": "Migration: comercios_catalogo enriquecer columnas",
          "detail": [
            "Agregar: bancard_id text, codigo_comercio text, mcc_original text",
            "Agregar: fuente_categoria fuente_categoria_enum, confianza numeric(3,2), requiere_revision boolean default false",
            "Agregar: evidencia jsonb",
            "Index único compuesto (bancard_id, codigo_comercio) where bancard_id is not null"
          ],
          "files": [
            "src/db/schema/comercios.ts",
            "drizzle/*.sql"
          ],
          "depends_on": [
            "T1101"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:11:59.989Z",
          "completed_at": "2026-05-04T18:13:00.734Z"
        },
        {
          "id": "T1103",
          "title": "Convertir xlsx → TSV (3 archivos)",
          "detail": [
            "Script scripts/xlsx-to-tsv.mjs",
            "Lee 'Comercios pagados por QR 2026-csv (1).xlsx'",
            "Output data/mcc-general.tsv (541 filas) + data/comercios-bancard-raw.tsv (108982)",
            "Descartar hoja MCC COMMERCES (basura #N/A)"
          ],
          "files": [
            "scripts/xlsx-to-tsv.mjs",
            "data/mcc-general.tsv",
            "data/comercios-bancard-raw.tsv"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:13:03.868Z",
          "completed_at": "2026-05-04T18:14:03.567Z"
        },
        {
          "id": "T1104",
          "title": "Loader MCC GENERAL → tabla mcc",
          "detail": [
            "src/db/loaders/mcc-general.ts usa runLoader genérico",
            "Mapea codigo, descripcion. categoria_id queda null inicial",
            "Upsert por codigo (onConflictDoUpdate descripcion)",
            "Script package.json: db:load:mcc-general"
          ],
          "files": [
            "src/db/loaders/mcc-general.ts",
            "scripts/load.ts",
            "package.json"
          ],
          "depends_on": [
            "T1101",
            "T1103"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:14:05.931Z",
          "completed_at": "2026-05-04T18:15:58.307Z"
        },
        {
          "id": "T1105",
          "title": "Plantilla mapeo MCC → categoría",
          "detail": [
            "Script scripts/export-mcc-mapping.mjs lee tabla mcc",
            "Output data/mcc-categoria-mapping.tsv (codigo, descripcion, categoria_slug vacío)",
            "User llena slug manualmente (off-task)",
            "Documentar workflow en README sección 'Mapeo MCC'"
          ],
          "files": [
            "scripts/export-mcc-mapping.mjs",
            "data/mcc-categoria-mapping.tsv",
            "README.md"
          ],
          "depends_on": [
            "T1104"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:16:00.724Z",
          "completed_at": "2026-05-04T18:17:10.400Z"
        },
        {
          "id": "T1106",
          "title": "Loader mapeo MCC→categoria (aplica plantilla)",
          "detail": [
            "src/db/loaders/mcc-categoria.ts",
            "Lee mcc-categoria-mapping.tsv, resolve categoria_slug → id",
            "UPDATE mcc SET categoria_id donde codigo match",
            "Skip filas sin slug. Reporta cobertura final"
          ],
          "files": [
            "src/db/loaders/mcc-categoria.ts",
            "scripts/load.ts",
            "package.json"
          ],
          "depends_on": [
            "T1105"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:17:17.711Z",
          "completed_at": "2026-05-04T18:17:58.069Z"
        },
        {
          "id": "T1107",
          "title": "Preprocess: split MANGO-P2P vs comercios reales",
          "detail": [
            "Script scripts/preprocess-bancard.mjs",
            "Lee comercios-bancard-raw.tsv",
            "Split: Nombre prefijo /^MANGO-/ → mango-p2p.tsv (~60k)",
            "Resto → comercios-bancard-staged.tsv (~49k)",
            "Log conteos pa verificación"
          ],
          "files": [
            "scripts/preprocess-bancard.mjs",
            "data/mango-p2p.tsv",
            "data/comercios-bancard-staged.tsv"
          ],
          "depends_on": [
            "T1103"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:18:00.837Z",
          "completed_at": "2026-05-04T18:18:18.657Z"
        },
        {
          "id": "T1108",
          "title": "Preprocess: dedup bancardId con MCC ganador",
          "detail": [
            "Extender preprocess-bancard.mjs",
            "Group by bancardId+codigoComercio, elegir MCC más frecuente no-null/SIN RUBRO",
            "Si conflicto irresoluble (>1 MCC válido distinto) → flag conflicto en columna extra",
            "Output sobrescribe comercios-bancard-staged.tsv"
          ],
          "files": [
            "scripts/preprocess-bancard.mjs"
          ],
          "depends_on": [
            "T1107"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:18:21.256Z",
          "completed_at": "2026-05-04T18:19:01.303Z"
        },
        {
          "id": "T1109",
          "title": "Refactor csv.ts: streaming + batches",
          "detail": [
            "Soporte readCsvStream con csv-parse stream API",
            "runLoader en modo batch: insert 500 filas con onConflictDoUpdate",
            "Progress log cada 1000 filas",
            "Backwards compat con loaders existentes (sync mode default)"
          ],
          "files": [
            "src/db/loaders/csv.ts",
            "src/db/loaders/csv.test.ts"
          ],
          "depends_on": [
            "T1102"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:19:04.127Z",
          "completed_at": "2026-05-04T18:20:06.343Z"
        },
        {
          "id": "T1110",
          "title": "Loader transferencias P2P (MANGO-*)",
          "detail": [
            "src/db/loaders/mango-p2p.ts",
            "Insert masivo en comercios_catalogo categoria=transferencia (slug fijo)",
            "fuente_categoria='heuristica', confianza=0.95, evidencia={patron:'MANGO-'}",
            "Asegurar categoria 'transferencia' existe en seed",
            "Script: db:load:mango-p2p"
          ],
          "files": [
            "src/db/loaders/mango-p2p.ts",
            "src/db/seeds/categorias.ts",
            "package.json"
          ],
          "depends_on": [
            "T1109"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:20:09.633Z",
          "completed_at": "2026-05-04T18:22:22.448Z"
        },
        {
          "id": "T1111",
          "title": "Cascada catálogo: extracción a función pura",
          "detail": [
            "src/pipeline/cascada-catalogo.ts",
            "Función categorizarComercio(row, ctx) → {categoriaId, fuente, confianza, requiereRevision, evidencia}",
            "Orden: regex(reglas) → MCC oficial → patrones nombre → fallback otros+revisión",
            "Reusa capas existentes (regex, mcc) en modo batch (load reglas/mcc 1 vez)"
          ],
          "files": [
            "src/pipeline/cascada-catalogo.ts",
            "src/pipeline/cascada-catalogo.test.ts"
          ],
          "depends_on": [
            "T1106"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:22:25.408Z",
          "completed_at": "2026-05-04T18:23:34.801Z"
        },
        {
          "id": "T1112",
          "title": "Loader masivo comercios-bancard con cascada",
          "detail": [
            "src/db/loaders/comercios-bancard-masivo.ts",
            "Lee comercios-bancard-staged.tsv en stream",
            "Aplica cascada-catalogo por fila",
            "Batch upsert 500 filas en comercios_catalogo (target: bancard_id+codigo_comercio)",
            "Progress log cobertura por fuente cada 5000",
            "Script: db:load:comercios-bancard-masivo"
          ],
          "files": [
            "src/db/loaders/comercios-bancard-masivo.ts",
            "scripts/load.ts",
            "package.json"
          ],
          "depends_on": [
            "T1110",
            "T1111"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:23:37.727Z",
          "completed_at": "2026-05-04T18:26:08.581Z"
        },
        {
          "id": "T1113",
          "title": "Reporte cobertura SQL",
          "detail": [
            "Script scripts/report-cobertura.mjs",
            "Queries: count por fuente_categoria, % requiere_revision, top categorias, MCCs sin mapeo usados",
            "Output tabla en consola pa validar resultado masivo",
            "Documentar en README cómo correr"
          ],
          "files": [
            "scripts/report-cobertura.mjs",
            "README.md"
          ],
          "depends_on": [
            "T1112"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:26:11.206Z",
          "completed_at": "2026-05-04T18:26:42.684Z"
        },
        {
          "id": "T1114",
          "title": "Pipeline runtime: priorizar catálogo enriquecido",
          "detail": [
            "Verificar capa comercio usa nuevo catálogo (bancard_id lookup directo)",
            "Si comercios_catalogo trae fuente+confianza, propagar a movimiento sin recalcular",
            "Test integración: movimiento con bancardId conocido → categoría inmediata sin IA"
          ],
          "files": [
            "src/layers/comercio.ts",
            "src/layers/comercio.test.ts"
          ],
          "depends_on": [
            "T1112"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:26:45.683Z",
          "completed_at": "2026-05-04T18:27:57.343Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T18:27:59.928Z"
    },
    {
      "id": "P12",
      "name": "Inferencia por marca (recuperar MCC de sucursales hermanas)",
      "tasks": [
        {
          "id": "T1201",
          "title": "Migration: comercios_catalogo agregar marca + mcc_inferido",
          "detail": [
            "Agregar columna marca text nullable (brand_key extraído)",
            "Agregar columna mcc_inferido boolean default false",
            "Index marca (no único) pa lookups por marca",
            "drizzle generate + migrate"
          ],
          "files": [
            "src/db/schema/comercios_catalogo.ts",
            "src/db/migrations/*.sql"
          ],
          "depends_on": [
            "T1114"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:35:50.344Z",
          "completed_at": "2026-05-04T18:36:10.318Z"
        },
        {
          "id": "T1202",
          "title": "Función pura extractBrand(nombre)",
          "detail": [
            "src/domain/brand.ts: extractBrand(nombre): string | null",
            "Normaliza, quita sufijos ubicación/numéricos (-YPANE, -CENTRO, -SUCURSAL, II, III, números)",
            "Corta en primer separador (- / espacio+digit)",
            "Mínimo 4 chars válidos. Si menos → null",
            "Tests unit con casos: BRISTOL-YPANE→BRISTOL, ENERGY 2→ENERGY, COPETROL→COPETROL, EL CACIQUE-ITAUGUA→EL CACIQUE"
          ],
          "files": [
            "src/domain/brand.ts",
            "src/domain/brand.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:36:13.240Z",
          "completed_at": "2026-05-04T18:37:14.580Z"
        },
        {
          "id": "T1203",
          "title": "Preprocess: brand grouping + MCC inference",
          "detail": [
            "Extender scripts/preprocess-bancard.mjs",
            "Para cada fila: calcular brand_key (puerta a JS port de extractBrand o duplicar lógica)",
            "Group by brand_key, contar MCCs válidos",
            "Si grupo tiene >=2 filas y >=1 MCC válido → MCC ganador (más frecuente)",
            "Filas con MCC inválido (SIN RUBRO/null/'') heredan ganador, flag mcc_inferido=1",
            "Output: agregar columnas 'marca' y 'mcc_inferido' al staged.tsv",
            "Log conteos: filas rescatadas por inferencia, top 10 marcas por filas afectadas"
          ],
          "files": [
            "scripts/preprocess-bancard.mjs"
          ],
          "depends_on": [
            "T1202"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:37:18.471Z",
          "completed_at": "2026-05-04T18:38:09.833Z"
        },
        {
          "id": "T1204",
          "title": "Cascada: soportar MCC inferido con confianza reducida",
          "detail": [
            "Extender FilaBancard con marca, mccInferido",
            "En categorizarComercio: si mccInferido y MCC mapea a categoría → fuente='mcc', confianza=0.60, evidencia.mcc_inferido=true, evidencia.marca",
            "requiereRevision=true (confianza < threshold 0.7)",
            "Tests: BRISTOL inferido 5399→ropa con confianza 0.6 + revisión",
            "MCC válido directo sigue confianza 0.75 (sin cambio)"
          ],
          "files": [
            "src/pipeline/cascada-catalogo.ts",
            "src/pipeline/cascada-catalogo.test.ts"
          ],
          "depends_on": [
            "T1201"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:38:13.042Z",
          "completed_at": "2026-05-04T18:38:47.006Z"
        },
        {
          "id": "T1205",
          "title": "Loader masivo: persistir marca + mcc_inferido + reporte",
          "detail": [
            "Actualizar comercios-bancard-masivo.ts: leer columnas marca/mcc_inferido del TSV",
            "Pasar a categorizarComercio + persistir en comercios_catalogo",
            "Extender scripts/report-cobertura.mjs: nueva sección 'rescatados por inferencia marca'",
            "Re-correr loader masivo, verificar mejora cobertura en reporte"
          ],
          "files": [
            "src/db/loaders/comercios-bancard-masivo.ts",
            "scripts/report-cobertura.mjs"
          ],
          "depends_on": [
            "T1203",
            "T1204"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:38:50.009Z",
          "completed_at": "2026-05-04T18:40:02.254Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T18:40:04.846Z"
    },
    {
      "id": "P13",
      "name": "Activar catálogo en runtime + fixes integración",
      "tasks": [
        {
          "id": "T1301",
          "title": "Fix validador MCC: aceptar vacío/SIN RUBRO → null",
          "detail": [
            "src/api/routes/categorizar.ts: ajustar zod schema mcc",
            "Pre-process: '' / 'SIN RUBRO' / 'null' (case-insensitive) → null antes de validar regex",
            "Mantener regex /^\\d{2,4}$/ pa valores no-null",
            "Tests: aceptar mcc=null, mcc='', mcc='SIN RUBRO', rechazar 'foo'"
          ],
          "files": [
            "src/api/routes/categorizar.ts",
            "src/api/routes/categorizar.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:53:45.746Z",
          "completed_at": "2026-05-04T18:54:18.864Z"
        },
        {
          "id": "T1302",
          "title": "Lookup runtime por bancardId/codigoComercio en catálogo",
          "detail": [
            "Extender MovimientoInput con bancardId? + codigoComercio? opcionales",
            "src/db/repos/comercios.ts: nuevo lookup porBancardCodigo(bancardId, codigoComercio)",
            "Nueva capa src/layers/catalogo.ts: evalúa por bancardId+codigo, propaga fuente/confianza/evidencia del catálogo",
            "Pipeline cascada: insertar capa catálogo PRIMERO (antes regex)",
            "Si hit catálogo con confianza ≥0.7 + !requiere_revision → return inmediato sin más capas"
          ],
          "files": [
            "src/domain/types.ts",
            "src/db/repos/comercios.ts",
            "src/layers/catalogo.ts",
            "src/layers/catalogo.test.ts",
            "src/pipeline/categorizar.ts",
            "src/main.ts"
          ],
          "depends_on": [
            "T1301"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:54:21.835Z",
          "completed_at": "2026-05-04T18:55:53.154Z"
        },
        {
          "id": "T1303",
          "title": "Seed reglas_regex: MANGO, AZAR, SLOTS, juego",
          "detail": [
            "Extender data/reglas.csv con: ^MANGO\\b → transferencia, AZAR|SLOT|TRAGAMONEDA|CASINO|GAMING|APUESTA → azar",
            "Verificar prioridad correcta (MANGO antes que otras)",
            "Re-correr pnpm db:load:reglas",
            "Test: capa regex evalúa 'MANGO PEREZ' → transferencia, 'AZAR LATINO' → azar"
          ],
          "files": [
            "data/reglas.csv",
            "src/layers/regex.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:55:57.485Z",
          "completed_at": "2026-05-04T18:57:17.347Z"
        },
        {
          "id": "T1304",
          "title": "Agregar 13 MCCs faltantes a mcc_catalogo",
          "detail": [
            "MCCs presentes en COMMERCES pero no en MCC GENERAL: 7995, 4812, 6513, 8699, 8398, 3722, 8661, 5631, 8641, 7994, 5122, 5912, 5310 (verificar)",
            "Agregar manualmente con descripción + categoría: 7995→azar, 4812→servicios, 6513→financiero, 8699→servicios, etc.",
            "Insertar en data/mcc-categoria-mapping.tsv",
            "Re-correr pnpm db:load:mcc-categoria"
          ],
          "files": [
            "data/mcc-categoria-mapping.tsv",
            "scripts/load.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:57:20.249Z",
          "completed_at": "2026-05-04T18:58:44.498Z"
        },
        {
          "id": "T1305",
          "title": "Tests e2e runtime con catálogo cargado",
          "detail": [
            "src/pipeline/e2e.test.ts: agregar casos",
            "BRISTOL-YPANE+SIN RUBRO → ropa via catálogo (MCC inferido)",
            "MANGO-PEREZ → transferencia via regex",
            "AZAR LATINO → azar via regex",
            "BIGGIE → supermercado via catálogo o regex",
            "Comercio desconocido → IA fallback con requiere_revision",
            "Asegurar mocks DB con catálogo populado"
          ],
          "files": [
            "src/pipeline/e2e.test.ts"
          ],
          "depends_on": [
            "T1302",
            "T1303",
            "T1304"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T18:58:48.558Z",
          "completed_at": "2026-05-04T18:59:26.297Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T18:59:28.876Z"
    },
    {
      "id": "P14",
      "name": "Test masivo 109k vía API + análisis baseline",
      "tasks": [
        {
          "id": "T1401",
          "title": "Migration: movimientos agregar origen + batch_id",
          "detail": [
            "Schema: origen text not null default 'api', batch_id text nullable",
            "Index parcial batch_id (where batch_id is not null) pa filtrado rápido",
            "drizzle generate + migrate",
            "Tests: insert con/sin batch_id"
          ],
          "files": [
            "src/db/schema/movimientos.ts",
            "src/db/migrations/*.sql"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:17:46.066Z",
          "completed_at": "2026-05-04T19:18:19.391Z"
        },
        {
          "id": "T1402",
          "title": "API acepta origen + batch_id en request",
          "detail": [
            "Extender categorizar.schema.ts: origen?, batch_id? opcionales (max 100 chars)",
            "Pasar a MovimientoInput → persistirMovimiento → INSERT movimientos",
            "Default origen='api' si no viene",
            "Tests schema: acepta vacíos, valida longitud",
            "Tests route: row tiene origen+batch_id correcto"
          ],
          "files": [
            "src/api/schemas/categorizar.ts",
            "src/api/routes/categorizar.ts",
            "src/domain/types.ts",
            "src/db/repos/movimientos.ts",
            "src/pipeline/persistir.ts",
            "src/api/schemas/categorizar.test.ts"
          ],
          "depends_on": [
            "T1401"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:18:23.799Z",
          "completed_at": "2026-05-04T19:19:27.740Z"
        },
        {
          "id": "T1403",
          "title": "Runner test masivo concurrente",
          "detail": [
            "scripts/test-masivo.ts: lee comercios-bancard-staged.tsv + mango-p2p.tsv",
            "Para cada fila POST /categorizar-movimiento con bancard_id, codigo_comercio, nombre_bancard, mcc",
            "Concurrencia 30 (semáforo simple, sin libs externas)",
            "Captura: status HTTP, latency_ms, response body",
            "batch_id = 'test-' + ISO timestamp",
            "Output streaming a data/test-results.ndjson (1 línea por request)",
            "Progress log cada 5000 filas",
            "Args: --limit N (sample), --concurrency N, --base-url"
          ],
          "files": [
            "scripts/test-masivo.ts",
            "package.json"
          ],
          "depends_on": [
            "T1402"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:19:30.593Z",
          "completed_at": "2026-05-04T19:20:15.405Z"
        },
        {
          "id": "T1404",
          "title": "Análisis SQL post-batch + reporte",
          "detail": [
            "scripts/analyze-test-batch.mjs <batch_id>",
            "Queries: count total, distribución fuente, agreement vs catálogo, top mismatches",
            "Comparar movimientos.categoria_predicha_id vs catálogo (join por bancard_id+codigo)",
            "Output: tabla consola + data/test-summary-<batch>.json",
            "Sección mismatches: top 50 con nombre, fuente runtime, fuente catálogo, ambas categorías"
          ],
          "files": [
            "scripts/analyze-test-batch.mjs"
          ],
          "depends_on": [
            "T1403"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:20:18.984Z",
          "completed_at": "2026-05-04T19:21:20.540Z"
        },
        {
          "id": "T1405",
          "title": "Endpoint stats: GET /test-batch/:batch_id/stats",
          "detail": [
            "Nueva ruta src/api/routes/test-batch-stats.ts",
            "Path param batch_id, valida no vacío",
            "Auth con apiKeyAuth (igual que otras rutas)",
            "Queries agregadas: total, fuente dist, latencia (p50/p95/p99/max/avg), cobertura, top categorías, agreement vs catálogo, últimos N mismatches, últimos N movimientos",
            "Response JSON estructurado pa consumir desde UI",
            "Cache resultado 1s pa no saturar DB con polling",
            "Tests con fastify.inject"
          ],
          "files": [
            "src/api/routes/test-batch-stats.ts",
            "src/api/routes/test-batch-stats.test.ts",
            "src/main.ts"
          ],
          "depends_on": [
            "T1402"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:23:21.953Z",
          "completed_at": "2026-05-04T19:24:52.584Z"
        },
        {
          "id": "T1406",
          "title": "UI test monitor: dashboard realtime",
          "detail": [
            "ui/test-monitor/index.html + app.js + styles.css (vanilla, sin frameworks)",
            "Input: batch_id + API key (persiste en localStorage)",
            "Polling /test-batch/:batch/stats cada 2s",
            "Render KPIs: total/objetivo + barra progreso, throughput req/s, elapsed, ETA, errores",
            "Histograma latencia (buckets 0-10/10-25/25-50/50-100/100-500/500+ ms)",
            "Gráfico fuente categoría (barras horizontales count + %)",
            "Donut cobertura sync_ok / revisión / sin_categoría",
            "Buckets confianza ≥0.9 / 0.7-0.89 / 0.5-0.69 / <0.5",
            "Top 10 categorías live",
            "Agreement % vs catálogo + tabla últimos 20 mismatches",
            "Stream últimos 30 movimientos auto-scroll",
            "Botón pause/resume polling"
          ],
          "files": [
            "ui/test-monitor/index.html",
            "ui/test-monitor/app.js",
            "ui/test-monitor/styles.css"
          ],
          "depends_on": [
            "T1405"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:24:55.439Z",
          "completed_at": "2026-05-04T19:26:16.199Z"
        },
        {
          "id": "T1407",
          "title": "Ejecutar 109k + investigar mismatches",
          "detail": [
            "Levantar API: ./restart.sh, verificar /health",
            "Correr test-masivo.ts con full dataset, batch_id 'baseline-v1'",
            "Esperar finalización (estimado: 109k @ 30 conc @ 50ms = ~3 min)",
            "Correr analyze-test-batch.mjs baseline-v1",
            "Documentar baseline en docs/test-baseline-v1.md: agreement %, latencia p50/p95/p99, fuente dist",
            "Identificar top 5 patrones de mismatch (ej. capa nombre LIKE muy laxo)",
            "Si mismatch >5% → crear sub-tareas fix"
          ],
          "files": [
            "docs/test-baseline-v1.md"
          ],
          "depends_on": [
            "T1406"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:37:18.393Z",
          "completed_at": "2026-05-04T19:39:27.872Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T19:39:30.726Z"
    },
    {
      "id": "P15",
      "name": "Dashboard control + UI integrada",
      "tasks": [
        {
          "id": "T1501",
          "title": "Fastify static: servir ui/ desde API",
          "detail": [
            "Instalar @fastify/static",
            "Registrar plugin con root=ui/, prefix=/ui/",
            "Verificar acceso http://localhost:3000/ui/test-monitor/index.html",
            "Ajustar UI default base-url a window.location.origin si está bajo /ui/"
          ],
          "files": [
            "src/api/server.ts",
            "src/main.ts",
            "ui/test-monitor/app.js",
            "package.json"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:43:57.308Z",
          "completed_at": "2026-05-04T19:45:18.572Z"
        },
        {
          "id": "T1502",
          "title": "Worker controller in-process pa runs",
          "detail": [
            "src/test-batch/runner.ts: clase TestBatchRunner con start(batchId, opts), stop(batchId), list()",
            "Lee TSV streaming, ejecuta ejecutarCascada + persistirMovimiento directo (sin HTTP)",
            "Concurrencia configurable (default 30) con semáforo simple",
            "Estado: queued | running | done | cancelled | error",
            "Tracking por batchId: total, processed, ok, errors, startedAt, finishedAt",
            "Cancellation: AbortController, worker chequea entre filas",
            "Tests unit con mocks pipeline + repo"
          ],
          "files": [
            "src/test-batch/runner.ts",
            "src/test-batch/runner.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:45:23.017Z",
          "completed_at": "2026-05-04T19:46:18.749Z"
        },
        {
          "id": "T1503",
          "title": "Endpoints control: start/stop/list",
          "detail": [
            "POST /test-batch/start body {batch_id, files?, limit?, concurrency?}",
            "POST /test-batch/stop body {batch_id}",
            "GET /test-batch/list",
            "Auth con apiKeyAuth",
            "Validación zod (batch_id min 1, concurrency 1-100, limit positivo)",
            "Tests con fastify.inject"
          ],
          "files": [
            "src/api/routes/test-batch-control.ts",
            "src/api/routes/test-batch-control.test.ts",
            "src/api/schemas/test-batch.ts",
            "src/main.ts"
          ],
          "depends_on": [
            "T1502"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:46:22.084Z",
          "completed_at": "2026-05-04T19:47:05.987Z"
        },
        {
          "id": "T1504",
          "title": "UI controls: start/stop/list + status",
          "detail": [
            "Form en topbar: batch_id, limit, concurrency, files",
            "Botones: Start (POST /test-batch/start), Stop (POST /test-batch/stop)",
            "Indicador estado worker: idle/running/done/cancelled/error",
            "Auto-fetch stats cada 1s mientras running, cada 5s done",
            "Mostrar progress (processed/total) del runner además de DB stats",
            "Tabla 'Runs activos' (GET /test-batch/list refresca cada 3s)"
          ],
          "files": [
            "ui/test-monitor/index.html",
            "ui/test-monitor/app.js",
            "ui/test-monitor/styles.css"
          ],
          "depends_on": [
            "T1503",
            "T1501"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:47:08.944Z",
          "completed_at": "2026-05-04T19:48:31.290Z"
        },
        {
          "id": "T1505",
          "title": "Validación end-to-end + cleanup",
          "detail": [
            "Test manual: abrir /ui/test-monitor/, start batch sample 1k → verificar UI live",
            "Test 109k full vía dashboard, comparar vs CLI baseline-v2",
            "Verificar stop cancela worker correctamente (movimientos parciales OK)",
            "Doc: README sección 'Test interactivo via UI'",
            "Cleanup batches viejos opcional (DELETE WHERE batch_id IN (...))"
          ],
          "files": [
            "README.md"
          ],
          "depends_on": [
            "T1504"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:48:39.768Z",
          "completed_at": "2026-05-04T19:50:36.982Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T19:50:39.848Z"
    },
    {
      "id": "P16",
      "name": "Precisión runtime: fix falsos positivos capa nombre + propagación catálogo",
      "tasks": [
        {
          "id": "T1601",
          "title": "Capa comercio: longitud mínima + score umbral",
          "detail": [
            "src/layers/comercio.ts: rechazar input texto <5 chars antes de buscar (skip CIT, GAB, NGO, EDU, etc)",
            "Score mínimo configurable (default 0.75) pa match parcial",
            "Tests: input 'CIT' → null, 'COMERC SAN CAYETANO' vs 'SAN CAYETANO' (score 0.68) → null",
            "Test: 'COPETROL' vs 'COPETROL' (score 1.0) → match exacto sigue funcionando",
            "Documentar threshold en código"
          ],
          "files": [
            "src/layers/comercio.ts",
            "src/layers/comercio.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T19:58:43.668Z",
          "completed_at": "2026-05-04T20:00:13.605Z"
        },
        {
          "id": "T1602",
          "title": "Capa catálogo: devolver hit aunque requiereRevision=true",
          "detail": [
            "src/layers/catalogo.ts: si hit existe, devolver siempre (no skip por requiereRevision)",
            "Propagar requiereRevision al resultado pipeline",
            "Pipeline persistir respeta requiereRevision del catálogo",
            "Trade-off: runtime usa categoría conservadora del catálogo en vez de buscar falso positivo en capas inferiores",
            "Tests: hit revision=true → devuelve categoría con flag, no sigue cascada"
          ],
          "files": [
            "src/layers/catalogo.ts",
            "src/layers/catalogo.test.ts",
            "src/pipeline/categorizar.ts",
            "src/domain/types.ts",
            "src/pipeline/persistir.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:00:17.164Z",
          "completed_at": "2026-05-04T20:01:09.739Z"
        },
        {
          "id": "T1603",
          "title": "Regla regex COMERC/COMERCIAL → supermercado",
          "detail": [
            "Agregar reglas en src/db/loaders/reglas.ts: \\bCOMERC\\b|\\bCOMERCIAL\\b → supermercado prioridad 25 (no compite con BIGGIE etc)",
            "Verificar no rompe AZAR/MANGO existentes",
            "Re-correr db:load:reglas",
            "Test capa regex"
          ],
          "files": [
            "src/db/loaders/reglas.ts",
            "src/layers/regex.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:01:13.248Z",
          "completed_at": "2026-05-04T20:02:03.179Z"
        },
        {
          "id": "T1604",
          "title": "Re-test 109k baseline-v3 + comparar mejoras",
          "detail": [
            "Limpiar baseline-v1 y baseline-v2: DELETE FROM movimientos WHERE batch_id IN ('baseline-v1','baseline-v2','test-1','ui-test-1')",
            "Restart API",
            "Correr pnpm test:masivo --batch-id baseline-v3",
            "node scripts/analyze-test-batch.mjs baseline-v3",
            "Comparar agreement % vs baseline-v2 (esperar mejora 99.87% → ≥99.95%)",
            "Documentar en docs/test-baseline-v3.md cambios + delta"
          ],
          "files": [
            "docs/test-baseline-v3.md"
          ],
          "depends_on": [
            "T1601",
            "T1602",
            "T1603"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:02:06.757Z",
          "completed_at": "2026-05-04T20:03:45.173Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T20:03:48.007Z"
    },
    {
      "id": "P17",
      "name": "Validación real cascada: bypass catálogo + agreement honesto",
      "tasks": [
        {
          "id": "T1701",
          "title": "Flag bypass_catalogo en API /categorizar-movimiento",
          "detail": [
            "src/api/schemas/categorizar.ts: agregar bypass_catalogo? boolean optional",
            "src/api/routes/categorizar.ts: pasar flag a ejecutarCascada",
            "src/pipeline/categorizar.ts: si bypass_catalogo=true, saltar capa catálogo",
            "Tests schema + e2e",
            "Persistir movimiento con evidencia.bypass_catalogo=true pa trazabilidad"
          ],
          "files": [
            "src/api/schemas/categorizar.ts",
            "src/api/routes/categorizar.ts",
            "src/pipeline/categorizar.ts",
            "src/db/schema/movimientos.ts",
            "src/api/schemas/categorizar.test.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:15:03.415Z",
          "completed_at": "2026-05-04T20:15:44.630Z"
        },
        {
          "id": "T1702",
          "title": "Worker masivo soporta bypass + endpoint start",
          "detail": [
            "src/test-batch/runner.ts: BatchOpts.bypassCatalogo? boolean",
            "Worker pasa flag a ejecutarCascada",
            "src/api/schemas/test-batch.ts: agregar bypass_catalogo en start request",
            "Endpoint start propaga al runner",
            "Tests runner + endpoint"
          ],
          "files": [
            "src/test-batch/runner.ts",
            "src/test-batch/runner.test.ts",
            "src/api/schemas/test-batch.ts",
            "src/api/routes/test-batch-control.ts",
            "src/api/routes/test-batch-control.test.ts",
            "src/pipeline/categorizar.ts"
          ],
          "depends_on": [
            "T1701"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:15:48.189Z",
          "completed_at": "2026-05-04T20:16:35.368Z"
        },
        {
          "id": "T1703",
          "title": "Stats: agreement honesto en bypass batches",
          "detail": [
            "Detectar si batch corrió con bypass (chequear evidencia.bypass_catalogo en muestra)",
            "Mostrar tag visible en endpoint response (modo='cascada_pura' vs 'con_catalogo')",
            "Agreement query igual (sigue comparando vs catálogo)",
            "UI: badge en runner status indicando modo bypass",
            "Tests"
          ],
          "files": [
            "src/api/routes/test-batch-stats.ts",
            "src/db/repos/test-batch-stats.ts",
            "ui/test-monitor/app.js",
            "ui/test-monitor/styles.css"
          ],
          "depends_on": [
            "T1702"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:16:40.154Z",
          "completed_at": "2026-05-04T20:17:26.141Z"
        },
        {
          "id": "T1704",
          "title": "UI control: checkbox bypass en form Run",
          "detail": [
            "ui/test-monitor/index.html: checkbox bypass_catalogo",
            "app.js: incluir flag en payload start",
            "Visualmente diferenciar batches con bypass (color/icon en runner status)",
            "Tooltip explicando trade-off"
          ],
          "files": [
            "ui/test-monitor/index.html",
            "ui/test-monitor/app.js",
            "ui/test-monitor/styles.css"
          ],
          "depends_on": [
            "T1703"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:17:30.427Z",
          "completed_at": "2026-05-04T20:17:58.232Z"
        },
        {
          "id": "T1705",
          "title": "Ejecutar baseline-v4 con bypass + análisis honesto",
          "detail": [
            "TRUNCATE movimientos pa baseline limpio",
            "Run dash UI con batch_id 'baseline-v4' bypass=true",
            "Comparar agreement v3 (100% trampa) vs v4 (cascada pura real)",
            "Identificar dónde cascada pierde sin catálogo: ¿qué fuente cambia? ¿qué categorías?",
            "Documentar docs/test-baseline-v4.md con análisis honesto",
            "Si agreement <90% → identificar palancas pa mejorar cascada (más reglas regex, ampliar mcc, etc)"
          ],
          "files": [
            "docs/test-baseline-v4.md"
          ],
          "depends_on": [
            "T1704"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-04T20:18:04.851Z",
          "completed_at": "2026-05-04T20:21:56.657Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-04T20:21:59.447Z"
    },
    {
      "id": "P18",
      "name": "Gestión categorías UI completa",
      "tasks": [
        {
          "id": "T1801",
          "title": "CRUD categorías endpoints + persistencia extras",
          "detail": [
            "POST /categorias { slug, nombre, descripcion? }",
            "PATCH /categorias/:slug",
            "DELETE /categorias/:slug (check refs)",
            "GET /categorias/:slug/usage (counts movimientos/reglas/mcc/comercios)",
            "Persiste a data/categorias-extras.tsv",
            "Loader extras tras DEFAULTS",
            "Invalidar cache CategoriaResolver",
            "Validar slug [a-z0-9_]+ max 30",
            "Tests fastify.inject CRUD + edge cases"
          ],
          "files": [
            "src/api/routes/categorias.ts",
            "src/api/routes/categorias.test.ts",
            "src/api/schemas/categorias.ts",
            "src/db/repos/categorias.ts",
            "src/db/loaders/categorias.ts",
            "src/db/loaders/categorias-extras.ts",
            "src/main.ts",
            "data/categorias-extras.tsv",
            "scripts/load.ts"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:40:19.238Z",
          "completed_at": "2026-05-05T11:42:56.815Z"
        },
        {
          "id": "T1802",
          "title": "CRUD reglas regex endpoints + persistencia extras",
          "detail": [
            "GET /reglas?categoria=X",
            "POST /reglas {patron,categoria_slug,prioridad,descripcion?}",
            "PATCH /reglas/:id",
            "DELETE /reglas/:id",
            "POST /reglas/test {patron,texto} pa probar live",
            "Validar regex compilable (try new RegExp)",
            "Persiste data/reglas-extras.tsv",
            "Loader extras tras inline DEFAULTS",
            "Invalidar cache CapaRegex",
            "Tests"
          ],
          "files": [
            "src/api/routes/reglas.ts",
            "src/api/routes/reglas.test.ts",
            "src/api/schemas/reglas.ts",
            "src/db/repos/reglas.ts",
            "src/db/loaders/reglas.ts",
            "src/db/loaders/reglas-extras.ts",
            "src/main.ts",
            "data/reglas-extras.tsv",
            "scripts/load.ts"
          ],
          "depends_on": [
            "T1801"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:43:01.288Z",
          "completed_at": "2026-05-05T11:45:06.991Z"
        },
        {
          "id": "T1803",
          "title": "CRUD MCC mapping endpoints",
          "detail": [
            "GET /mcc?categoria=X|sin_categoria=true",
            "POST /mcc {cod_mcc,descripcion,categoria_slug?,ambiguo?}",
            "PATCH /mcc/:cod_mcc",
            "DELETE /mcc/:cod_mcc (block si refs)",
            "Persiste cambios a data/mcc-extras.tsv (existing file)",
            "Cache invalidate",
            "Tests"
          ],
          "files": [
            "src/api/routes/mcc.ts",
            "src/api/routes/mcc.test.ts",
            "src/api/schemas/mcc.ts",
            "src/db/repos/mcc.ts",
            "src/main.ts"
          ],
          "depends_on": [
            "T1801"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:45:10.972Z",
          "completed_at": "2026-05-05T11:46:44.554Z"
        },
        {
          "id": "T1804",
          "title": "Endpoint reproceso catálogo masivo",
          "detail": [
            "POST /catalogo/reprocess {truncate_first?:bool} → spawn worker",
            "Reutiliza TestBatchRunner extendido o nuevo CatalogoMassiveRunner",
            "Returns {batch_id,status} pa monitorear via /test-batch/list",
            "Mutex: solo 1 reproceso simultáneo",
            "Tests con sample"
          ],
          "files": [
            "src/api/routes/catalogo.ts",
            "src/api/routes/catalogo.test.ts",
            "src/api/schemas/catalogo.ts",
            "src/test-batch/catalogo-runner.ts",
            "src/main.ts"
          ],
          "depends_on": [
            "T1803"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:46:50.869Z",
          "completed_at": "2026-05-05T11:48:19.639Z"
        },
        {
          "id": "T1805",
          "title": "Tabla marcas_conocidas + IA dinámica",
          "detail": [
            "Migration: marcas_conocidas (id, categoria_id FK, marca, descripcion?)",
            "Seed migra constante MARCAS_PY actual",
            "CRUD endpoints /marcas",
            "Refactor src/layers/ia.ts: leer marcas DB con cache 60s",
            "Generar bloque MARCAS_PY dinámico",
            "Tests integración prompt incluye marca nueva tras crear"
          ],
          "files": [
            "src/db/schema/marcas_conocidas.ts",
            "src/db/migrations/*.sql",
            "src/db/repos/marcas.ts",
            "src/api/routes/marcas.ts",
            "src/api/routes/marcas.test.ts",
            "src/api/schemas/marcas.ts",
            "src/layers/ia.ts",
            "src/main.ts",
            "src/db/loaders/marcas.ts"
          ],
          "depends_on": [
            "T1801"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:48:23.365Z",
          "completed_at": "2026-05-05T11:52:06.811Z"
        },
        {
          "id": "T1806",
          "title": "UI listado categorías",
          "detail": [
            "ui/categorias/index.html + app.js + styles.css (dark theme consistente)",
            "Lista con counts (mov/reglas/mcc/comercios)",
            "Botón + Nueva (modal form)",
            "Click row → /ui/categorias/[slug]/",
            "Botón Re-procesar catálogo (confirm + link a test-monitor)",
            "Nav links desde tester y test-monitor"
          ],
          "files": [
            "ui/categorias/index.html",
            "ui/categorias/app.js",
            "ui/categorias/styles.css",
            "ui/test-monitor/index.html",
            "ui/tester/index.html"
          ],
          "depends_on": [
            "T1804",
            "T1805"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:52:10.962Z",
          "completed_at": "2026-05-05T11:53:51.791Z"
        },
        {
          "id": "T1807",
          "title": "UI detalle categoría con tabs",
          "detail": [
            "ui/categorias/[slug]/index.html (single file, query param ?slug=X)",
            "Tabs: Info | Reglas | MCCs | Marcas",
            "Form editar info",
            "Tabla reglas inline CRUD + probar patron",
            "Tabla MCCs filtrable + asignar/quitar",
            "Tabla marcas CRUD",
            "Eliminar categoría (mostrar usage si bloqueado)"
          ],
          "files": [
            "ui/categorias/detalle.html",
            "ui/categorias/detalle.js",
            "ui/categorias/styles.css"
          ],
          "depends_on": [
            "T1806"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:53:55.942Z",
          "completed_at": "2026-05-05T11:55:08.682Z"
        },
        {
          "id": "T1808",
          "title": "E2E verificación + doc",
          "detail": [
            "Test integración src/api/categorias-flow.test.ts cubriendo pasos 1-12",
            "doc docs/categorias-e2e.md con pasos manuales UI",
            "README sección 'Gestión categorías via UI'",
            "Manual: crear mascotas, regla, MCC, marca, reprocess, validar predicciones, eliminar"
          ],
          "files": [
            "src/api/categorias-flow.test.ts",
            "docs/categorias-e2e.md",
            "README.md"
          ],
          "depends_on": [
            "T1807"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:55:43.615Z",
          "completed_at": "2026-05-05T11:57:23.925Z"
        }
      ],
      "validated": true,
      "validated_at": "2026-05-05T11:57:26.984Z"
    },
    {
      "id": "P19",
      "name": "UIs unificadas con shared layout + landing",
      "tasks": [
        {
          "id": "T1901",
          "title": "Shared layout: theme.css + state.js + api.js + nav.js",
          "detail": [
            "ui/shared/theme.css: CSS variables dark theme (colores, espaciados, tipografía)",
            "ui/shared/state.js: singleton window.tagger {baseUrl, apiKey, setApiKey, on(event,cb)}",
            "ui/shared/api.js: fetch wrapper con auth + manejo errores",
            "ui/shared/nav.js: auto-inject navbar (detecta página activa, persist API key entre tabs)",
            "Verificar: importar 4 scripts en HTML simple muestra nav + funciona api key sync"
          ],
          "files": [
            "ui/shared/theme.css",
            "ui/shared/state.js",
            "ui/shared/api.js",
            "ui/shared/nav.js"
          ],
          "depends_on": [],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T11:59:46.399Z",
          "completed_at": "2026-05-05T12:00:51.167Z"
        },
        {
          "id": "T1902",
          "title": "Landing /ui/index.html con health + counts + cards",
          "detail": [
            "Landing usa shared layout",
            "Cards: Categorías / Tester / Monitor / Tareas (con icons)",
            "Health badges: DB ok/fail, Ollama ok/fail (fetch /health)",
            "Counts: GET /categorias (count), GET /reglas (count), /marcas (count)",
            "Click card navega a sección"
          ],
          "files": [
            "ui/index.html"
          ],
          "depends_on": [
            "T1901"
          ],
          "status": "done",
          "gates_progress": {
            "consistency": "pass",
            "lint": "pass",
            "test": "pass"
          },
          "started_at": "2026-05-05T12:00:57.113Z",
          "completed_at": "2026-05-05T12:01:42.882Z"
        },
        {
          "id": "T1903",
          "title": "Mover dashboard tareas a /ui/tasks/index.html",
          "detail": [
            "mv ui/index.html → ui/tasks/index.html (renombrando, antiguo era dashboard tareas)",
            "Mover ui/app.js, ui/styles.css, ui/tasks.data.js → ui/tasks/",
            "Actualizar scripts/sync-tasks.mjs a generar ui/tasks/tasks.data.js",
            "Refactor pa usar shared nav"
          ],
          "files": [
            "ui/tasks/index.html",
            "ui/tasks/app.js",
            "ui/tasks/styles.css",
            "ui/tasks/tasks.data.js",
            "scripts/sync-tasks.mjs"
          ],
          "depends_on": [
            "T1901"
          ],
          "status": "in_progress",
          "gates_progress": {
            "consistency": "pending",
            "lint": "pending",
            "test": "pending"
          },
          "started_at": "2026-05-05T12:01:47.330Z"
        },
        {
          "id": "T1904",
          "title": "Refactor ui/categorias usa shared",
          "detail": [
            "Reemplazar topbar custom por shared nav",
            "Migrar API client a shared api.js",
            "Migrar config persistencia a shared state",
            "Theme.css en lugar de styles propios donde aplique"
          ],
          "files": [
            "ui/categorias/index.html",
            "ui/categorias/detalle.html",
            "ui/categorias/app.js",
            "ui/categorias/detalle.js",
            "ui/categorias/styles.css"
          ],
          "depends_on": [
            "T1901"
          ],
          "status": "pending",
          "gates_progress": {
            "consistency": "pending",
            "lint": "pending",
            "test": "pending"
          }
        },
        {
          "id": "T1905",
          "title": "Refactor ui/test-monitor usa shared",
          "detail": [
            "Reemplazar topbar custom por shared nav",
            "Migrar API client",
            "Mantener KPIs y gráficos",
            "Theme consistente"
          ],
          "files": [
            "ui/test-monitor/index.html",
            "ui/test-monitor/app.js",
            "ui/test-monitor/styles.css"
          ],
          "depends_on": [
            "T1901"
          ],
          "status": "pending",
          "gates_progress": {
            "consistency": "pending",
            "lint": "pending",
            "test": "pending"
          }
        },
        {
          "id": "T1906",
          "title": "Refactor ui/tester usa shared",
          "detail": [
            "Reemplazar header custom por shared nav",
            "Migrar API client",
            "Mantener form + history + correccion",
            "Theme consistente"
          ],
          "files": [
            "ui/tester/index.html",
            "ui/tester/app.js",
            "ui/tester/styles.css"
          ],
          "depends_on": [
            "T1901"
          ],
          "status": "pending",
          "gates_progress": {
            "consistency": "pending",
            "lint": "pending",
            "test": "pending"
          }
        },
        {
          "id": "T1907",
          "title": "Fastify: redirect /ui → /ui/index.html",
          "detail": [
            "src/api/server.ts: agregar redirect 302 /ui → /ui/index.html",
            "Verificar /ui/ devuelve landing",
            "Asegurar /ui/shared/* sirve correctamente"
          ],
          "files": [
            "src/api/server.ts"
          ],
          "depends_on": [
            "T1902"
          ],
          "status": "pending",
          "gates_progress": {
            "consistency": "pending",
            "lint": "pending",
            "test": "pending"
          }
        },
        {
          "id": "T1908",
          "title": "Verificación e2e nav unificada + doc",
          "detail": [
            "Probar nav entre todas: landing→tareas→tester→monitor→categorias→landing",
            "Verificar API key sync (set en una página, leer en otra)",
            "Verificar active state correcto en cada sección",
            "Doc README sección 'Servicio web unificado'"
          ],
          "files": [
            "README.md"
          ],
          "depends_on": [
            "T1903",
            "T1904",
            "T1905",
            "T1906",
            "T1907"
          ],
          "status": "pending",
          "gates_progress": {
            "consistency": "pending",
            "lint": "pending",
            "test": "pending"
          }
        }
      ]
    },
    {
      "id": "PNH",
      "name": "Nice to have (post-MVP)",
      "tasks": [
        {
          "id": "T010",
          "title": "Husky + lint-staged",
          "detail": [
            "Install husky lint-staged",
            "pre-commit: lint-staged + typecheck + tasks:sync",
            "lint-staged: *.ts → eslint --fix + prettier --write",
            "Razón diferida: check-task.mjs ya enforza gates antes done"
          ],
          "files": [
            ".husky/pre-commit",
            ".lintstagedrc.json"
          ],
          "depends_on": [
            "T003"
          ],
          "status": "pending"
        },
        {
          "id": "T103",
          "title": "Compose dev override",
          "detail": [
            "docker-compose.override.yml: bind mount src, command tsx watch",
            "Hot reload local sin rebuild",
            "Razón diferida: tsx watch local sin docker es más simple en dev"
          ],
          "files": [
            "docker-compose.override.yml"
          ],
          "depends_on": [
            "T102"
          ],
          "status": "pending"
        },
        {
          "id": "T607b",
          "title": "POST/PATCH categorías",
          "detail": [
            "POST /categorias (crear)",
            "PATCH /categorias/:id (rename, activo)",
            "Validar slug único",
            "Razón diferida: SQL directo basta MVP"
          ],
          "files": [
            "src/api/routes/categorias.ts"
          ],
          "depends_on": [
            "T607"
          ],
          "status": "pending"
        },
        {
          "id": "T701",
          "title": "Setup BullMQ",
          "detail": [
            "Install bullmq ioredis",
            "src/workers/queue.ts: queue 'ia-categorizacion'",
            "Conexión Redis desde env",
            "Razón diferida: T501b fire-and-forget cubre MVP. BullMQ cuando volumen justifique"
          ],
          "files": [
            "src/workers/queue.ts"
          ],
          "depends_on": [
            "T006"
          ],
          "status": "pending"
        },
        {
          "id": "T702",
          "title": "Producer encola desde pipeline",
          "detail": [
            "Reemplaza T501b con queue producer",
            "Job {movimiento_id} cuando capas síncronas fallan"
          ],
          "files": [
            "src/pipeline/categorizar.ts"
          ],
          "depends_on": [
            "T701",
            "T501"
          ],
          "status": "pending"
        },
        {
          "id": "T703",
          "title": "Worker consumer BullMQ",
          "detail": [
            "src/workers/ia-worker.ts: procesa job, llama capa IA, update movimiento",
            "Reintentos 3 con backoff exponencial",
            "Tests con queue test mode"
          ],
          "files": [
            "src/workers/ia-worker.ts",
            "src/workers/ia-worker.test.ts"
          ],
          "depends_on": [
            "T702",
            "T406"
          ],
          "status": "pending"
        },
        {
          "id": "T704",
          "title": "Entrypoint worker",
          "detail": [
            "src/workers/index.ts: arranca worker standalone",
            "Servicio compose separado, graceful shutdown SIGTERM"
          ],
          "files": [
            "src/workers/index.ts"
          ],
          "depends_on": [
            "T703"
          ],
          "status": "pending"
        },
        {
          "id": "T902",
          "title": "Métricas Prometheus",
          "detail": [
            "Install prom-client",
            "Counters: categorizaciones_total{fuente}, ia_jobs_total{status}",
            "Histogram latencia pipeline. GET /metrics",
            "Razón diferida: sin tráfico real no aporta señal"
          ],
          "files": [
            "src/api/plugins/metrics.ts"
          ],
          "depends_on": [
            "T601"
          ],
          "status": "pending"
        },
        {
          "id": "T903",
          "title": "Rate limit",
          "detail": [
            "@fastify/rate-limit, 100 req/min por api-key",
            "Razón diferida: single tenant interno, sin vector abuso"
          ],
          "files": [
            "src/api/plugins/rate-limit.ts"
          ],
          "depends_on": [
            "T602"
          ],
          "status": "pending"
        },
        {
          "id": "T904",
          "title": "CI Github Actions",
          "detail": [
            ".github/workflows/ci.yml",
            "Jobs: install, lint, typecheck, test (con postgres service), build",
            "Cache pnpm",
            "Razón diferida: gates locales cubren MVP"
          ],
          "files": [
            ".github/workflows/ci.yml"
          ],
          "depends_on": [
            "T009"
          ],
          "status": "pending"
        },
        {
          "id": "TX02",
          "title": "Servir UI desde API",
          "detail": [
            "@fastify/static sirve ui/ en /tasks-ui",
            "Razón diferida: UI funciona file://, no justifica mezclar concerns"
          ],
          "files": [
            "src/api/plugins/tasks-ui.ts"
          ],
          "depends_on": [
            "TX01",
            "T601"
          ],
          "status": "pending"
        },
        {
          "id": "TPH01",
          "title": "Job recategorización masiva",
          "detail": [
            "Script CLI: recorre movimientos, recorre pipeline, actualiza si cambia categoría",
            "Útil cuando se agregan reglas o se corrige mapping MCC",
            "Dry-run flag obligatorio"
          ],
          "files": [
            "scripts/recategorizar.ts"
          ],
          "depends_on": [
            "T501"
          ],
          "status": "pending"
        },
        {
          "id": "TPH02",
          "title": "Idempotencia movimientos",
          "detail": [
            "Hash (descripcion+monto+fecha+nombre_bancard) como unique constraint o lookup",
            "Endpoint detecta duplicado y devuelve movimiento existente sin recategorizar"
          ],
          "files": [
            "src/pipeline/persistir.ts"
          ],
          "depends_on": [
            "T502"
          ],
          "status": "pending"
        },
        {
          "id": "TPH03",
          "title": "Auto-aprendizaje correcciones",
          "detail": [
            "Analizar correcciones_usuario, sugerir reglas regex o entries comercio",
            "Admin aprueba antes activar (V3 según roadmap)"
          ],
          "files": [
            "scripts/sugerir-reglas.ts"
          ],
          "depends_on": [
            "T606"
          ],
          "status": "pending"
        }
      ]
    }
  ]
};
