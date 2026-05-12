# TODOs pendientes — handover dev

Items conocidos a resolver tras el handover. No bloqueantes para release MVP.

## Críticos (resolver antes de producción)

### 1. `mccPorNombre` acoplado a tabla de test

**Smell**: `src/db/repos/mcc-por-nombre.ts` consulta `comercios_catalogo` Y `test_ground_truth` como fuentes de inferencia MCC.

```sql
SELECT mcc FROM comercios_catalogo WHERE nombre_normalizado = $1
UNION ALL
SELECT mcc FROM test_ground_truth WHERE nombre_normalizado = $1
```

`test_ground_truth` es una tabla de validación, no debería ser fuente de runtime. Acoplamiento test/prod.

**Fix propuesto**:

- Crear tabla nueva `comercios_bancard_raw` con datos crudos Bancard (nombre, MCC).
- Cargar 108k comercios de XLSX original ahí.
- `mccPorNombre` consulta solo `comercios_catalogo` + `comercios_bancard_raw`.
- `test_ground_truth` queda exclusivamente para tests.

### 2. IA fallback sin persistencia

**Smell**: `src/pipeline/ia-fallback.ts` usa queue en memoria + setImmediate. Si el server reinicia con jobs encolados, los pierde.

**Caso vivido**: durante session 2026-05-12, dev server reload mid-procesamiento → 5.748 jobs perdidos. Hubo que reprocesar manualmente.

**Fix propuesto**:

- Tabla `ia_jobs` con estados: pending, running, completed, failed.
- Worker que toma pending al boot.
- Backoff exponencial en failed.
- Marca completed al actualizar movimiento.

### 3. Rate limiting

**Smell**: no hay límite por API key. Un cliente con `concurrency=100` puede saturar Ollama instantáneamente.

**Caso vivido**: 5.748 IA jobs paralelos colgaron Ollama 60s+.

**Fix propuesto**:

- `@fastify/rate-limit` con límite por `x-api-key`.
- Default: 100 req/s, configurable por env.
- Endpoint `/categorizar-movimiento` con límite separado (más estricto).

## Importantes (sprint 1)

### 4. API keys por usuario

Hoy 1 sola API_KEY compartida. Sin tracking de quién hace qué. Sin rotación.

**Fix**: tabla `api_keys` (id, label, key_hash, scopes, last_used, created_at). Endpoint admin para crear/revocar.

### 5. CI/CD

No hay `.github/workflows/`. Cada PR debería correr:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm format:check`

15 min de trabajo. Bloquear merge si falla.

### 6. MCCs ambiguos curados manualmente

10 MCCs marcados ambiguos durante validación (`5812, 5814, 5399, 5621, 7299, 5331, 9311, 5251, 5441, 5311`). Quedaron en seed via `db:seed:dump`.

Si en algún momento se cargan más MCCs vía import o se regenera el seed sin esos updates, se pierden. Considerar:

- Migration explícita que marque esos MCCs ambiguos (no depende del seed).
- O script idempotente `scripts/aplicar-mccs-ambiguos.ts` que se corre post-seed.

### 7. Tests de integración E2E

Hay 47 archivos test unitarios. No hay tests E2E que arranquen API + DB real y ejerciten el pipeline completo.

**Fix**: 1-2 tests con `pg-mem` o testcontainers. Verifican cascada de punta a punta.

## Menores

### 8. Migration 0011 + 0012 son duplicadas

Ambas hacen `DROP TABLE` de las mismas 3 tablas (`reglas_regex`, `dataset_comercios`, `datasets`). Histórico, ya idempotente con `IF EXISTS`.

No fix necesario. Documentado acá para que dev no se confunda.

### 9. Loop usuario → patrón

Las correcciones de usuario se guardan en `correcciones_usuario` pero no cierran el loop. No generan patrón candidato automático. Ver `README.md` sección "Fuente 1 — Correcciones de usuarios".

**Fix sugerido**: job semanal que detecta consenso (N usuarios distintos misma corrección mismo comercio) → emite patrón candidato a `/patrones/sugerencias`.

### 10. UI `/ui/probar` para usuarios no técnicos

Mencionado en chat 2026-05-12. UI simple: 1 input nombre → ver categoría predicha. 20 min. Útil para demos a stakeholders.

## Decisiones tomadas (no son TODOs, contexto)

- **Confianza IA cap 0.50**: bajado de 0.70 después de medir agreement 12% IA contra MCC.
- **Confianza `contiene` 0.80**: bajado de 0.90, refleja match laxo.
- **MCC ambiguos = no categorizan**: capa MCC retorna null si `ambiguo=true`. Mejor abstenerse que confirmar mal.
- **`mccPorNombre` ejecuta después de capa MCC explícita**: solo dispara cuando input.mcc no resolvió. Compensa input solo-nombre de producción real.
- **IA `requiere_revision=true` siempre**: independiente de confianza. Cualquier categoría asignada por IA queda flagged para auditoría humana.
