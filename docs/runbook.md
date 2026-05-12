# Runbook tagger

Operación y mantenimiento del servicio.

---

## Deploy inicial

### 1. Levantar infra
```bash
docker compose up -d postgres                       # solo DB
docker compose --profile ai up -d ollama            # + Ollama opcional
docker compose up -d --build api                    # build + run tagger
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
# → {"status":"ok","db":true,"ollama":true|false}
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
{"categoria_id_nueva":"<uuid>","motivo":"era taxi"}
```

Efecto:
- Actualiza `categoria_confirmada_id` del movimiento
- Registro en `correcciones_usuario` (audit trail)
- **No** retroalimenta patrones automáticamente (decisión manual via `/ui/recat/`)

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

Después de agregar patrones/MCCs nuevos, re-evaluar comercios existentes:

### Workflow
1. UI: `http://localhost:3000/ui/recat/`
2. ▶ **Correr recategorización** → ejecuta cascada (bypass catálogo) sobre todo `comercios_catalogo`
3. Resultado va a columnas shadow: `categoria_nueva_id`, `fuente_nueva`, `confianza_nueva`, `recategorizado_at`
4. Ver **Comparación** (totales: match / diff / sin_categoria)
5. Inspeccionar **Diffs por categoría** (drill-down → ver rows específicos)
6. **Aplicar diff** (promueve `categoria_nueva_id → categoria_id`):
   - Botón por celda de tabla diffs
   - O CLI: `pnpm tsx scripts/aplicar-recat.ts --apply`

### Sugerencias automáticas
En `/ui/recat/`:
- **Sugerencias patrones** → rule-based desde sin_cat
- **Sugerencias IA** → Ollama itera y propone patrones nuevos (5 iteraciones por defecto)
- **Marcas candidatas** → prefijos frecuentes que aún no son patrón

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
Ollama no responde. Verificar:
```bash
docker compose ps ollama
curl http://localhost:11434/api/tags
```
Si OLLAMA_MODEL no descargado:
```bash
docker exec tagger-ollama-1 ollama pull gemma2:2b
```

### Movimientos quedan sin categoría
Cascada agotada sin match. Opciones:
- Esperar IA fallback (async) — re-fetch `/movimientos/:id` después de ~5s
- Agregar patrón manual via `/ui/categorias/<slug>` → tab Patrones
- Recategorizar después con `/ui/recat/`

### Drift entre `categoria_id` y `categoria_nueva_id` en comercios
Recategorización corrió pero no se aplicó. Opciones:
- Revisar diffs en `/ui/recat/`
- Aplicar selectivamente (UI) o masivamente (`pnpm tsx scripts/aplicar-recat.ts --apply`)

---

## Performance baseline

Hardware dev (M1 Pro):
- Throughput cascada pura: ~1.500 req/s
- Throughput con catálogo hit: ~7.000 req/s
- p99 latencia: < 50ms (sin IA), < 3s (con IA fallback)

Sin Ollama, IA fallback queda no-op → respuesta inmediata con `categoriaId=null` + `requiereRevision=true`.
