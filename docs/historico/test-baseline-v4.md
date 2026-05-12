# Baseline v4 — Cascada pura (bypass catálogo)

**Fecha:** 2026-05-04
**Batch ID:** `baseline-v4`
**Modo:** `bypass_catalogo=true` — runtime ignora capa catálogo, fuerza cascada (regex+nombre+mcc+ia).

## Por qué

baseline-v3 medía catálogo vs catálogo (100% tautológico). v4 mide cascada real: ¿qué tan precisa es la cascada sin la "respuesta cacheada" del catálogo?

## KPIs vs v3

| Métrica                   | v3 (catálogo) | v4 (cascada pura) | Δ            |
| ------------------------- | ------------- | ----------------- | ------------ |
| Tiempo total              | 15.2s         | **76s**           | +5x          |
| Throughput                | 9.148 req/s   | **1.434 req/s**   | -84%         |
| Latencia p50              | 1ms           | **0ms**           | igual        |
| Latencia p95              | 2ms           | **45ms**          | +22x         |
| Latencia p99              | 3ms           | **49ms**          | +16x         |
| Latencia avg              | 1ms           | **15ms**          | +14x         |
| Cobertura sync            | 100%          | **99.8%**         | -0.2pp       |
| Cae a IA fallback         | 0             | **237**           | nuevos       |
| **Agreement vs catálogo** | 100% (trampa) | **98.16%**        | métrica real |
| Mismatches                | 0             | **1.999**         | reales       |

## Lectura

**98.16% agreement real** = cascada pura coincide con catálogo precomputado en 98 de cada 100 casos. Buen número, considerando que catálogo aprovecha brand inference (P12) que la cascada runtime NO tiene acceso.

**1.999 mismatches reales** son la verdadera oportunidad de mejora. NO 145 (v2) ni 0 (v3 trampa).

## Distribución fuente con bypass

| Fuente    | Count  | %     | vs v3         |
| --------- | ------ | ----- | ------------- |
| regex     | 67.997 | 62.4% | +6.294 (+10%) |
| mcc       | 40.099 | 36.8% | -5.595 (-12%) |
| nombre    | 642    | 0.6%  | -943 (-60%)   |
| NULL (IA) | 237    | 0.2%  | +237          |
| bancard   | 7      | 0.0%  | +7            |

Sin catálogo:

- Reglas regex capturan más (COMERC/HIPER/FARMA/etc agregadas en P16)
- MCC layer hace más trabajo
- Nombre LIKE casi inactivo (estricto post-P16)
- 237 caen a IA → reciben revisión manual

## Mismatches: patrones reales

### 1. Heladerías (~50 casos)

- Runtime `regex → restaurante` (regla `HELADERIA` matchea)
- Catálogo `mcc → alimentacion` (MCC original 5499/5441)
- **Decisión correcta**: alimentacion (en PY heladería = alimento, no resto)
- **Fix**: mover HELADERIA del patron restaurante a alimentacion

### 2. "X HERMANOS" / "X COMERCIAL" (~200 casos)

- Runtime `regex → supermercado` (matchea COMERCIAL)
- Catálogo varía: hogar/restaurante/otros/combustible
- Catálogo más preciso (usó MCC real)
- **Trade-off**: si quitamos regla COMERCIAL, perdemos otros casos

### 3. Comercios no clasificados por cascada (237 IA)

- Sin catálogo, sin MCC, sin nombre matcheable, sin regex hit
- En producción real → IA Gemma corre
- Test masivo no espera IA → quedan NULL

## Conclusiones

**Cascada robusta** (98% accuracy sin catálogo) pero:

- Catálogo da +1.84pp precisión
- Catálogo da 6x throughput (lookup directo vs cascada completa)
- Catálogo da 22x mejor latencia p95

**Catálogo NO es trampa, es CACHE inteligente**. Pre-computa cascada+inferencia, runtime aprovecha.

## Próximos pasos sugeridos

1. **Mover HELADERIA** de patrón restaurante → alimentacion (gana ~50 mismatches)
2. **Investigar top 50 mismatches** uno por uno, decidir si agregar regla regex o mejorar mcc mapping
3. **Ampliar catálogo** con marcas detectadas en mismatches (poblar bancard_id+codigo de comercios sin catalogar)
4. **Aceptar 98%**: para producción real, runtime con catálogo activado da 100% determinístico — bypass es solo herramienta de validación.

## Recomendación operativa

- **Producción**: SIEMPRE con catálogo activo (default). Performance + consistencia.
- **Validación periódica**: correr v4 (bypass) cada N días pa detectar regresiones de cascada.
- **CI/CD**: test cascada-pura sobre sample 1000 con threshold agreement >97%.
