# Política de recategorización

**Fecha**: 2026-05-04
**Estado**: vigente (MVP)

## Contexto

El sistema clasifica movimientos en cascada (regex → bancard → comercio → mcc → IA).
Las fuentes de match son **mutables** durante el tiempo:

- `reglas_regex` se agregan/editan/desactivan
- `comercios_catalogo` crece con datasets nuevos
- `mcc_catalogo` y `mcc-mapping.json` se ajustan
- Correcciones de usuario revelan errores de mapeo

Pregunta abierta: cuando una de estas fuentes cambia, ¿deberían recategorizarse los movimientos previos clasificados con la versión anterior?

## Opciones consideradas

### A — Snapshot (MVP, decisión actual)
Categorización es un evento puntual. `categoria_predicha_id`, `fuente_categoria`, `confianza` y `evidencia` quedan congelados al momento de la inserción.
- Pro: predecible, auditable, simple
- Pro: el dato histórico refleja qué reglas existían en ese momento
- Contra: errores antiguos no se corrigen automáticamente

### B — Recategorización automática on-change
Trigger en cambios de reglas/comercios/mcc dispara reproceso de movimientos.
- Pro: dataset siempre coherente con reglas vigentes
- Contra: caro (recorre todos los movimientos)
- Contra: rompe auditoría (`evidencia` ya no refleja la regla original)
- Contra: impredecible para el usuario (un fix de regla cambia historial)

### C — Recategorización manual (job dedicado)
CLI/endpoint admin que recorre movimientos y recategoriza con dry-run.
- Pro: control explícito, dry-run previo
- Pro: snapshot por defecto + escape hatch cuando se necesita
- Contra: requiere disciplina operativa

## Decisión

**Snapshot por defecto** (Opción A). Sin recategorización automática.

`evidencia` jsonb queda como prueba de "qué se sabía cuando se categorizó".

## Implicancias

- Cambios en reglas/comercios/mcc afectan **solo** movimientos nuevos.
- Correcciones de usuario (`correcciones_usuario`) afectan **solo** ese movimiento; quedan registradas para análisis.
- Si en el futuro se quiere reprocesar masivamente, está prevista la tarea **TPH01** (`scripts/recategorizar.ts`) en la fase PNH (post-MVP) con dry-run obligatorio.

## Triggers para reabrir esta decisión

- Volumen de correcciones manuales > 10% de los movimientos.
- Cambio de regla con impacto > 1000 movimientos previos (revisar caso a caso).
- Modelo IA mejorado (V2/V3) que podría reclasificar mejor el histórico.
