# Plan refactor pipeline categorización

**Estado global**: 🟡 EN PROGRESO
**Inicio**: 2026-05-11
**Última actualización**: 2026-05-11

## Objetivo

Pipeline final simple, mantenible, sin duplicaciones. Goal:
```
catalogo → patrones → MCC → [comercio] → IA
```
(la `comercio` se decide en Fase B con datos).

## Convenciones

- Cada tarea tiene: detalle, validación, resultado esperado, estado.
- Estados: `[ ]` pendiente, `[~]` en progreso, `[x]` completa, `[!]` bloqueada.
- 3 gates obligatorios al final de cada tarea con cambios de código: **consistencia → lint → test**.
- Commits atómicos por tarea.

---

## Pre-Fase: Baseline

### PRE-1 Recategorizar catálogo con pipeline actual

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: 49,444 procesados en 21s. Match 47.9%, diff 4.6%, sin_cat 47.5%. Ver `docs/baseline-pre-refactor.md`.

**Detalle**:
- Ejecutar `/ui/recat` Run sobre 49,374 comercios (pipeline actual: catalogo→patrones→regex→bancard→comercio→mcc→IA).

**Validación**:
- Run termina sin errores.
- `recategorizado_at` poblado en todos los comercios.

**Resultado esperado**:
- Snapshot inicial guardado en `docs/baseline-pre-refactor.md`.
- Métricas capturadas:
  - % sync_ok
  - % requiere_revision
  - % sin_categoria
  - Distribución por fuente
  - Top 20 diffs

---

## Fase A — Cambios seguros

### A1 Migrar reglas_regex → patrones

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: análisis reveló que 4/5 reglas legacy eran inferiores/equivalentes a patrones existentes. La 5ª (gastro con CAFE|PIZZA) se merged al regex de restaurante existente: ahora `\b(PANADERIA|HELADERIA|CONFITERIA|RESTAURANT|PIZZERIA|HAMBURG|PARRILLA|LOMITERIA|CAFE|PIZZA)\b`. Tabla `reglas_regex` queda obsoleta (39 entries, todas con equivalente en patrones). Script: `scripts/migrar-reglas-restantes.ts`.

**Detalle**:
- Crear `scripts/migrar-reglas-restantes.ts`.
- Leer reglas en `reglas_regex` cuya `patron` NO existe en `patrones tipo=regex`.
- Insertar en `patrones` con `tipo='regex'`, `fuente='migrado'`, descripción origen.

**Validación**:
- Antes: count(reglas_regex no en patrones) = 5.
- Después: 5 patrones nuevos con `fuente='migrado'`.

**Resultado esperado**:
- 0 reglas en `reglas_regex` sin equivalente en `patrones`.
- 3 gates verdes.

### A2 Eliminar capa `regex` del pipeline

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: capa `regex` removida de `CapasSincrono` y de `ejecutarCascada()`. `main.ts` ya no inyecta `crearCapaRegex`. Tests pipeline + e2e migrados a usar capa `patrones` (regex queda como `tipo='regex'` dentro de patrones). Archivo `src/layers/regex.ts` se mantiene porque scripts offline (`cascada-catalogo.ts`, `comercios-bancard-masivo.ts`) lo usan; runtime no. Route `/reglas` mantenida para compat UI legacy (writer noop invalidación). 3 gates verdes (288 tests pass).

**Detalle**:
- `src/pipeline/categorizar.ts`: quitar `capas.regex` del orden cascada.
- `src/layers/regex.ts`: eliminar.
- `src/api/routes/reglas.ts`: deprecar (410 Gone) o redirigir a `/patrones`.
- `src/main.ts`: quitar inyección capa.
- Limpiar tipos `CapasSincrono`.

**Validación**:
- Tests pipeline pasan.
- POST `/categorizar-movimiento` con `{nombre:"SLOTS DEL SOL"}` → categoria=azar (vía patrones).

**Resultado esperado**:
- Pipeline 6 capas: catalogo→patrones→bancard→comercio→mcc→IA.
- 3 gates verdes.

### A3 Verificar redundancia bancard vs catalogo

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: capa `bancard` solo resolvió 5 movimientos de ~85k históricos (0.006%). 0 comercios en catálogo con fuente='bancard'. **Decisión: eliminar capa bancard** (cubierta por catalogo + comercio fuzzy). Ver `docs/diff-bancard-catalogo.md`.

**Detalle**:
- Crear `scripts/diff-bancard-catalogo.ts`.
- Comparar tabla `bancard_lookup` (o equivalente) vs `comercios_catalogo` por (bancard_id, codigo).
- Listar registros en bancard que no estén en catalogo y viceversa.

**Validación**:
- Salida diff numérica.

**Resultado esperado**:
- Decisión binaria: eliminar capa bancard sí/no.
- Reporte en `docs/diff-bancard-catalogo.md`.

### A4 Eliminar capa `bancard` (si A3 confirma redundancia)

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: capa `bancard` removida de `CapasSincrono`, `ejecutarCascada()`, `main.ts` (incluye `crearBancardLookup` import). Tests pipeline + e2e + categorizar route migrados. Archivo `src/layers/bancard.ts` y `crearBancardLookup` se mantienen disponibles para offline tools si lo necesitan, no se usan en runtime. 3 gates verdes (287 tests pass).

**Detalle**:
- Quitar `capas.bancard` de `categorizar.ts`.
- Eliminar `src/layers/bancard.ts`, repo, ruta si existe.
- Migration DROP TABLE bancard_* si confirmado.
- Limpiar `main.ts`.

**Validación**:
- Caso prod `{nombre, mcc}` sin bancard_id no falla.
- Caso con bancard_id → catalogo cubre.

**Resultado esperado**:
- Pipeline 5 capas.
- 3 gates verdes.

### A5 Reordenar MCC antes de comercio

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: en `ejecutarCascada()`, `mcc` ahora se evalúa antes que `comercio`. Pipeline actual: catalogo → patrones → MCC → comercio → IA. Test nuevo añadido: "patrones falla, mcc acierta antes que comercio". 3 gates verdes (288 tests).

**Detalle**:
- En `categorizar.ts` mover capa MCC arriba de comercio.

**Validación**:
- Test caso: `{nombre:"GENERIC X", mcc:"5411"}` → supermercado vía MCC.
- Test caso: `{nombre:"GENERIC X", mcc:null}` → cae a comercio fuzzy.

**Resultado esperado**:
- Cuando MCC válido, decide antes que fuzzy.
- 3 gates verdes.

### A6 Early-skip null IDs

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: `crearCapaCatalogo.evaluar()` ahora retorna null sin query DB cuando `bancardId` o `codigoComercio` son null/undefined. Producción real (input solo nombre+mcc) ahorra 1 query DB por request. 3 gates verdes.

**Detalle**:
- Capa `catalogo.evaluar`: si ambos IDs null/undefined → return null sin query DB.
- Idem capa bancard si todavía existe.

**Validación**:
- Test: request con solo `{nombre, mcc}` no genera query catalogo.
- Latencia P50 medida antes vs después.

**Resultado esperado**:
- -1 a -3ms latencia P50.
- 3 gates verdes.

### A7 Recategorizar 49k post-Fase A

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: match 47.9% → 48.8% (+1.9%). Diff 4.6% → 3.7% (−20%). Sin_cat estable 47.5%. Cero regresiones. Ver `docs/baseline-post-faseA.md`. Pendiente A8: investigar por qué MCC no aparece en fuente_nueva (recat catálogo no pasa MCC a cascada).

**Detalle**:
- `/ui/recat` Run con pipeline nuevo.
- Comparar métricas vs PRE-1.

**Validación**:
- % sync_ok ≥ baseline (no degradación).
- Distribución fuente: regex desaparece, todo a patrones.
- 0 errores.

**Resultado esperado**:
- `docs/baseline-post-faseA.md`.
- Diff capturado.

### A8 Revisar regresiones top diffs

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: encontrado bug en recat — no pasaba MCC a cascada. Fix aplicado: `recategorizarCatalogo()` ahora pasa `mcc_original` desde `comercios_catalogo`. Post-fix: match sube de 47.9% → **73.9%** (+26%), sin_cat baja de 47.5% → **20.9%** (-26.6%). Capa MCC ahora actúa con 13,129 hits. 0 regresiones netas. Top diffs siguen siendo mejoras (alimentacion→restaurante 390 por nuevo regex CAFE|PIZZA).

**Detalle**:
- Top 30 categorías que cambiaron — auditar caso por caso.

**Validación**:
- Cada cambio justificable.
- Regresiones → ajustar patrones o excepciones.

**Resultado esperado**:
- 0 regresiones netas.
- Reporte aprobado.

### A9 Commit Fase A

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: commit `2364de0` en main. 21 archivos, +1147 / −74. Fase A cerrada.

**Detalle**:
- Commit atómico con mensaje describiendo refactor.

**Validación**:
- 3 gates verdes.

**Resultado esperado**:
- Branch limpia, Fase A cerrada.

---

## Fase B — Decisión sobre capa `comercio`

### B1 Métricas exclusividad capa comercio

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: capa comercio aporta 0 hits en último recat (MCC y patrones cubren todo antes). Histórico catálogo: 491 (1.0%) fuente='nombre'. Movimientos: 6 (0.007%). **Decisión: ELIMINAR capa comercio**. Cero pérdida en flujo runtime con MCC presente. Script: `scripts/medir-aporte-comercio.ts`.

**Detalle**:
- Crear `scripts/medir-aporte-comercio.ts`.
- Contar comercios con `fuente_categoria='nombre'`.
- Simular sin capa: cuántos quedarían sin categorizar (cae IA o sin_cat).

**Validación**:
- Número absoluto + %.

**Resultado esperado**:
- Decisión:
  - <3% → eliminar.
  - 3-5% → mantener con prio baja o flag.
  - \>5% → mantener.

### B2 Si eliminar: quitar capa comercio

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: capa `comercio` removida de `CapasSincrono` + `ejecutarCascada()` + `main.ts`. Opción `bypassComercio` eliminada (era usada solo por recat catálogo, ya no aplica). Tests pipeline/e2e/categorizar route limpiados. Pipeline final 3 capas: catalogo → patrones → MCC (+ IA fallback async). 285 tests pass. 3 gates verdes.

**Detalle**:
- `categorizar.ts` quitar capa.
- `src/layers/comercio.ts` eliminar.
- Tabla `comercios_catalogo` se mantiene (es memoria principal).

**Validación**:
- Tests pipeline pasan.
- Casos que dependían fuzzy ahora caen a IA → verificar IA los maneja.

**Resultado esperado**:
- Pipeline final 4 capas: catalogo→patrones→MCC→IA.
- 3 gates verdes.

### B3 Recategorizar 49k post-Fase B

**Estado**: `[x]` (completada 2026-05-11)
**Resultado**: identico a post-A (match 73.9%, sin_cat 20.9%). Confirma B1: capa comercio aportaba 0. Eliminación sin pérdida. Ver `docs/baseline-final.md`.

**Detalle**:
- `/ui/recat` Run con pipeline final.

**Validación**:
- % sync_ok ≥ post-A.
- IA toma comercios que antes resolvía fuzzy.

**Resultado esperado**:
- `docs/baseline-final.md`.
- Decisión: aceptar o rollback.

### B4 Commit Fase B

**Estado**: `[~]`

**Detalle**:
- Commit atómico.

**Validación**:
- 3 gates.

**Resultado esperado**:
- Pipeline final estable.

---

## Resultado esperado completo

**Pipeline final** (4-5 capas según B):
```
catalogo → patrones → MCC → [comercio] → IA
```

**Tablas eliminadas/deprecadas**:
- `reglas_regex`
- tabla bancard (si A3)
- capa `comercio` (si B1)

**Métricas objetivo**:
- % sync_ok ≥ 95%
- % requiere_revision ≤ 5%
- Latencia P50 < 8ms (sin IA)
- 0 regresiones vs baseline pre-refactor

**Mantenibilidad**:
- 1 fuente reglas humanas (`patrones`)
- 1 fuente MCC (`mcc_catalogo` sync TuFi)
- 1 fuente memoria (`comercios_catalogo`)
- Pipeline 4-5 capas en lugar de 7

---

## Bitácora

(actualizar acá decisiones, blockers, hallazgos)

- 2026-05-11: Plan creado.
