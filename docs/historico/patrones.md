# Capa Patrones (P21)

Capa unificada de matching texto→categoría, aditiva sobre las capas legacy
(`reglas_regex`, `comercios_catalogo`, `marcas_conocidas`).

## Tabla `patrones`

| columna      | tipo                        | nota                                            |
| ------------ | --------------------------- | ----------------------------------------------- |
| id           | uuid PK                     |                                                 |
| tipo         | enum                        | `regex` \| `literal` \| `prefijo` \| `contiene` |
| valor        | text                        | patrón crudo (regex sin flags, o substring)     |
| categoria_id | uuid FK                     | ON DELETE RESTRICT                              |
| prioridad    | int                         | menor = primero, default 100                    |
| activo       | bool                        | default true                                    |
| fuente       | enum                        | `manual` \| `catalogo_bancard` \| `auto`        |
| descripcion  | text?                       |                                                 |
| UNIQUE       | (tipo, valor, categoria_id) | evita duplicados                                |
| INDEX        | (activo, prioridad)         | acelera loader                                  |

## Pipeline

Orden vigente (P22):

```
catalogo → patrones → regex → bancard → comercio → mcc → ia
```

Vista lógica en prod (input real = `nombre + monto`, sin `bancardId`):

```
patrones → regex → comercio → mcc → ia
```

`catalogo` y `bancard` quedan **dormidas**: hacen early-return null si falta
`bancardId` / `nombreBancard`. Cero costo runtime; activas para test masivo.

`patrones` corre **antes** que regex/comercio: las reglas declarativas del
usuario dominan capas legacy. Si la tabla está vacía → loader devuelve `[]`
→ cero impacto sobre resultados existentes.

## Filtro capa `comercio` (P22)

`comercios_catalogo` es **data para afinar**, no fuente de verdad. La capa
solo propaga `fuentePrev` cacheada cuando es declarativa:

| `fuentePrev` cacheada                    | Acción                                    |
| ---------------------------------------- | ----------------------------------------- |
| `regex`, `manual`, `patrones`, `bancard` | propagar (categoría + confianza original) |
| `mcc`, `ia`, `nombre`                    | descartar → null, sigue cascada           |
| `null` (entries legacy)                  | cae a `fuente=nombre, conf=0.8`           |

Match parcial (no exacto) nunca propaga cache: usa lookup propio
con `fuente=nombre, conf=0.8`.

NOTA: el loader masivo sigue escribiendo `comercios_catalogo` con cualquier
fuente. El filtro es al **leer** en runtime, no al escribir.

## Matching

Texto pasa por `normalize()` (mayúsculas, sin diacríticos, sin puntuación,
puntos antes de palabra → espacio).

Loop por prioridad ASC; primer match gana:

| tipo       | match                                                          |
| ---------- | -------------------------------------------------------------- |
| `regex`    | `new RegExp(valor, 'i').test(texto)` (regex inválida ignorada) |
| `literal`  | `texto === normalize(valor)`                                   |
| `prefijo`  | `texto.startsWith(normalize(valor))`                           |
| `contiene` | `texto.includes(normalize(valor))`                             |

Resultado: `fuente` refleja el `tipo` del patrón. Confianza por tipo:

| tipo       | fuente     | confianza |
| ---------- | ---------- | --------- |
| `regex`    | `regex`    | 0.95      |
| `literal`  | `literal`  | 0.95      |
| `prefijo`  | `prefijo`  | 0.9       |
| `contiene` | `contiene` | 0.9       |

```ts
{
  categoriaId,
  confianza,                 // según tipo
  fuente: p.tipo,            // regex | literal | prefijo | contiene
  evidencia: { regla_id, patron }
}
```

NOTA: el valor `'patrones'` queda en el enum `fuente_categoria` por
compatibilidad con movimientos ya escritos antes de P24. No se usa en
runtime nuevo.

Cache TTL 60s. `capa.invalidar()` se invoca tras POST/PATCH/DELETE de
`/patrones` para forzar recarga.

## API

| verbo  | ruta                                 | body                                                             |
| ------ | ------------------------------------ | ---------------------------------------------------------------- |
| GET    | `/patrones?categoria=&tipo=&activo=` | —                                                                |
| GET    | `/patrones/:id`                      | —                                                                |
| POST   | `/patrones`                          | `{ tipo, valor, categoria_slug, prioridad?, descripcion? }`      |
| PATCH  | `/patrones/:id`                      | `{ valor?, prioridad?, activo?, descripcion?, categoria_slug? }` |
| DELETE | `/patrones/:id`                      | —                                                                |
| POST   | `/patrones/test`                     | `{ tipo, valor, texto } → { match }`                             |

Códigos:

- 400 input inválido / categoría inexistente
- 404 id no existe
- 409 violación UNIQUE (tipo+valor+categoria duplicado)
- 422 regex inválida

## UI

Pestaña **Patrones** en `/ui/categorias/detalle.html?slug=…`:

- alta con `tipo`, `valor`, `prioridad`, `descripcion`
- probador `tipo+valor` vs `texto`
- toggle activo / eliminar inline

## Migración reglas_regex → patrones (P23)

Script aditivo. Copia reglas activas a `patrones` con `tipo='regex'`,
`fuente='manual'`. UNIQUE `(tipo, valor, categoria_id)` + `ON CONFLICT DO NOTHING`
hacen el script idempotente.

Ejecutar:

```bash
pnpm migrar:reglas-a-patrones
```

Reporta `{ total, insertadas, skip }`. Re-correr es seguro: skip cuenta
duplicados.

Validación (DB local, P23 ejecutado el 2026-05-05):

|                                                   | count |
| ------------------------------------------------- | ----- |
| `reglas_regex WHERE activo=true`                  | 42    |
| `patrones WHERE tipo='regex' AND fuente='manual'` | 42    |

Comportamiento runtime tras migración:

- Capa `patrones` corre antes que `regex` (P22) y matchea primero
- Resultado: misma categoría, `fuente='patrones'` en vez de `'regex'`
- Capa `regex` legacy sigue activa como red de seguridad

Próximo paso opcional (no incluido en P23): desactivar capa `regex` del
pipeline tras período de coexistencia.

## Migración futura (Fase 4, opcional)

Cuando los patrones reemplacen totalmente a las capas legacy:

1. Script: copiar `reglas_regex` → `patrones` (tipo=`regex`)
2. Script: copiar `marcas_conocidas` → `patrones` (tipo=`contiene`)
3. Script: copiar `comercios_catalogo.nombre` → `patrones` (tipo=`literal`)
4. Quitar capas legacy del pipeline
5. Deprecate tablas
