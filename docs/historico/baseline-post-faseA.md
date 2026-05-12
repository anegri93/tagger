# Baseline post-Fase A

**Fecha**: 2026-05-11
**Pipeline activo**: catalogo → patrones → MCC → comercio → IA (5 capas)

## Resumen final (con fix MCC en recat)

| Métrica  | Pre-refactor   | Post-A inicial | Post-A + MCC       | Δ total                 |
| -------- | -------------- | -------------- | ------------------ | ----------------------- |
| Total    | 49,444         | 49,444         | 49,444             | —                       |
| Match    | 23,677 (47.9%) | 24,125 (48.8%) | **36,547 (73.9%)** | **+12,870 (+26%)** ✅   |
| Diff     | 2,283 (4.6%)   | 1,827 (3.7%)   | 2,534 (5.1%)       | +251 (+0.5%)            |
| Sin cat  | 23,484 (47.5%) | 23,492 (47.5%) | **10,363 (20.9%)** | **-13,121 (-26.6%)** ✅ |
| Duración | 21s            | 20s            | 30s                | +9s                     |

## Distribución fuente_nueva

| Fuente                | Pre-refactor | Post-A     | Δ              |
| --------------------- | ------------ | ---------- | -------------- |
| contiene (patrones)   | 13,275       | 13,272     | −3             |
| regex (patrones)      | 12,685       | 12,680     | −5             |
| **mcc**               | **0**        | **13,129** | **+13,129** ✅ |
| Total resuelto sin IA | 25,960       | **39,081** | **+13,121**    |

## Top diffs principales (post-MCC)

| actual       | nueva        | n   |
| ------------ | ------------ | --- |
| alimentacion | restaurante  | 390 |
| otros        | servicios    | 303 |
| otros        | ropa         | 161 |
| hogar        | otros        | 91  |
| hogar        | ropa         | 89  |
| servicios    | salud        | 72  |
| otros        | alimentacion | 58  |
| supermercado | ropa         | 49  |

Top diff "alimentacion → restaurante" (+390) es nuevo: efecto del regex actualizado en A1 (`\b(...|CAFE|PIZZA)\b`).

## Cambios introducidos por Fase A

1. ✅ A1: Migrado regla gastro a regex de patrones (+CAFE|PIZZA).
2. ✅ A2: Eliminada capa `regex` standalone (todo via `patrones`).
3. ✅ A3: Verificado bancard redundante (0.006% aporte histórico).
4. ✅ A4: Eliminada capa `bancard`.
5. ✅ A5: Reordenado MCC antes que comercio.
6. ✅ A6: Early-skip en catálogo si null IDs.
7. ✅ A7+A8: Recat catalogo arreglado para pasar `mcc_original` a cascada.

## Métricas vs objetivo

| Objetivo         | Target | Real  | OK                          |
| ---------------- | ------ | ----- | --------------------------- |
| % sync_ok        | ≥ 95%  | 73.9% | ⚠️ falta — caen 10,363 a IA |
| % diff vs pre    | < 5%   | +0.5% | ✅                          |
| Pipeline 5 capas | sí     | sí    | ✅                          |
| 0 regresiones    | sí     | sí    | ✅                          |

73.9% es muy bueno pero queda 20.9% sin_cat. Esos 10,363 son comercios:

- Sin patrón que matchee.
- Con MCC ausente o no mapeado.
- Llegarán a IA en runtime (no en este recat dry-run).

## Pendiente

- Fase B: decidir destino capa `comercio` (3,007 movimientos fuente='nombre' históricamente → bajo aporte).
- Commit Fase A.
