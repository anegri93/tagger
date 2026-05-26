# Runbook tagger

Operación y mantenimiento del servicio.

---

## Deploy inicial

### 1. Levantar infra

```bash
docker compose up -d postgres                       # solo DB
docker compose up -d --build tagger                 # build + run API (IA via OpenRouter)
```

### 2. Aplicar migrations

Drizzle-kit no está en runtime image. Correr desde host:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
```

O ejecutar dentro del contenedor build:

```bash
docker compose run --rm api sh -c "npm i drizzle-kit && pnpm db:migrate"
```

### 3. Cargar seed inicial

```bash
docker exec -i tagger-postgres-1 psql -U tagger -d tagger < data/seed.sql
```

Idempotente (ON CONFLICT DO NOTHING). Contenido:

- 35 categorías
- 215 MCCs mapeados
- 279 patrones
- 76 marcas conocidas

### 4. Verificar

```bash
curl http://localhost:3000/health
# → {"status":"ok"}

curl http://localhost:3000/health/ready
# → {"status":"ok","db":"ok","llm":"ok"|"fail"|"skip"}
```

---

## Importar catálogo de comercios

Catálogo (`comercios_catalogo`) acelera lookup directo por `bancard_id + codigo_comercio`. Sin él, pipeline cae a patrones/MCC/IA.

### Vía UI

1. Abrir `http://localhost:3000/ui/importar/`
2. Destino: **catalogo**
3. Cargar XLSX/CSV, mapear columnas (auto-detect): `nombre`, `bancard_id`, `codigo_comercio`, `mcc`
4. Tildar **Correr cascada inicial** (asigna categoría tentativa)
5. Importar (chunked 200/lote async)
6. Status en mismo UI

### Vía API

```bash
curl -X POST http://localhost:3000/catalogo/importar \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {"nombre":"BURGER KING SHOPPING","bancard_id":"123","codigo_comercio":"456","mcc":"5812"},
      ...
    ],
    "correr_cascada": true
  }'
# → {"import_id":"imp_...", "batch_id":"..."}

curl http://localhost:3000/catalogo/importar/status -H "x-api-key: $API_KEY"
```

---

## Importar movimientos para evaluación

Útil para benchmark + descubrir patrones nuevos.

### Vía UI

1. `/ui/importar/` → destino: **movimientos**
2. Columnas: `nombre`, `mcc?`, `monto?`
3. Importar → cada row pasa por `ejecutarCascada` + persiste en `movimientos`
4. Resultados en `/ui/test-monitor/` filtrando por `batch_id`

---

## Correcciones de usuario

Cuando usuario corrige una categoría en mobile, llamar:

```bash
POST /movimientos/:id/correccion
{
  "categoria_id_nueva":"<uuid>",
  "motivo":"era taxi",
  "usuario":"user123",
  "aprender":true
}
```

Campos:

- `categoria_id_nueva` (UUID, requerido)
- `motivo` (string, opcional)
- `usuario` (string, opcional) — id del usuario, determina scope de regla aprendida
- `aprender` (boolean, opcional, default `true`):
  - `true`: actualiza mov + upsert regla user-scope (`scope='usuario:<id>' tipo='literal' prio=1 origen='correccion'`)
  - `false`: sólo actualiza el mov (excepción puntual, no contamina memoria)

Efecto:

- `categoria_confirmada_id` del mov actualizado
- `fuente_categoria = 'manual'`, `requiere_revision = false`
- Registro en `correcciones_usuario` (audit, siempre)
- Si `aprender=true` + tiene `usuario`: regla user-scope creada/actualizada → próximos movs del mismo nombre devuelven la nueva categoría automático (capa 0 del pipeline)

### Autocomplete de descripciones (per-user)

Cuando un usuario tipea la descripción de una transferencia, la app puede sugerir
descripciones que ese usuario ya escribió antes:

```bash
GET /descripciones/sugerencias?usuario=user_123&q=alq&limit=10
```

Response:

```json
{
  "usuario": "user_123",
  "q": "alq",
  "limit": 10,
  "items": [
    { "descripcion": "alquiler", "freq": 8, "categoria_slug": "hogar" },
    { "descripcion": "alquiler departamento", "freq": 5, "categoria_slug": "hogar" }
  ]
}
```

Detalles:

- **Scope per-user**: nunca devuelve descripciones de otros usuarios.
- **Prefix btree**: latencia p99 < 50ms hasta ~10M filas.
- **Fire-and-forget upsert**: cada `POST /categorizar-movimiento` con
  `descripcion` no nula + `origen` hace `INSERT … ON CONFLICT UPDATE` async.
  No bloquea el response.
- **Cat-aware boost**: pasar `categoria_id` opcional sube en el ranking las
  descripciones cuya `cat_top` coincide.
- **Mínimo 2 chars** en `q`. Debouncear cliente 150ms recomendado.

### Backfill histórico

Después de aplicar la migration `0023_descripcion_uso.sql`, llenar la tabla
desde el corpus de `movimientos` existente:

```bash
pnpm tsx scripts/backfill-descripcion-uso.ts
```

Idempotente (ON CONFLICT recalcula freq/cat_top/ultima_vez_at). Reaplicable.

### Categorización manual al cargar (alternativa)

Si la app crea el mov con cat ya elegida por el user (gasto manual sin cascada), usar `POST /categorizar-movimiento` con `categoria_id` directo:

```bash
POST /categorizar-movimiento
{
  "nombre_bancard":"ALMACEN DON JUAN",
  "monto":35000,
  "origen":"user123",
  "categoria_id":"<uuid>",
  "aprender":true
}
```

Efecto: skip cascada, mov se guarda con `fuente='manual'` `confianza=1`. Si `aprender=true` + `origen` → también upsert regla user-scope.

---

## Reprocesar movimiento individual

Re-ejecuta cascada + IA sobre un movimiento existente. Útil cuando:

- Movimiento quedó con `categoria_id: null` (IA caída al momento del POST inicial)
- Querés re-evaluar tras agregar patrones/MCCs nuevos
- Mobile expone botón "re-categorizar"

```bash
curl -X POST http://localhost:3000/movimientos/<uuid>/reprocesar \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

Response incluye `ia_disparada: bool`. Si `true`, cliente debe poll `/movimientos/:id` (igual que IA fallback inicial).

### Reprocesar todos los movimientos sin categoría (one-shot)

No hay endpoint masivo. Para limpiar backlog usar script:

```bash
# pseudo-código: iterar SELECT id FROM movimientos WHERE categoria_predicha_id IS NULL
# y POST /movimientos/:id/reprocesar por cada uno
```

---

## Recategorización del catálogo

> Nota: `/ui/recat/` fue removido en la simplificación del pipeline (commit e96b04e).
> Para detectar drift entre reglas/MCC y movs existentes, usar `POST /movimientos/:id/reprocesar`
> sobre movs específicos, o re-ejecutar `test-batch` con `source=catalogo` para benchmark masivo.

Después de agregar reglas/MCCs nuevos, opciones para re-evaluar:

### Mov individual

```bash
POST /movimientos/<id>/reprocesar
{ "bypass_catalogo": false }
```

Re-corre cascada sobre ese mov. Útil para auditar correcciones específicas.

### Benchmark masivo (sin tocar movs reales)

```bash
POST /test-batch/start
{ "batch_id": "regression-2026-05", "source": "mcc_por_nombre", "concurrency": 30 }
```

Corre cascada sobre el catálogo `mcc_por_nombre` (~65k entradas) y genera stats de drift (match / mismatch / sin_match) vs lo curado. Inspeccionar en `/ui/test-monitor/`.

### Sugerencias de reglas globales

Cross-user: cuando varios usuarios corrigieron el mismo nombre a la misma cat:

```bash
GET /reglas/sugerencias-globales?min_usuarios=3&min_total=5
```

Aparece en `/ui/dashboard/` con botón "+ Regla global" para promover.

---

## Métricas y monitoreo

### `/ui/test-monitor/`

Dashboard realtime:

- Lanzar batch (fuente: TSV file / `catalogo` DB)
- Stats: latencia p50/p99, distribución por fuente, agreement vs catalogo baseline
- Top mismatches (categoría predicha != confirmada)

### CLI métricas batch

```bash
node scripts/analyze-test-batch.mjs <batch_id>
```

### Logs

```bash
docker compose logs -f api          # contenedor
tail -f .tagger.log                 # bare metal con start.sh
```

JSON estructurado (pino). Filtrar por `reqId`, `latencyMs`, etc.

---

## Mantenimiento DB

### Limpieza batch viejo

```sql
DELETE FROM movimientos WHERE batch_id = 'mi-batch';
-- O reset completo (solo dev/test):
TRUNCATE movimientos RESTART IDENTITY CASCADE;
```

### Reset completo DB (dev/test)

```bash
pnpm tsx scripts/clean-db.ts
```

Trunca todas las tablas salvo `categorias` / `patrones` / `mcc_catalogo` / `marcas_conocidas`.

### Re-dump seed

Después de agregar patrones/categorías productivos:

```bash
pnpm db:seed:dump
git add data/seed.sql && git commit -m "seed: refresh"
```

### Backup completo

```bash
docker exec tagger-postgres-1 pg_dump -U tagger tagger > backup-$(date +%F).sql
```

---

## Troubleshooting

### `401 unauthorized`

Header `x-api-key` falta o no coincide con `API_KEY` env. UI: setear en input top-right.

### `409 import_en_progreso`

Solo 1 import simultáneo. Esperar a que termine (`GET /catalogo/importar/status`) o `pkill node` (drástico).

### `503` o IA timeout

OpenRouter no responde o key inválida. Verificar:

```bash
curl http://localhost:3000/health/ready
# → "llm":"fail" si la key está mal o red no llega

curl -sI -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models
```

Si free models están rate-limited, el fallback chain hardcoded prueba 4 modelos en orden. Si todos fallan, IA fallback queda no-op para ese mov.

### Movimientos quedan sin categoría

Cascada agotada sin match. Opciones:

- Esperar IA fallback (async) — re-fetch `/movimientos/:id` después de ~5s
- Agregar regla manual via `/ui/categorias/<slug>` → tab Patrones
- POST `/movimientos/:id/correccion` con la cat correcta (audit + memoria user)
- Re-ejecutar cascada sobre ese mov: `POST /movimientos/:id/reprocesar`

---

## Performance baseline

Hardware dev (M1 Pro):

- Throughput cascada pura: ~1.500 req/s
- Throughput con catálogo hit: ~7.000 req/s
- p99 latencia: < 50ms (sin IA), < 3s (con IA fallback)

Sin `OPENROUTER_API_KEY`, IA fallback queda no-op → respuesta inmediata con `categoriaId=null` + `requiereRevision=true`.
