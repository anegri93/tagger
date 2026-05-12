# Baseline test masivo v1

**Fecha:** 2026-05-04
**Batch ID:** `baseline-v1`
**Dataset:** 108.982 movimientos (49.374 comercios reales + 59.608 MANGO P2P)
**Hardware:** local dev (1 instancia API, Postgres local, concurrencia 30)

## KPIs globales

| Métrica                | Valor      |
| ---------------------- | ---------- |
| Total procesados       | 108.982    |
| Tiempo total           | 53.5s      |
| Throughput promedio    | 2038 req/s |
| Errores HTTP           | 0          |
| IA fallback disparados | 0          |

## Latencia (ms)

| min | p50 | p95 | p99 | max | avg |
| --- | --- | --- | --- | --- | --- |
| 0   | 2   | 41  | 48  | 89  | 10  |

p99 < 50ms cumple SLA holgado. p50=2ms = lookup catálogo directo en mayoría.

## Distribución por fuente_categoria

| Fuente  | Count                                       | %   |
| ------- | ------------------------------------------- | --- |
| regex   | ~60% (mayoría MANGO + AZAR + supers/farmas) |
| mcc     | ~35%                                        |
| nombre  | ~3%                                         |
| bancard | ~0.5%                                       |
| ia      | 0%                                          |

(Ejecutar `node scripts/analyze-test-batch.mjs baseline-v1` pa números exactos.)

## Cobertura

- sync_ok: 100% (cero requieren IA fallback)
- requiere_revision: ~16% (catálogo flagged por confianza <0.7 — ej. inferidos por marca)

## Agreement vs catálogo

**99.87%** (108.837 match / 145 mismatch)

Catálogo precomputado por loader masivo (P11+P12) y runtime cascada coinciden en 99.87% de casos.

## Patrones de mismatch (145 totales)

### 1. Capa `nombre` LIKE muy laxo (mayoría de mismatches)

Nombres cortos/genéricos matchean falsamente contra otros comercios:

- `CABA` → falsa transferencia (LIKE matchea con "CABALLERIA")
- `CIT`, `CM`, `COMED` → falsos matches con palabras parciales
- `CASA` → matches falsos múltiples

**Fix sugerido**: longitud mínima 5 chars pa LIKE substring + score umbral 0.7.

### 2. Capa `bancard` con seed viejo

Sucursales como `AHORRAZO-CAPIATA`, `EL CACIQUE-LUQUE`, `CIAL.VIRGEN DEL ROSA` matchean nombre_bancard del seed inicial (19 rows) y devuelven categoría que difiere de catálogo masivo.

**Fix sugerido**: drop seed viejo o priorizar catálogo masivo.

### 3. AMANDAU multi-sucursal

~15 mismatches AMANDAU. Runtime predicho varía entre alimentacion/supermercado/restaurante/otros. Catálogo dice "otros" pa varias.

**Fix sugerido**: agregar regla regex `\bAMANDAU\b → alimentacion` (heladería conocida).

### 4. Inferidos por marca no propagados

Ej. `ENERGY-FELIX BOGADO`: catálogo asignó `combustible` por inferencia marca P12, runtime devolvió `otros` porque `requiere_revision=true` en catálogo y capa catálogo skip.

**Decisión arquitectónica**: ¿propagar inferidos al runtime aceptando confianza 0.6, o seguir skip? Trade-off precisión vs cobertura.

## Próximos fixes sugeridos (P15)

- T1501: capa `nombre` LIKE más estricto (longitud + score)
- T1502: drop seed viejo `comercios.csv` que pisa catálogo masivo
- T1503: agregar reglas regex top marcas multisucursal (AMANDAU, BARATOTE, BIGGIE-DE LAS PALMERAS, etc)
- T1504: decidir política inferidos en capa catálogo (configurar threshold)

## Conclusión

Baseline excelente:

- Throughput 2038 req/s muy por encima de objetivo (~500)
- Latencia p99 48ms, holgado vs SLA <200ms
- Agreement 99.87% indica que runtime y catálogo precomputado están alineados
- Cero IA disparada: catálogo masivo cubre todo el dataset

Mejoras de P15 atacarían el 0.13% restante (145 casos) sin afectar performance.
