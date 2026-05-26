# 🏷️ tagger

**Servicio de categorización automática de movimientos bancarios.**

Pipeline en cascada (4 capas): reglas por usuario → reglas globales → MCC inteligente (directo o inferido por nombre) → fallback IA (OpenRouter, modelos free).

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
| 3 | **IA (OpenRouter)** | Si nadie reconoció el movimiento, le pregunta a un modelo de lenguaje remoto (free tier, fallback chain de 4 modelos) | `categorias` (lista de opciones) + opcional `marcas_conocidas` (hints) — no consulta tablas de matching | "COMERCIAL XYZ S.A. con monto 50.000 → modelo dice Alimentación" |

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
    IN([Movimiento]) --> SUB{¿subcategoria_usuario_id?}
    SUB -->|sí| RES[Resolver canónica padre]
    RES --> OK([Categoría asignada<br/>canónica + subcat])
    SUB -->|no| C0[0 · Reglas tuyas]
    C0 -->|hit| OK
    C0 -->|no| C1[1 · Reglas globales]
    C1 -->|hit| OK
    C1 -->|no| C2[2 · MCC inteligente]
    C2 -->|hit| OK
    C2 -->|no| C3[3 · IA OpenRouter async]
    C3 --> OK
```

**Flujo sobre tablas** — qué SELECT/INSERT ejecuta cada capa contra Postgres:

```mermaid
sequenceDiagram
    autonumber
    actor U as Cliente API
    participant P as pipeline/categorizar
    participant SU as repo/categorias-usuario
    participant R as layers/reglas
    participant M as layers/mcc
    participant I as layers/ia
    participant DB as Postgres
    participant PER as pipeline/persistir

    U->>P: { nombre, monto, usuario?, subcategoria_usuario_id? }
    Note over P: normalize(nombre)

    alt subcategoria_usuario_id presente
        P->>SU: porId(subcat_id)
        SU->>DB: SELECT categorias_usuario JOIN categorias
        DB-->>SU: { usuario_id, canonica_id }
        SU-->>P: validar pertenencia + canon padre
        Note over P: salta cascada — fuente='manual'
    else flujo normal
        P->>R: Capa 0 — scope=usuario:<id>
        R->>DB: SELECT reglas WHERE scope='usuario:<id>' AND activo
        DB-->>R: filas (cache LRU TTL 60s)
        R-->>P: hit? → ResultadoCapa

        P->>R: Capa 1 — scope=global
        R->>DB: SELECT reglas WHERE scope='global' AND activo
        DB-->>R: literal + contiene + regex
        R-->>P: hit? → ResultadoCapa

        P->>M: Capa 2 — MCC
        M->>DB: SELECT mcc_por_nombre WHERE nombre_normalizado=?
        DB-->>M: ~65k indexado UNIQUE
        M->>DB: SELECT mcc_catalogo WHERE cod_mcc=?
        DB-->>M: categoria_id
        M-->>P: hit? → ResultadoCapa

        P->>I: Capa 3 — IA fallback (setImmediate)
        I-->>P: ResultadoCapa fuente='ia' + requiereRevision=true
    end

    P->>PER: persistirMovimiento(input, resultado, subcat?)
    PER->>DB: INSERT movimientos (categoria_predicha_id=canon, subcategoria_usuario_id?, fuente, confianza, evidencia)
    DB-->>PER: id
    PER-->>U: { movimientoId, categoriaId, fuente, requiereRevision }
```

**Bucle de aprendizaje** — qué pasa cuando un usuario corrige un movimiento:

```mermaid
flowchart LR
    U([Usuario corrige]) --> M{¿con subcat<br/>personal?}
    M -->|sí| MV[(movimientos.subcategoria_usuario_id<br/>= subcat user)]
    M -->|sí| CA[(categoria_confirmada_id<br/>= canónica padre)]
    M -->|no| CA
    U --> R[(reglas scope='usuario:X')]
    R -->|próxima vez| C0[Capa 0]
    U --> S[(sugerencia para regla global)]
    S -->|admin aprueba| C1[Capa 1]
    Note1[Display app: chip de subcat<br/>Reports Mango: agrupa por canónica]:::note
    MV -.-> Note1
    CA -.-> Note1
    classDef note fill:#fef3c7,stroke:#d97706,color:#92400e
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
       │ 4. IA            OpenRouter async (fire-and-forget) │
       └─────────────────────┬─────────────────────────┘
                             ▼
       ┌─────────────────────────────────────────────┐
       │  Persistencia: tabla movimientos            │
       │  ─ categoria_predicha_id (canónica)         │
       │  ─ subcategoria_usuario_id (subcat user)    │
       │  ─ fuente, confianza, requiere_revision     │
       │  ─ evidencia jsonb, batch_id, origen        │
       └─────────────────────────────────────────────┘

Postgres 16 (Drizzle ORM) ─── tablas:
  ┌─ categorias              (slug PK, nombre — canónicas curadas Mango)
  ├─ categorias_usuario      (usuario_id + canonica_id FK → subcategorías personales)
  ├─ reglas                  (scope + tipo + valor → categoría — unifica patrones globales + personales + memoria)
  ├─ mcc_catalogo            (cod_mcc → categoría)
  ├─ mcc_por_nombre          (~65k nombres → MCC + categoría inferida)
  ├─ marcas_conocidas        (IA hints dinámicos)
  ├─ movimientos             (histórico predicciones; categoria_id=canon + subcategoria_usuario_id opcional)
  ├─ correcciones_usuario    (correcciones manual cliente; preserva subcategoria_usuario_id)
  ├─ presupuestos            (topes mensuales por canónica, versionado por vigente_desde)
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
| LLM         | OpenRouter (modelos free + fallback chain). Sin infra local      |
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

Con IA fallback (OpenRouter):

```bash
# .env: OPENROUTER_API_KEY=sk-or-... + IA_ENABLED=true
bash start.sh
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
| `IA_ENABLED`            | `true`                                           | Si `false` → no schedula IA fallback. Movs sin match quedan `requiere_revision=true` sin categoría        |
| `OPENROUTER_API_KEY`    | _(requerida si IA_ENABLED)_                      | Habilita IA fallback (capa 4 del pipeline) + `POST /chat`. Sin esto, IA es no-op + `/chat` devuelve 503    |
| `OPENROUTER_IA_MODEL`   | _(opcional)_                                     | Modelo preferido para IA fallback. Default: `openai/gpt-oss-120b:free`. Fallback chain hardcoded automático |
| `OPENROUTER_MODEL`      | _(opcional)_                                     | Modelo preferido para `/chat`. Mismo default + fallback chain                                              |
| `IA_MAX_CONCURRENT`     | `4`                                              | Llamadas IA fallback simultáneas (queue interna)                                                          |
| `CONFIDENCE_THRESHOLD`  | `0.7`                                            | Umbral para marcar `requiere_revision=true`                                                               |
| `LOG_LEVEL`             | `info`                                           | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace`                                              |
| `PUBLIC_URL`            | `http://localhost:3000`                          | URL pública del deploy. Usado en `HTTP-Referer` a OpenRouter                                              |

---

## Deploy (Dokploy / Docker)

### Vars requeridas en el panel de Dokploy

| Var                  | Obligatoria | Notas                                                              |
| -------------------- | ----------- | ------------------------------------------------------------------ |
| `DATABASE_URL`       | sí          | Postgres reachable desde el container                              |
| `API_KEY`            | sí          | mínimo 16 chars. Se sirve también vía `GET /demo/config` al demo UI |
| `OPENROUTER_API_KEY` | sí (si IA)  | Requerida si `IA_ENABLED=true`. Habilita IA fallback (capa 4) + `/chat` |
| `OPENROUTER_IA_MODEL`| opcional    | Sobrescribe modelo de IA fallback                                       |
| `OPENROUTER_MODEL`   | opcional    | Sobrescribe modelo de `/chat`                                           |
| `PUBLIC_URL`         | recomendada | `https://tu-dominio.example.com`                                        |
| `IA_ENABLED`         | opcional    | `false` para deshabilitar IA fallback. Default `true`                   |

### Build

`docker build` corre 3 pasos clave:
1. `pnpm install` con workspace (root + sdk)
2. `cd sdk && pnpm build` (compila SDK)
3. `pnpm build` (backend TS → dist)
4. `pnpm run build:demo` (bundle React demo → `ui/demo/app.js`)

La API_KEY NO se inyecta en build — el demo la fetcha en runtime via `GET /demo/config`.

---

## API endpoints

### Categorización

| Método | Path                          | Descripción                                                                                                                        |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/categorizar-movimiento`     | Categoriza un movimiento. Body: `{descripcion?, nombre_bancard?, nombre_comercio?, mcc?, monto?, bancard_id?, codigo_comercio?, bypass_catalogo?, origen?, batch_id?, categoria_id?, aprender?, subcategoria_usuario_id?}`. Si `categoria_id` viene → saltea cascada (manual). Si `subcategoria_usuario_id` viene → backend valida pertenencia al `origen`, resuelve canónica padre y la usa como `categoria_id` efectiva |
| GET    | `/movimientos`                | Lista paginada. Query: `limit` (default 50, max 200), `offset`, `origen`. Cada item incluye `categoria` (confirmada\|predicha) + `subcategoria` poblada cuando aplica |
| GET    | `/movimientos/:id`            | Detalle movimiento. Incluye `subcategoria` poblada (`{id, nombre, slug, emoji, color, canonica_id}`) cuando aplica.                |
| GET    | `/movimientos/:id/categorias-sugeridas` | Top-K cats candidatas por similitud trigram. Query: `q?, limit?, offset?, umbral?`. Útil para UI "¿quisiste decir X?"   |
| POST   | `/movimientos/:id/correccion` | Corrección manual. Body: `{categoria_id_nueva, usuario?, motivo?, aprender?, subcategoria_usuario_id?}`. `aprender=true` (default) crea regla user-scope. Si `subcategoria_usuario_id` viene, override silencioso de `categoria_id_nueva` con la canónica padre y persiste subcat en mov + audit  |
| POST   | `/movimientos/:id/reprocesar` | Re-ejecuta cascada + IA sobre movimiento existente. Body: `{bypass_catalogo?}` (opcional). Response incluye `ia_disparada: bool`.  |

### CRUD recursos

| Método                | Path                      | Función                                                                                                                    |
| --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET/POST/PATCH/DELETE | `/categorias`             | CRUD categorías canónicas (Mango admin)                                                                                    |
| GET/POST/PATCH/DELETE | `/categorias-usuario`     | CRUD subcategorías personales del usuario. Cada subcat ancla a un rubro canónico vía `canonica_id` (FK RESTRICT). `GET ?usuario=X` lista activas, `POST` crea (valida canon activa+no-reemplazada, nombre≠canon, slug único per user, cap 200), `PATCH /:id` edita nombre/emoji/color/activo, `DELETE /:id` hard delete con FK SET NULL en movs |
| GET                   | `/categorias/:slug/usage` | Counts refs (movimientos/mcc_por_nombre/mcc_catalogo)                                                                      |
| GET                   | `/categorias/:slug/similares` | Top-K cats similares (trigram). Query: `q?, limit?, offset?, umbral?`. Si pasás `q`, busca contra ese texto              |
| GET/POST/PATCH/DELETE | `/reglas`                 | CRUD reglas. `GET /reglas?scope=global` o `scope=usuario:<X>`. `GET /reglas/sugerencias?usuario=X&umbral=N` agrupa correcciones del usuario. `GET /reglas/sugerencias-globales?min_usuarios=3&min_total=5` lista patrones que **varios usuarios distintos** corrigieron a la misma categoría (candidatos a regla global). `POST` crea regla, `PATCH /:id` activa/desactiva o cambia prioridad, `DELETE /:id` o `DELETE /reglas?scope=&valor=`. Tipos: `literal` / `contiene` / `regex` |
| GET/POST/PATCH/DELETE | `/mcc`                    | CRUD MCC mapping                                                                                                           |
| GET/POST/PATCH/DELETE | `/marcas`                 | CRUD marcas conocidas IA                                                                                                   |
| GET/PATCH             | `/comercios`              | Listar paginado + cambio categoría individual (sobre `mcc_por_nombre`)                                                     |

### Presupuestos

Topes mensuales por categoría canónica. Modelo versionado: editar = INSERT nueva versión `vigente_desde=hoy`. Baja = INSERT monto 0 (preserva histórico).

| Método | Path                              | Función                                                                                                                                  |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/presupuestos?usuario=X`         | Lista presupuestos vigentes del usuario (excluye dados de baja)                                                                          |
| POST   | `/presupuestos`                   | Crear. Body: `{usuario, categoria_id, monto_mensual}`. Errores: 404 `categoria_no_encontrada`, 409 `presupuesto_ya_existe`               |
| PATCH  | `/presupuestos/:id`               | Editar monto = INSERT nueva versión. Body: `{monto_mensual}`                                                                             |
| DELETE | `/presupuestos/:id`               | Baja = INSERT versión con `monto_mensual=0`. No borra histórico                                                                          |
| GET    | `/presupuestos/estado?usuario=X&mes=YYYY-MM` | Combina tope vigente + gastos reales del mes. Devuelve `items` con `{categoria_id, presupuesto, gastado, restante, pct, movs}`  |

### Chat IA contextual

| Método | Path     | Función                                                                                                                                          |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/chat`  | Proxy a OpenRouter. Body: `{messages, movs, usuario}`. Backend monta prompt con resumen de movs + historial. 503 si no hay `OPENROUTER_API_KEY` |

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

### Salud / Demo

| Método | Path            | Devuelve                                                                              |
| ------ | --------------- | ------------------------------------------------------------------------------------- |
| GET    | `/health`       | `{status:'ok'}` (no requiere auth)                                                    |
| GET    | `/health/ready` | `{status, db, llm}` (no requiere auth). `llm` = `'ok' \| 'fail' \| 'skip'` (probe OpenRouter) |
| GET    | `/demo/config`  | `{apiKey, hasOpenRouter}` para demo UI. No requiere auth. `apiKey` = env `API_KEY`    |

**Auth**: header `x-api-key: <API_KEY>` excepto `/health*`, `/ui/*`, `/demo/config`, `/favicon.ico`, `/`.

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
| 5. IA fallback   | `ia`                       | 0.50 (cap) | OpenRouter async (concurrency `IA_MAX_CONCURRENT`, fallback chain de modelos free) — `requiere_revision` siempre `true`. Deshabilitable con `IA_ENABLED=false` |
| Corrección     | `manual`                   | 1.00       | POST `/movimientos/:id/correccion`. Body `{categoria_id_nueva, usuario?, aprender?}`. Si `aprender=true` (default) y hay usuario, auto-upsert en `reglas` con `scope='usuario:X' tipo='literal' origen='correccion' prioridad=1`. Si `aprender=false`, sólo modifica este mov (excepción puntual, no contamina memoria). Audit en `correcciones_usuario` se inserta siempre — `GET /reglas/sugerencias-globales` capta consensos aunque varios usuarios marquen `aprender=false` |

Valores legacy en DB enum (movimientos viejos, no usados por pipeline actual): `bancard` (0.90), `nombre` (0.80), `patrones` (0.90).

**Threshold revisión**: confianza < 0.70 → `requiere_revision=true`.

**Bypass MCC por nombre** (testing): flag `bypass_catalogo=true` (nombre legacy) salta el fallback MCC-por-nombre dentro de capa MCC → solo MCC directo del input. Útil para medir el impacto del catálogo precomputado.

**IA fire-and-forget**: cuando todas las capas sync devuelven null, response inmediato es null + revisión, y `setImmediate` dispara IA. Cliente debe re-fetchear `/movimientos/:id` después para ver categoría asignada por IA.

---

## Modelo de datos

```sql
categorias              (id uuid PK, slug unique, nombre, descripcion, activo,
                         reemplazada_por_id)  -- canónicas, curadas por Mango
categorias_usuario      (id PK, usuario_id, canonica_id FK→categorias RESTRICT,
                         nombre, slug, emoji, color, activo, origen,
                         UNIQUE(usuario_id, slug))  -- subcats personales del user
reglas                  (id, scope text, tipo text [literal|contiene|regex], valor,
                         valor_normalizado, categoria_id FK, prioridad, activo, hits,
                         origen, descripcion,
                         UNIQUE (scope, tipo, valor_normalizado))
mcc_catalogo            (cod_mcc PK, descripcion, categoria_id FK, ambiguo)
mcc_por_nombre          (id, nombre, nombre_normalizado UNIQUE, mcc, categoria_id FK,
                         requiere_revision)
marcas_conocidas        (id, marca unique, categoria_id FK, descripcion)
movimientos             (id, descripcion, nombre_comercio, nombre_bancard, mcc, monto,
                         categoria_predicha_id, categoria_confirmada_id,
                         subcategoria_usuario_id FK→categorias_usuario SET NULL,
                         fuente_categoria enum, confianza, requiere_revision,
                         raw_input jsonb, evidencia jsonb,
                         origen, batch_id, bancard_id, codigo_comercio, latency_ms,
                         created_at, updated_at)
correcciones_usuario    (id, movimiento_id FK, categoria_anterior_id, categoria_nueva_id,
                         subcategoria_usuario_id FK→categorias_usuario SET NULL,
                         usuario, motivo)
test_ground_truth       (id, batch_id, nombre, nombre_normalizado, bancard_id,
                         codigo_comercio, mcc, combined_mcc, categoria_xlsx,
                         sector_xlsx, cantidad, fuente_origen)
```

### Modelo de categorías (canónicas + personales)

```mermaid
erDiagram
    categorias ||--o{ categorias_usuario : "canonica_id (RESTRICT)"
    categorias ||--o{ movimientos : "categoria_id"
    categorias_usuario ||--o{ movimientos : "subcategoria_usuario_id (SET NULL)"
    categorias ||--o{ presupuestos : "categoria_id (SET NULL)"
    categorias ||--o{ reglas : "categoria_id"
    categorias ||--o{ correcciones_usuario : "categoria_anterior_id / nueva_id"
    categorias_usuario ||--o{ correcciones_usuario : "subcategoria_usuario_id (SET NULL)"

    categorias {
        uuid id PK
        text slug UK
        text nombre
        boolean activo
        uuid reemplazada_por_id "merger histórico"
    }
    categorias_usuario {
        uuid id PK
        text usuario_id
        uuid canonica_id FK
        text nombre
        text slug
        text emoji
        text color
        boolean activo
        text origen "manual / sugerencia_mango"
    }
    movimientos {
        uuid id PK
        uuid categoria_predicha_id FK
        uuid categoria_confirmada_id FK
        uuid subcategoria_usuario_id FK
        text fuente_categoria
        text origen
    }
```

Dos tablas separadas con responsabilidades distintas:

- **`categorias`** = rubros canónicos curados por Mango. Estables, ~30-100 entries, IA/MCC/global rules sólo conocen estas. Reports internos agrupan acá.
- **`categorias_usuario`** = subcategorías del usuario final. Cada una `FK → categorias.id` obligatorio (rubro padre). User las crea desde la app con nombre/emoji custom (ej "Streaming" anclada a "Entretenimiento"). Cap 200 por user.

Movimientos guardan ambas:
- `movimientos.categoria_id` = canónica (siempre cuando categorizado). Reports / IA / pipeline operan sobre esta.
- `movimientos.subcategoria_usuario_id` = opcional. Si presente, la UI muestra la subcat con su emoji custom; el tooltip/detalle revela el rubro padre.

Borrar una subcat (`DELETE /categorias-usuario/:id`) hace `SET NULL` en movs — preserva historial, los movs caen al chip de la canónica. Alternativa: `PATCH activo=false` (soft hide).

Reports Mango siempre rolan por `categoria_id` (canónica). Cero queries `COALESCE`, cero fragmentación entre users — "Streaming" de Juan, "Cine" de María y "Netflix" de Pedro suman al mismo bucket "Entretenimiento".

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
│   ├── lib/                (LLM client OpenRouter, logger)
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
docker compose up -d                       # Postgres + tagger
```

`docker-compose.yml`:

- `postgres` con healthcheck + volumen
- `tagger` (API). IA fallback + chat van vía OpenRouter (sin container LLM local)

---

## Licencia

Privado. Mango Apps Paraguay.
