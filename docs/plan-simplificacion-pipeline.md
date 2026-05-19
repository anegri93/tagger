# Plan de simplificación pipeline y modelo de datos

> Estado: **propuesta — no implementado**. Generado a partir de la conversación de diseño 2026-05-19.

## Contexto y motivación

El pipeline actual tiene 6 capas (5 sync + IA async) y 11 tablas en Postgres. El análisis reveló:

1. **3 tablas redundantes** (`patrones`, `patrones_usuario`, `memoria_usuario_destinatario`) — conceptualmente son la misma cosa: `(clave → categoría)` con scope (global o usuario).
2. **`comercios_catalogo` tiene 15 columnas inertes de 22** — `bancard_id`, `codigo_comercio`, `nombre_bancard`, `marca`, `evidencia` son siempre NULL (verificado con SQL contra DB). `mcc_original` duplica `mcc`. `mcc_inferido`, `fuente_categoria` son constantes. Las 5 columnas shadow de recategorización nunca se usaron en producción.
3. **`comercios_catalogo` no es un catálogo Bancard de comercios** — es un join precomputado `nombre_normalizado → mcc → categoría`. Cumple el rol de "MCC inferido por nombre".
4. **Capa 2 (catálogo) y capa 4 (MCC) son conceptualmente la misma operación** con distinta fuente de MCC (input vs inferido).

## Estado objetivo

**Cascada de 4 capas** (de 6 actuales):

| # | Capa | Tabla | Qué hace |
|---|------|-------|----------|
| 0 | Reglas usuario | `reglas WHERE scope='usuario:X' AND activo` | Memoria + patrones personales unificados |
| 1 | Reglas globales | `reglas WHERE scope='global' AND activo` | Patrones globales curados |
| 2 | MCC (con name fallback) | `mcc_catalogo` + `mcc_por_nombre` | MCC del input o inferido por nombre |
| 3 | IA fallback (opcional) | — | Solo si `IA_ENABLED=true` |

**6 tablas core** (de 11):

```
CORE
├─ categorias              (sin cambios)
├─ mcc_catalogo            (sin cambios)
├─ mcc_por_nombre          (ex comercios_catalogo, 7 cols vs 22)
├─ reglas (NUEVA)          (unifica patrones + patrones_usuario + memoria_usuario_destinatario)
└─ movimientos             (sin cambios estructurales)

AUDIT
└─ correcciones_usuario    (sin cambios)

DEV
└─ test_ground_truth       (solo dev/QA)
```

**Eliminadas**: `patrones`, `patrones_usuario`, `memoria_usuario_destinatario`, `marcas_conocidas` (solo si pasamos IA a sugerencias offline, opcional).

## Confidencia por capa

Sigue siendo:
- Reglas literal/regex: 0.80–0.95
- MCC (input o inferido): 0.50/0.70/0.85 según `mcc_catalogo.ambiguo` y origen
- IA: ≤0.50 cap

Sin `confianza` ni `fuente_categoria` en `mcc_por_nombre` (derivable del MCC).

---

# Plan de ejecución por etapas

## Etapa 0 — Baseline y safety net

**Objetivo**: capturar comportamiento actual antes de tocar nada.

### Tarea 0.1 — Crear branch
- `git checkout -b feat/simplificar-modelo`
- **Validación**: `git branch` muestra branch nueva activa.

### Tarea 0.2 — Test masivo baseline
- Correr `POST /test-batch/start` con dataset completo, batch_id `baseline_pre_simplif`.
- Esperar a que termine (`GET /test-batch/list`).
- Guardar stats: `GET /test-batch/baseline_pre_simplif/stats` + `/analisis`.
- Guardar agreement vs ground truth: `GET /test-batch/baseline_pre_simplif/agreement?ground_truth=<gt>`.
- **Validación**: archivo `docs/historico/baseline-pre-simplif.json` creado con cobertura, por_fuente, agreement_pct.

### Tarea 0.3 — Snapshot lint/test pre-cambios
- `pnpm typecheck` → 0 errors esperado.
- `pnpm test` → todos pass.
- `pnpm lint` → 0 errors.
- **Validación**: 3 comandos retornan exit 0. Capturar output como baseline.

---

## Etapa 1 — Limpiar `comercios_catalogo` → `mcc_por_nombre`

**Objetivo**: schema honesto, 7 columnas, renombre semántico.

### Tarea 1.1 — Migración drizzle
- Crear `src/db/migrations/0016_mcc_por_nombre.sql`:
  - `ALTER TABLE comercios_catalogo DROP COLUMN bancard_id, codigo_comercio, nombre_bancard, marca, mcc_original, mcc_inferido, fuente_categoria, confianza, evidencia, categoria_nueva_id, fuente_nueva, confianza_nueva, evidencia_nueva, recategorizado_at;`
  - `ALTER TABLE comercios_catalogo RENAME TO mcc_por_nombre;`
  - Drop índices obsoletos (`comercios_nombre_bancard_uniq`, `comercios_bancard_codigo_uniq`, `comercios_nombre_norm_solo_uniq`, `comercios_marca_idx`).
  - Mantener: `comercios_nombre_normalizado_idx` → renombrar a `mcc_por_nombre_norm_idx`.
- Actualizar `meta/_journal.json`.
- **Validación**: `pnpm migrate` corre sin error contra DB de dev.
- **Validación**: `SELECT COUNT(*) FROM mcc_por_nombre` devuelve 64966.

### Tarea 1.2 — Schema drizzle
- Reemplazar `src/db/schema/comercios_catalogo.ts` por `src/db/schema/mcc_por_nombre.ts`:
  ```ts
  export const mccPorNombre = pgTable('mcc_por_nombre', {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    nombreNormalizado: text('nombre_normalizado').notNull(),
    mcc: text('mcc').notNull(),
    categoriaId: uuid('categoria_id').references(() => categorias.id, { onDelete: 'set null' }),
    requiereRevision: boolean('requiere_revision').notNull().default(false),
    createdAt, updatedAt,
  }, (t) => [
    uniqueIndex('mcc_por_nombre_norm_uq').on(t.nombreNormalizado),
  ]);
  ```
- Actualizar `src/db/schema/index.ts` (exportar `mccPorNombre`, remover `comerciosCatalogo`).
- **Validación**: `pnpm typecheck` → 0 errors.

### Tarea 1.3 — Refactor repos y layers
Archivos a tocar:
- `src/db/repos/comercios.ts` → renombrar a `src/db/repos/mcc-por-nombre.ts` o consolidar con existente.
- `src/db/repos/comercios-writer.ts` → adapter a nuevo schema (drop campos eliminados) o borrar si no se usa fuera del recategorizar (que se elimina).
- `src/db/repos/mcc-por-nombre.ts` (ya existe) → ajustar query.
- `src/layers/catalogo.ts` → será absorbido en etapa 3. Por ahora: ajustar a leer del schema renombrado.
- **Validación**: `pnpm typecheck` → 0 errors. `pnpm test` → todos pass.

### Tarea 1.4 — Eliminar feature de recategorización
- Borrar archivos:
  - `src/services/recategorizar-catalogo.ts`
  - `src/api/routes/recategorizar-catalogo.ts`
  - `src/api/routes/aplicar-diff.ts`
  - `src/api/routes/marcas-candidatas.ts` (solo si depende del catálogo viejo; verificar primero)
- Eliminar registros en `src/main.ts`.
- Eliminar UI `ui/recat/` si existe.
- Eliminar endpoints del OpenAPI + Postman.
- **Validación**: `pnpm build` → 0 errors. `grep -r recategorizar src/` → vacío salvo tests obsoletos a borrar.
- **Validación**: `pnpm test` → todos pass después de borrar tests obsoletos.

### Tarea 1.5 — Eliminar feature de comercios-writer no usado
- Verificar uso de `comerciosWriter.actualizar` / etc. — si solo lo usa la UI de recategorización, borrar.
- Mantener solo CRUD básico si la UI `/ui/comercios/` lo necesita.
- **Validación**: `pnpm test` → todos pass.

### Tarea 1.6 — Actualizar tests directos del schema viejo
- `src/db/schema/comercios_catalogo.test.ts` → renombrar y ajustar cols esperadas.
- Cualquier test que asserte columnas viejas: actualizar.
- **Validación**: `pnpm test` → 100% verde.

### Tarea 1.7 — Test masivo post-etapa-1
- `POST /test-batch/start` con batch_id `post_etapa1`.
- Comparar agreement vs `baseline_pre_simplif`. **Esperado: idéntico** (solo cambió schema, no lógica).
- **Validación**: diff de cobertura < 0.1%. Si difiere más → rollback y debug.

### Tarea 1.8 — Commit etapa 1
- `git add -A && git commit -m "refactor(db): mcc_por_nombre reemplaza comercios_catalogo bloated"`
- **Validación**: `pnpm lint && pnpm typecheck && pnpm test` → 0 errors antes de commit.

---

## Etapa 2 — Unificar reglas: nueva tabla `reglas`

**Objetivo**: 1 sola tabla para memoria + patrones globales + patrones usuario.

### Tarea 2.1 — Migración drizzle
- `src/db/migrations/0017_reglas_unificadas.sql`:
  ```sql
  CREATE TABLE reglas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL,
    tipo text NOT NULL,                  -- 'literal' | 'contiene' | 'regex' (3, no 4)
    valor text NOT NULL,
    valor_normalizado text NOT NULL,
    categoria_id uuid NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    prioridad int NOT NULL DEFAULT 100,
    activo boolean NOT NULL DEFAULT true,
    hits int NOT NULL DEFAULT 0,
    origen text NOT NULL DEFAULT 'manual',
    descripcion text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX reglas_scope_tipo_norm_uq ON reglas (scope, tipo, valor_normalizado);
  CREATE INDEX reglas_scope_activo_idx ON reglas (scope, activo, prioridad);
  CREATE INDEX reglas_valor_norm_idx ON reglas (valor_normalizado);

  -- Backfill desde 3 tablas viejas
  INSERT INTO reglas (scope, tipo, valor, valor_normalizado, categoria_id, prioridad, activo, origen, descripcion, created_at, updated_at)
  SELECT 'global', CASE WHEN tipo IN ('literal','prefijo') THEN 'literal' WHEN tipo='contiene' THEN 'contiene' ELSE 'regex' END,
         valor, lower(valor), categoria_id, prioridad, activo,
         CASE WHEN fuente='manual' THEN 'manual' WHEN fuente='catalogo_bancard' THEN 'catalogo_bancard' ELSE 'auto' END,
         descripcion, created_at, updated_at
  FROM patrones;

  INSERT INTO reglas (scope, tipo, valor, valor_normalizado, categoria_id, prioridad, activo, hits, origen, descripcion, created_at, updated_at)
  SELECT 'usuario:' || usuario,
         CASE WHEN tipo IN ('literal','prefijo') THEN 'literal' WHEN tipo='contiene' THEN 'contiene' ELSE 'regex' END,
         valor, lower(valor), categoria_id, prioridad, activo, hits, 'sugerencia', descripcion, created_at, updated_at
  FROM patrones_usuario;

  INSERT INTO reglas (scope, tipo, valor, valor_normalizado, categoria_id, prioridad, activo, hits, origen, created_at, updated_at)
  SELECT 'usuario:' || usuario, 'literal', destinatario, destinatario_normalizado, categoria_id, 50, true, hits,
         CASE WHEN origen='correccion' THEN 'correccion' ELSE 'manual' END, created_at, updated_at
  FROM memoria_usuario_destinatario;
  ```
- **NOTA**: tipos `'prefijo'` colapsan a `'literal'` (decisión #2 — reducir 4 a 3 tipos). Si hay patrones tipo `'prefijo'` que dependen del match prefijo real, hay que migrar a `'regex'` con `^` en su lugar. Validar en datos reales antes.
- **Validación**: `pnpm migrate` corre OK. `SELECT scope, tipo, COUNT(*) FROM reglas GROUP BY 1,2;` muestra distribución esperada.

### Tarea 2.2 — Schema drizzle `reglas`
- `src/db/schema/reglas.ts` nuevo.
- Actualizar `src/db/schema/index.ts` (exportar `reglas`, no remover viejos aún).
- **Validación**: `pnpm typecheck` OK.

### Tarea 2.3 — Repo `reglas`
- `src/db/repos/reglas.ts`:
  - `crearReglasLoaderGlobal(db) → ReglasLoader` (filtro scope='global')
  - `crearReglasLoaderUsuario(db, ttlMs) → ReglasUsuarioLoader` (filtro scope='usuario:X' con cache LRU)
  - `crearReglasWriter(db, invalidar?) → ReglasWriter` (CRUD)
  - `crearSugerenciasReader(db) → SugerenciasReader` (agrupa correcciones_usuario)
- Tests unitarios nuevos en `src/db/repos/reglas.test.ts`.
- **Validación**: `pnpm test reglas` → todos pass.

### Tarea 2.4 — Capa `reglas` unificada
- `src/layers/reglas.ts`:
  ```ts
  export function crearCapaReglas(loader: ReglasLoader, opts: { scope: 'global' | 'usuario' }): CapaReglas
  ```
- Reemplaza `src/layers/memoria.ts` + `src/layers/patrones.ts` + `src/layers/patrones-usuario.ts`.
- Mantiene los archivos viejos como deprecation thin shims que delegan en la nueva capa (durante 1 commit, para safety).
- **Validación**: tests unitarios en `src/layers/reglas.test.ts` cubren todos los casos de los 3 tests viejos.

### Tarea 2.5 — Wire pipeline
- `src/pipeline/categorizar.ts`:
  ```ts
  interface CapasSincrono {
    reglasUsuario?: { evaluar(input, usuario): ... }
    reglasGlobales?: { evaluar(input): ... }
    mcc: { evaluar(input): ... }   // smart, ver etapa 3
  }
  ```
- Cascade: reglasUsuario → reglasGlobales → mcc → ia.
- `src/main.ts`: wire nuevas capas. Mantener wire viejo en deprecation flag por 1 commit.
- **Validación**: `pnpm typecheck` OK.

### Tarea 2.6 — Endpoints API
- Crear `/reglas` endpoint (CRUD + sugerencias):
  - `GET /reglas?scope=` — list
  - `POST /reglas` — crear (body: scope, tipo, valor, categoria_slug)
  - `PATCH /reglas/:id` — toggle/update
  - `DELETE /reglas/:id`
  - `GET /reglas/sugerencias?usuario=X&umbral=N` — sugerencias
- Compat shims (mismo handler, distinta URL):
  - `/patrones*` → `/reglas?scope=global`
  - `/patrones-usuario/:u*` → `/reglas?scope=usuario:u`
  - `/memoria/:u*` → `/reglas?scope=usuario:u&tipo=literal`
- **Validación**: tests integración de endpoints en `src/api/routes/reglas.test.ts`. Tests viejos de `/patrones`, `/patrones-usuario`, `/memoria` siguen verdes (compat).

### Tarea 2.7 — UI playground actualizar
- `ui/memoria/index.html`:
  - Sección 3 "Lo que aprendí de vos" colapsa los 3 sub-bloques en uno: "Mis reglas".
  - Lista unificada con badge de scope/tipo.
  - Botón "+ Nueva regla" con form simple.
  - Sugerencias siguen igual (siguen viniendo de correcciones agrupadas).
- Tracer ya no tiene chips separados de Memoria/Reglas usr — un solo chip "Reglas tuyas".
- **Validación**: smoke test manual del UI flow: crear mov → corregir → ver regla aparecer.

### Tarea 2.8 — Test masivo post-etapa-2
- `POST /test-batch/start` con batch_id `post_etapa2`.
- Comparar agreement vs `baseline_pre_simplif`. **Esperado: idéntico ±0.5%**.
- Si difiere más: debug — los tipos `prefijo` migrados a `literal` pueden no matchear igual.
- **Validación**: diff < 0.5%, sino abrir issue y corregir antes de continuar.

### Tarea 2.9 — Drop tablas viejas
- En commit separado (solo cuando Etapa 2 esté verde en producción):
- `src/db/migrations/0018_drop_tablas_viejas.sql`:
  ```sql
  DROP TABLE patrones, patrones_usuario, memoria_usuario_destinatario;
  ```
- Borrar archivos viejos:
  - `src/db/schema/patrones.ts`
  - `src/db/schema/patrones_usuario.ts`
  - `src/db/schema/memoria_usuario_destinatario.ts`
  - `src/db/repos/patrones.ts`
  - `src/db/repos/patrones-usuario.ts`
  - `src/db/repos/memoria-usuario.ts`
  - `src/layers/memoria.ts`
  - `src/layers/patrones.ts`
  - `src/layers/patrones-usuario.ts`
  - Tests asociados.
- Quitar compat shims de routes (`/memoria`, `/patrones`, `/patrones-usuario`) si confirmado que nadie las usa, o mantener como aliases si el cliente mobile depende.
- **Validación**: `pnpm test && pnpm typecheck && pnpm lint` 0 errors. `pnpm build` OK.

### Tarea 2.10 — Commit etapa 2
- `git commit -m "refactor(db): unificar memoria + patrones + patrones_usuario en tabla reglas"`
- **Validación**: CI verde si hay (sino, pnpm checks locales).

---

## Etapa 3 — Capa MCC inteligente (con name fallback)

**Objetivo**: fusionar capa 2 (catálogo) en capa 4 (MCC) — el catálogo es solo "MCC inferido por nombre".

### Tarea 3.1 — Refactor `src/layers/mcc.ts`
- Aceptar opcionalmente un loader `mccPorNombre`:
  ```ts
  export function crearCapaMcc(
    lookup: MccLookup,
    porNombre?: MccPorNombreLookup
  ): CapaMcc {
    return {
      async evaluar(input, opts?) {
        // 1. Si input.mcc presente → mccLookup directo
        if (input.mcc) {
          const r = await lookup.evaluar(input.mcc);
          if (r) return r;
        }
        // 2. Fallback por nombre
        if (porNombre) {
          const nombre = input.nombreBancard ?? input.nombreComercio;
          if (nombre) {
            const inferido = await porNombre.inferir(nombre);
            if (inferido) {
              const r = await lookup.evaluar(inferido.mcc);
              if (r) return { ...r, evidencia: { ...r.evidencia, mcc_inferido_por_nombre: true } };
            }
          }
        }
        return null;
      }
    };
  }
  ```
- Borrar `src/layers/catalogo.ts`.
- **Validación**: `pnpm typecheck` OK.

### Tarea 3.2 — Actualizar pipeline
- `src/pipeline/categorizar.ts`:
  - Remover `catalogo` de `CapasSincrono`.
  - Cascada final: `reglasUsuario → reglasGlobales → mcc(smart) → ia`.
- `src/main.ts`: wire.
- **Validación**: `pnpm typecheck` OK.

### Tarea 3.3 — Tests
- Mover tests relevantes de `src/layers/catalogo.test.ts` a `src/layers/mcc.test.ts`.
- Borrar `catalogo.test.ts`.
- Cubrir escenarios:
  - MCC directo del input
  - MCC inferido por nombre
  - Input sin MCC y nombre no conocido → null
- **Validación**: `pnpm test mcc` → todos pass.

### Tarea 3.4 — Bypass flag adaptación
- Flag `bypass_catalogo` ya no aplica (no hay capa catálogo). Renombrar a `bypass_mcc_por_nombre` (más preciso) o eliminar.
- Actualizar:
  - `src/api/routes/categorizar.ts`
  - `src/api/routes/movimiento-reprocesar.ts`
  - `src/api/routes/importar-movimientos.ts`
  - `src/test-batch/runner.ts`
  - `src/api/schemas/categorizar.ts`
  - `src/api/schemas/test-batch.ts`
- **Validación**: `pnpm test` → todos pass después de renombrar.

### Tarea 3.5 — Test masivo post-etapa-3
- `POST /test-batch/start` con batch_id `post_etapa3`.
- Comparar agreement vs `baseline_pre_simplif`.
- **Esperado: idéntico ±0.5%** — porque las capas hacen el mismo trabajo, solo se reordenó.
- **Atención al reordenamiento**: hoy capa 2 (catalogo) dispara antes que capa 3 (patrones globales). Después: reglas globales disparan ANTES que MCC. Esto puede mejorar o empeorar resultados.
- Si baja cobertura/agreement: mitigar promoviendo top-N nombres de `mcc_por_nombre` a `reglas WHERE scope='global'`.
- **Validación**: diff agreement < 1%. Si mayor, evaluar caso por caso.

### Tarea 3.6 — Commit etapa 3
- `git commit -m "refactor(pipeline): fusionar capa catálogo en MCC con name fallback"`

---

## Etapa 4 — Tipos de patrón: 4 → 3 (decisión #2)

**Objetivo**: simplificar `literal`/`prefijo`/`contiene`/`regex` a `literal`/`contiene`/`regex`. `prefijo` se expresa como regex con `^`.

### Tarea 4.1 — Audit data
- `SELECT tipo, COUNT(*) FROM reglas GROUP BY tipo;` — ver cuántos son `prefijo` (debería ser 0 después de etapa 2.1 migración).
- Si quedaron → migrar manualmente a regex: `UPDATE reglas SET tipo='regex', valor='^' || valor WHERE tipo='prefijo';`
- **Validación**: 0 filas con `tipo='prefijo'`.

### Tarea 4.2 — Constraint check
- Agregar constraint: `ALTER TABLE reglas ADD CONSTRAINT reglas_tipo_check CHECK (tipo IN ('literal','contiene','regex'));`
- Actualizar schema drizzle (cambiar enum o pasar a text con check).
- **Validación**: `pnpm migrate` OK.

### Tarea 4.3 — Code cleanup
- `src/layers/reglas.ts`: remover branch `case 'prefijo'`.
- `src/db/repos/reglas.ts`: type `PatronTipo = 'literal' | 'contiene' | 'regex'`.
- `src/api/routes/reglas.ts`: schema zod limita enum.
- UI: dropdown elimina opción "prefijo".
- **Validación**: `pnpm typecheck && pnpm test` 0 errors.

### Tarea 4.4 — Commit etapa 4
- `git commit -m "refactor(reglas): consolidar tipos a literal/contiene/regex (drop prefijo)"`

---

## Etapa 5 — MCC ambiguo simplificado (decisión #4)

**Objetivo**: en vez de saltar MCCs marcados ambiguos, matchear siempre + propagar `requiere_revision=true`.

### Tarea 5.1 — Refactor `src/layers/mcc.ts`
- Hoy: si `mccCatalogo.ambiguo=true` → no matchea, retorna null.
- Después: matchea siempre, retorna `{ ..., evidencia: { ..., mcc_ambiguo: true } }` y arriba se setea `requiere_revision=true`.
- O equivalente: capa MCC siempre devuelve resultado si hay match, dejando que `confianzaPorFuente` o threshold decida revisión.

### Tarea 5.2 — Tests
- Caso MCC ambiguo: input con MCC ambiguo → matchea + `requiere_revision=true`.
- Caso MCC no ambiguo: matchea + `requiere_revision=false`.
- **Validación**: tests verdes.

### Tarea 5.3 — Test masivo post-etapa-5
- `POST /test-batch/start` con batch_id `post_etapa5`.
- Comparar cobertura: **debería subir** (MCC ambiguos antes saltaban a IA, ahora resuelven con flag).
- Agreement con ground truth: **puede bajar levemente** porque MCC ambiguos pueden mapear a categoría "más probable" que no siempre acierta. Aceptable si cobertura sube.
- **Validación**: cobertura sube, agreement no baja más de 2%.

### Tarea 5.4 — Commit etapa 5
- `git commit -m "refactor(mcc): MCC ambiguo siempre matchea + flag requiere_revision"`

---

## Etapa 6 — IA → solo sugiere reglas (decisión #6)

**Objetivo**: IA no escribe categoría a `movimientos`. Solo genera sugerencias para revisar.

**ATENCIÓN**: cambio de comportamiento mayor. Cliente mobile que dependa de "espera IA" rompe.

### Tarea 6.1 — Confirmar contratos
- ¿Cliente mobile pollea `/movimientos/:id` esperando que IA complete? **Pregunta a stakeholders antes de implementar**.
- Si sí: mantener IA fallback activo. Skip esta etapa.
- Si no: continuar.

### Tarea 6.2 — Refactor pipeline
- `src/pipeline/ia-fallback.ts`:
  - Hoy: schedule IA → escribe `categoria_predicha_id` + `fuente='ia'` + `requiere_revision=true`.
  - Después: schedule IA → escribe a tabla `sugerencias_ia` (existente? ver `src/api/routes/sugerencias-ia.ts`). NO toca `movimientos`.
- Movimientos sin match quedan `categoria_predicha_id=NULL`, `fuente_categoria=NULL`, `requiere_revision=true`.

### Tarea 6.3 — Mover IA a job offline
- Crear endpoint `POST /sugerencias-ia/procesar-pendientes` que toma movs con `categoria_predicha_id=NULL` + corre IA → `sugerencias_ia`.
- O cron job (script en `src/scripts/procesar-ia-pendientes.ts`).
- **Validación**: tests.

### Tarea 6.4 — UI playground
- Resultado sin match → mostrar "Sin categoría — la IA propondrá una y aparecerá en sugerencias".
- Sección sugerencias muestra ambos tipos: por correcciones repetidas + por IA.

### Tarea 6.5 — Eliminar `marcas_conocidas`
- Si IA ya no corre inline, `marcas_conocidas` deja de tener uso (era prompt hint).
- Migrar: `DROP TABLE marcas_conocidas;` después de confirmar no se usa fuera de IA.
- **Validación**: `grep -r marcasConocidas src/` → solo en código a borrar.

### Tarea 6.6 — Commit etapa 6
- `git commit -m "refactor(ia): IA solo genera sugerencias offline, no escribe categoría"`

---

## Etapa 7 — Documentación

### Tarea 7.1 — README
- Actualizar sección "Cómo funciona (versión simple)": 4 capas en vez de 6.
- Actualizar mermaid diagrams (2 diagramas).
- Tabla técnica de cascada: 4 filas.
- Modelo de datos SQL: 6 tablas core.
- Quitar referencias a `patrones`, `patrones_usuario`, `memoria_usuario_destinatario` separadas.
- Quitar referencias a `comercios_catalogo`, reemplazar por `mcc_por_nombre`.
- Si etapa 6 corrió: actualizar IA section.

### Tarea 7.2 — OpenAPI
- Nuevos endpoints `/reglas`.
- Quitar `/patrones`, `/patrones-usuario`, `/memoria` o marcar como deprecated.
- Si etapa 6: quitar endpoints IA inline.

### Tarea 7.3 — Postman
- Folder `reglas` con CRUD + sugerencias.
- Folders viejos: borrar o marcar deprecated.

### Tarea 7.4 — Commit final
- `git commit -m "docs: actualizar README + OpenAPI + Postman para modelo simplificado"`

---

# Validación global por tarea

Cada tarea debe cumplir antes de avanzar a la siguiente:

```bash
pnpm lint       # 0 errors
pnpm typecheck  # 0 errors
pnpm test       # todos pass
```

Tareas con cambios en pipeline también deben pasar:

```bash
# Test masivo agreement vs baseline
curl -X POST /test-batch/start -d '{"batch_id":"post_etapa_N","files":[...]}'
# Esperar finalizar
curl /test-batch/post_etapa_N/agreement?ground_truth=<gt>
# Comparar contra baseline_pre_simplif.json
```

---

# Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Migración de tipos `prefijo` → `literal` o `regex` cambia matches | Audit data antes (etapa 4.1), test masivo después (etapa 2.8) |
| Reordenar capa MCC vs reglas globales baja cobertura | Test masivo post-etapa-3 (3.5). Mitigar promoviendo top-N de `mcc_por_nombre` a reglas globales |
| Cliente mobile depende de IA inline | Confirmar antes de etapa 6 (tarea 6.1). Si depende, skip etapa 6 |
| Drop tablas viejas en etapa 2.9 sin compat shim | Mantener compat shims de routes hasta confirmar producción estable |
| Migración 0017 backfill incompleto | Validar con `SELECT COUNT(*)` antes y después (tarea 2.1) |
| Tests viejos hardcoded contra schema viejo | Buscar `comerciosCatalogo` / `patronesUsuario` / `memoriaUsuarioDestinatario` y actualizar/borrar |

---

# Dependencias de archivos (consistencia)

Archivos a tocar en CADA etapa (checklist de no-olvidar):

## Etapa 1 (comercios_catalogo → mcc_por_nombre)
- `src/db/schema/comercios_catalogo.ts` → renombrar
- `src/db/schema/index.ts`
- `src/db/repos/comercios.ts`, `comercios-writer.ts`, `mcc-por-nombre.ts`
- `src/layers/catalogo.ts`
- `src/api/routes/comercios.ts`, `recategorizar-catalogo.ts`, `aplicar-diff.ts`
- `src/services/recategorizar-catalogo.ts`
- `src/main.ts`
- Tests asociados
- `ui/recat/` (borrar)
- `data/seed.sql` (regenerar si carga catálogo viejo)

## Etapa 2 (reglas unificada)
- `src/db/schema/patrones.ts`, `patrones_usuario.ts`, `memoria_usuario_destinatario.ts`
- `src/db/repos/patrones.ts`, `patrones-usuario.ts`, `memoria-usuario.ts`
- `src/layers/memoria.ts`, `patrones.ts`, `patrones-usuario.ts`
- `src/api/routes/patrones.ts`, `patrones-usuario.ts`, `memoria.ts`
- `src/pipeline/categorizar.ts`, `src/main.ts`
- Tests
- `ui/memoria/index.html`
- `openapi.yaml`, `postman/tagger.postman_collection.json`

## Etapa 3 (capa MCC inteligente)
- `src/layers/catalogo.ts` (borrar)
- `src/layers/mcc.ts`
- `src/pipeline/categorizar.ts`
- `src/main.ts`
- Tests
- `bypass_catalogo` flag en schemas/routes

## Etapa 6 (IA solo sugiere)
- `src/pipeline/ia-fallback.ts`
- `src/layers/ia.ts`
- `src/api/routes/sugerencias-ia.ts`
- `src/db/schema/marcas_conocidas.ts` (eventualmente drop)
- `src/main.ts`
- README, OpenAPI

---

# Resumen de cambios

| Antes | Después |
|-------|---------|
| 11 tablas | 6 core + 1 audit + 1 dev |
| 6 capas pipeline | 4 capas |
| 22 cols en `comercios_catalogo` | 7 cols en `mcc_por_nombre` |
| 4 tipos de patrón | 3 tipos |
| 3 tablas para reglas | 1 tabla `reglas` con scope |
| IA escribe categoría inline | IA solo sugiere offline (opcional) |
| `marcas_conocidas` activa | Tabla eliminada (con etapa 6) |
| 5 cols shadow recategorización | Feature eliminada |

**Tiempo estimado total**: 8-12 horas de implementación + 2 horas de testing + 1 hora de docs.

**Orden recomendado**: 0 → 1 → 2 → 3 → 7 (etapas 4, 5, 6 opcionales / paralelizables).

---

# Decisiones tomadas (2026-05-19)

1. **Reemplazar routes directo**: borrar `/patrones`, `/patrones-usuario`, `/memoria`. No mantener compat shims. Cliente debe migrar a `/reglas`.
2. **IA inline se mantiene**: skip Etapa 6 entera. `marcas_conocidas` permanece. IA sigue escribiendo `categoria_predicha_id` async.
3. **Feature recategorización se elimina ahora, se rehace después como epic separado**:
   - Drop columnas shadow (`categoria_nueva_id`, `fuente_nueva`, `confianza_nueva`, `evidencia_nueva`, `recategorizado_at`).
   - Borrar `src/services/recategorizar-catalogo.ts`, `src/api/routes/recategorizar-catalogo.ts`, `src/api/routes/aplicar-diff.ts`, `src/api/routes/marcas-candidatas.ts` (si depende).
   - Borrar UI `/ui/recat/`.
   - Endpoints + Postman entries: borrar.
   - Reemplazo futuro: nueva feature de recategorización con diseño limpio (probablemente usando `test-batch` con batch_id de comparación).
   - Tabla `mcc_por_nombre` queda con **7 columnas útiles** (drop completo de las 15 inertes).

## Etapas activas

- ✅ Etapa 0 — Baseline
- ✅ Etapa 1 — `comercios_catalogo` → `mcc_por_nombre` (manteniendo shadow cols)
- ✅ Etapa 2 — Unificar reglas (sin compat shims)
- ✅ Etapa 3 — Capa MCC inteligente
- ✅ Etapa 4 — Tipos patrón 4→3
- ✅ Etapa 5 — MCC ambiguo simplificado
- ❌ Etapa 6 — IA offline (DESCARTADA)
- ✅ Etapa 7 — Docs

## Foco del refactor (resumen)

| Antes | Después |
|-------|---------|
| 11 tablas | 7 tablas (6 core + 1 audit; `marcas_conocidas` + `test_ground_truth` se quedan) |
| 6 capas pipeline | 4 capas |
| Confidence: 6 niveles | 4 niveles |
| `comercios_catalogo`: 22 cols | `mcc_por_nombre`: ~12 cols (7 útiles + 5 shadow recategorización) |
| 3 tablas para reglas | 1 tabla `reglas` con `scope` |
| 4 tipos patrón | 3 tipos |
| MCC ambiguo salta | MCC ambiguo matchea con `requiere_revision=true` |
| IA escribe inline | Igual (sin cambio) |

## Insight clave (de la conversación)

**La capa 2 actual (catálogo) es realmente una capa MCC disfrazada.** El catálogo no es catálogo Bancard — es un join precomputado `nombre → MCC → categoría`. Por eso `fuente_categoria='mcc'` y `mcc_inferido=TRUE` en TODAS las 64966 filas.

**Consolidación natural**: una sola capa MCC con dos fuentes de MCC:

```ts
async function evaluar(input) {
  // 1. MCC directo del input
  if (input.mcc) {
    const r = await mccCatalogoLookup(input.mcc);
    if (r) return r;
  }
  // 2. MCC inferido por nombre
  if (input.nombre) {
    const inferido = await mccPorNombreLookup(input.nombre);
    if (inferido) {
      const r = await mccCatalogoLookup(inferido.mcc);
      if (r) return { ...r, evidencia: { mcc_inferido_por_nombre: true } };
    }
  }
  return null;
}
```

**Pipeline final (4 capas)**:

| # | Capa | Tabla | Lo que hace |
|---|------|-------|-------------|
| 0 | Reglas usuario | `reglas WHERE scope='usuario:X'` | Memoria + patrones personales unificados |
| 1 | Reglas globales | `reglas WHERE scope='global'` | Patrones globales curados |
| 2 | MCC (con name fallback) | `mcc_catalogo` + `mcc_por_nombre` | MCC del input o inferido del nombre |
| 3 | IA fallback | (sin tabla) | Solo si `IA_ENABLED` |

**Re-ordenamiento crítico**: hoy `catalogo` (capa 2) dispara antes que `patrones` (capa 3). Después: reglas globales ganan sobre matches por nombre. Mitigación si baja cobertura: promover top-N nombres de `mcc_por_nombre` a `reglas` globales antes del cutoff.

**Métrica de éxito**: agreement vs `baseline_pre_simplif` no baja más de 0.5–1% por etapa.
