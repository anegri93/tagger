# Baseline pre-refactor pipeline

**Fecha**: 2026-05-11
**Run ID**: run_1778504329758_sy1adv
**Pipeline activo**: catalogo → patrones → regex → bancard → comercio → mcc → IA (7 capas)
**Modo recat**: bypassCatalogo=true, bypassComercio=true (recategorización pura por cascada)

## Resumen

| Métrica                  | Valor  | %     |
| ------------------------ | ------ | ----- |
| Total comercios          | 49,444 | 100%  |
| Procesados               | 49,444 | 100%  |
| Match (mantiene cat)     | 23,677 | 47.9% |
| Diff (sugiere cambio)    | 2,283  | 4.6%  |
| Sin categoría (cae a IA) | 23,484 | 47.5% |
| Duración                 | ~21s   | —     |

## Distribución fuente_nueva (capas que resolvieron)

| Fuente                      | Count      |
| --------------------------- | ---------- |
| contiene (patrones)         | 13,275     |
| regex (capa regex)          | 12,685     |
| **total resuelto sin IA**   | **25,960** |
| sin_categoria (requiere IA) | 23,484     |

**Observación clave**: 47.5% de comercios NO los resuelve la cascada síncrona — caen a IA. Tras refactor MCC pasará a resolver muchos de estos.

## Top 30 diffs (categoría actual → nueva)

| #   | actual       | nueva           | n   |
| --- | ------------ | --------------- | --- |
| 1   | otros        | servicios       | 303 |
| 2   | alimentacion | restaurante     | 248 |
| 3   | otros        | financiero      | 111 |
| 4   | supermercado | hogar           | 94  |
| 5   | hogar        | ropa            | 89  |
| 6   | servicios    | salud           | 72  |
| 7   | otros        | alimentacion    | 58  |
| 8   | supermercado | ropa            | 49  |
| 9   | hogar        | entretenimiento | 49  |
| 10  | restaurante  | viajes          | 44  |
| 11  | hogar        | supermercado    | 43  |
| 12  | cripto       | entretenimiento | 38  |
| 13  | servicios    | entretenimiento | 35  |
| 14  | otros        | combustible     | 34  |
| 15  | otros        | hogar           | 33  |
| 16  | otros        | salud           | 32  |
| 17  | restaurante  | supermercado    | 31  |
| 18  | combustible  | servicios       | 30  |
| 19  | farmacia     | ropa            | 30  |
| 20  | tecnologia   | supermercado    | 30  |
| 21  | servicios    | supermercado    | 28  |
| 22  | supermercado | combustible     | 27  |
| 23  | hogar        | servicios       | 26  |
| 24  | otros        | transporte      | 25  |
| 25  | servicios    | hogar           | 24  |
| 26  | supermercado | financiero      | 24  |
| 27  | financiero   | salud           | 23  |
| 28  | servicios    | alimentacion    | 22  |
| 29  | hogar        | restaurante     | 22  |
| 30  | ropa         | entretenimiento | 22  |

## Observaciones

- "otros" tiene 7 entradas en top 30 → categoría sobreutilizada históricamente, ahora migrando a categorías específicas.
- Fuente regex aporta 12,685 (≈ a lo que aporta patrones contiene). Refactor A1+A2 fusiona ambas en `patrones`.
- MCC NO aparece como fuente_nueva — porque va último en cascada y regex/patrones cubre antes. Tras reordenar MCC antes de comercio, MCC empezará a aparecer para los 23,484 sin_categoria.

## Métricas objetivo post-refactor

- % sync_ok (no sin_cat) ≥ 75% (vs 52.5% actual)
- % diff respecto pre-refactor < 5% (sin regresiones)
- Latencia P50 < 8ms
