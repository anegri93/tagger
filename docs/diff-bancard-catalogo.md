# Diff capa bancard vs catalogo

**Fecha**: 2026-05-11

## Hallazgo arquitectónico

NO existe tabla `bancard` separada. Las 3 capas leen todas de `comercios_catalogo`:

| Capa | Query | Clave |
|---|---|---|
| catalogo | `WHERE bancard_id=? AND codigo_comercio=?` | IDs estructurados |
| bancard | `WHERE nombre_bancard=?` | Nombre exacto |
| comercio | `WHERE nombre_normalizado LIKE %?%` | Fuzzy |

Las 3 son strategies distintas sobre la misma tabla.

## Datos

**Catálogo**: 0 comercios con `fuente_categoria='bancard'`.

**Movimientos históricos** (~85k):

| Fuente | Count | % |
|---|---|---|
| regex | 69,214 | 81.4% |
| contiene | 16,341 | 19.2% |
| manual | 18 | 0.02% |
| nombre (comercio fuzzy) | 6 | 0.007% |
| **bancard** | **5** | **0.006%** |

## Decisión

**Eliminar capa bancard** del pipeline.

**Razón**: aporta prácticamente cero hits. Cuando hay match exacto por nombre y no por IDs, la capa `comercio` (fuzzy) lo cubre porque match exacto es subset de fuzzy match.

**Próximo paso**: A4 — eliminar capa `bancard.ts` + repo `crearBancardLookup` + import de cascada.
