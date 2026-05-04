# tagger

Servicio categorización gastos. Cascada: regex → Bancard → comercio → MCC → IA (Gemma).

## Tareas

- **Source truth:** [`tasks.json`](./tasks.json)
- **Vista markdown:** [`TASKS.md`](./TASKS.md)
- **Dashboard:** abrir [`ui/index.html`](./ui/index.html) en navegador (sirve con `npx serve .` o similar)

## Workflow por tarea (automatizado)

1. **Ver siguiente** disponible: `node scripts/next-task.mjs`
2. **Iniciar**: `node scripts/start-task.mjs <ID>` → marca `in_progress`, valida deps, sync TASKS.md
3. **Implementar** según `detail` y `files` de la tarea.
4. **Verificar + cerrar**: `node scripts/check-task.mjs <ID>` → corre 3 gates (test, lint, consistency); si pasa marca `done`, sync TASKS.md, sugiere siguiente. Si falla, estado intacto.
5. **Commit**: `git commit -m "task(<ID>): <title>"`
6. Repetir.

Reglas:
- Solo una tarea `in_progress` a la vez (start-task lo enforza).
- No avanza si dependencias no están `done`.
- Falla cualquier gate → estado no cambia. Fix obligatorio. **Nunca skip.**

## Gates

| Gate | Comando |
|------|---------|
| test | `pnpm test` |
| lint | `pnpm lint && pnpm typecheck` |
| consistency | `pnpm check:consistency` |

## Scripts

| Comando | Acción |
|---------|--------|
| `next-task.mjs` | Imprime siguiente tarea disponible |
| `start-task.mjs <ID>` | Marca `in_progress`, valida deps, sync |
| `check-task.mjs <ID>` | Corre 3 gates; si pasa marca `done` + sync; sugiere siguiente. Auto-valida fase si es la última tarea |
| `validate-phase.mjs <PHASE_ID>` | Validación final fase: todas done + 3 gates globales limpio. Marca `validated:true` |
| `sync-tasks.mjs` | Regenera `TASKS.md` desde `tasks.json` |
| `check-consistency.mjs` | Valida JSON, IDs únicos, deps, ciclos, sync con `TASKS.md` |

## Mapeo MCC → categoría (catálogo masivo)

Pa categorizar 100k+ comercios Bancard con MCCs oficiales:

1. **Convertir xlsx → TSV**: `node scripts/xlsx-to-tsv.mjs <ruta.xlsx>` (genera `data/mcc-general.tsv` y `data/comercios-bancard-raw.tsv`)
2. **Cargar MCCs oficiales**: `pnpm db:load:mcc-general` (puebla `mcc_catalogo` con descripciones)
3. **Exportar plantilla**: `node scripts/export-mcc-mapping.mjs` → genera `data/mcc-categoria-mapping.tsv`
4. **Editar manualmente** el TSV: llenar columna `categoria_slug` pa cada `cod_mcc`. Filas vacías quedan sin categoría.
5. **Aplicar mapeo**: `pnpm db:load:mcc-categoria` (UPDATE `mcc_catalogo.categoria_id` desde plantilla)
6. **Preprocess Bancard**: `node scripts/preprocess-bancard.mjs` (split MANGO P2P + dedup)
7. **Loader masivo**: `pnpm db:load:comercios-bancard-masivo` (cascada por fila → `comercios_catalogo`)
8. **Reporte cobertura**: `node scripts/report-cobertura.mjs` — muestra distribución por fuente, % requiere_revision, top categorías, top MCCs sin mapeo (pa priorizar mapeo manual). Re-correr cada vez que se llena plantilla MCC.

El TSV de mapeo es idempotente: re-correr `export-mcc-mapping.mjs` preserva slugs ya editados.

## Test interactivo via UI

API sirve dashboard control en mismo origen (sin CORS file://):

```bash
bash start.sh
# abrir http://localhost:3000/ui/test-monitor/index.html
```

UI permite:
- **Run**: dispara worker in-process (sin loopback HTTP). Form: batch_id, limit, concurrency.
- **Stop**: cancela worker activo.
- **Monitor**: solo polea stats existentes (sin lanzar nuevo run).
- **Pause poll**: detener refresh sin cancelar worker.

Worker ejecuta cascada directo + persiste con `origen='test_masivo'`. Mide latencia pipeline puro (sin red/serialize HTTP).

Pa test "vía HTTP real" (con red/auth/serialize) seguir usando CLI:

```bash
pnpm test:masivo --batch-id baseline-cli --concurrency 30
```

Cleanup batch viejo:

```sql
DELETE FROM movimientos WHERE batch_id = 'mi-batch';
```


