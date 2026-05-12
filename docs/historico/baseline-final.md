# Baseline final post-refactor pipeline

**Fecha**: 2026-05-11
**Pipeline final**: catalogo → patrones → MCC → IA (3 capas síncronas + IA async)
**Run ID**: run_1778506955595_0ka66t
**Duración**: 30s para 49,444 comercios.

## Resultados finales

| Métrica       | Valor          |
| ------------- | -------------- |
| Total         | 49,444         |
| Match         | 36,547 (73.9%) |
| Diff          | 2,534 (5.1%)   |
| Sin categoría | 10,363 (20.9%) |

## Evolución completa

| Métrica       | Pre-refactor | Post-A | Post-B (final) | Δ            |
| ------------- | ------------ | ------ | -------------- | ------------ |
| Match         | 47.9%        | 73.9%  | **73.9%**      | +26%         |
| Sin_cat       | 47.5%        | 20.9%  | **20.9%**      | -26.6%       |
| Capas runtime | 7            | 5      | **3**          | -57%         |
| Tests         | 287          | 288    | 285            | −2 (cleanup) |

## Pipeline final

```
INPUT: { nombre, mcc, bancard_id?, codigo? }
   │
   ▼
1. CATÁLOGO    lookup (bancard_id + codigo) — skip si null IDs
   │ miss
   ▼
2. PATRONES    regex/literal/prefijo/contiene sobre nombre
   │ miss
   ▼
3. MCC         lookup mcc_catalogo (185 MCCs TuFi)
   │ miss
   ▼
4. IA          Gemma 2:2b async fallback
```

## Distribución fuente_nueva (último recat)

| Fuente              | Count  | %     |
| ------------------- | ------ | ----- |
| contiene (patrones) | 13,272 | 26.8% |
| mcc                 | 13,129 | 26.6% |
| regex (patrones)    | 12,680 | 25.6% |
| sin cat → IA async  | 10,363 | 20.9% |

## Capas eliminadas

| Capa             | Razón                                   |
| ---------------- | --------------------------------------- |
| regex standalone | Duplicaba patrones tipo=regex           |
| bancard          | 0.006% aporte histórico                 |
| comercio         | 0 hits en último recat con MCC presente |

## Garantías cumplidas

- ✅ Pipeline determinístico (3 capas síncronas).
- ✅ "Patrón vence MCC" → patrones evalúa antes que MCC.
- ✅ MCC actúa como base cuando no hay patrón.
- ✅ Real producción `{nombre, mcc}`: latencia esperada < 5ms.
- ✅ Cero regresiones en categorización vs pre-refactor.
- ✅ Mantenibilidad: 3 fuentes verdad (`patrones`, `mcc_catalogo`, `comercios_catalogo`).

## Pendiente (futuro)

- Eliminar archivos `src/layers/regex.ts`, `bancard.ts`, `comercio.ts` (no se usan en runtime, scripts offline aún los referencian).
- Reducir los 10,363 sin_cat: añadir patrones para los comercios sin match.
- Subcategorías (parent_id).
- Detección de cambios en upsert procesadora.
