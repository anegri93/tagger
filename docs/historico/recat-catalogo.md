# Recategorización masiva del catálogo (P25)

Pasa cada fila de `comercios_catalogo` por el pipeline actual usando `nombre`
como descripción y guarda la categoría predicha en columnas espejo. Permite
comparar qué categorizaría hoy el sistema vs qué tiene almacenado.

## Columnas nuevas en `comercios_catalogo`

| columna              | tipo                  | nota                                     |
| -------------------- | --------------------- | ---------------------------------------- |
| `categoria_nueva_id` | uuid? FK → categorias | null si pipeline no resuelve             |
| `fuente_nueva`       | enum fuente_categoria | regex/literal/prefijo/contiene/mcc/...   |
| `confianza_nueva`    | numeric(3,2)          | confianza retornada por la capa ganadora |
| `recategorizado_at`  | timestamptz           | marca temporal del último run            |

Migración: `0008_fixed_shinko_yamashiro.sql`.

## Pipeline durante recategorización

`ejecutarCascada` se invoca con flags:

```ts
{ bypassCatalogo: true, bypassComercio: true }
```

- `bypassCatalogo`: skip lookup por `bancardId` (no aplicable aquí, solo nombre).
- `bypassComercio`: **clave**. Sin esto, capa comercio busca el mismo nombre
  en `comercios_catalogo`, encuentra la fila que estamos procesando, devuelve
  su categoría actual → resultado siempre = categoría almacenada → comparación
  inútil.

Capa IA queda **fuera**. Recategorización es síncrona y no debe tardar
horas/costar tokens. IA es fallback async aparte.

Pipeline efectivo en este flujo:

```
patrones → regex → bancard (skip si no input) → mcc → null
```

Cualquier fila que el pipeline no resuelva queda con `categoria_nueva_id=null`.

## API

| verbo | ruta                                  | acción                                                   |
| ----- | ------------------------------------- | -------------------------------------------------------- |
| POST  | `/catalogo/recategorizar`             | dispara run async, devuelve `{ run_id }` 202             |
| GET   | `/catalogo/recategorizar/status`      | estado del último run, progreso, stats                   |
| GET   | `/catalogo/recategorizar/comparacion` | totales + top 30 diffs (actual→nueva) + pivot por fuente |

POST mientras hay un run corriendo → 409 `{ error: 'run_en_progreso' }`.

Estado in-memory single-process. Si el servidor se reinicia mid-run, el
flag se pierde pero la DB queda consistente (cada update es atómico por fila).

## UI

`/ui/recat/index.html`. Accesible desde nav (icono 🔁 "Recat").

Acciones:

- **▶ Correr recategorización**: dispara run, polling cada 2s a `/status`.
- **↻ Refrescar comparación**: re-lee `/comparacion` sin re-correr.

Vistas:

- Estado run (estado, IDs, progreso, conteos)
- Totales de comparación
- Top 30 pares `(categoria_actual, categoria_nueva)` con más diffs
- Distribución por `fuente_nueva`

## Flujo iterativo

1. Crear/ajustar patrones en `/ui/categorias/detalle.html?slug=...` pestaña Patrones
2. Ir a `/ui/recat/`, correr recat
3. Revisar tabla "top diffs". Si una transición tiene sentido (ej: `otros → ropa`
   por patrón JOYERIA nuevo) → aplicar manualmente o crear un endpoint para
   "aplicar diffs" en futuro
4. Iterar

## No incluido (decisiones)

- **Aplicar diffs masivos**: no implementado en P25. Las nuevas categorías se
  guardan para inspección, no se promueven a `categoria_id`. Aplicar requiere
  decisión humana.
- **Persistencia del run history**: solo el run actual queda en memoria. Si
  necesitás historial, agregar tabla `recat_runs` en futuro.
- **Cancelar run en curso**: no implementado.
