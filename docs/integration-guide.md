# Guía integración — Mobile / Backend Mango

Cómo consumir el servicio tagger desde la app mobile o backend.

---

## Auth

Header obligatorio en todos los requests (salvo `/health*`):

```
x-api-key: <API_KEY>
```

Si el header falta o no coincide → `401 unauthorized`.

API_KEY mínimo 16 chars. Rotarla → reiniciar contenedor con nueva env.

---

## Endpoint principal: categorizar un movimiento

```
POST /categorizar-movimiento
Content-Type: application/json
x-api-key: <API_KEY>
```

### Request body

Al menos uno de los siguientes campos requerido:

- `descripcion` (string, 1-500) — texto del movimiento (recomendado)
- `nombre_comercio` (string, 1-200) — alias de descripcion
- `nombre_bancard` (string, 1-200) — alias legacy
- `mcc` (string, 2-4 digits)

Opcionales:

- `bancard_id` (string) — habilita lookup directo en `comercios_catalogo` (más rápido + 100% precisión)
- `codigo_comercio` (string) — junto con `bancard_id`
- `monto` (number) — solo persistido, no afecta categorización
- `origen` (string) — etiqueta libre (`mobile`, `import`, etc.) para analytics
- `batch_id` (string) — agrupar requests
- `bypass_catalogo` (bool) — testing: salta capa 1, fuerza cascada pura

### Response (200 OK)

```json
{
  "movimiento_id": "uuid",
  "categoria_id": "uuid | null",
  "fuente": "regex | literal | contiene | prefijo | mcc | ia | manual | bancard | nombre | patrones | null",
  "confianza": 0.95,
  "requiere_revision": false
}
```

**Campos a leer en UI:**

- `categoria_id === null` + `requiere_revision === true` → cascada agotada, IA fallback corriendo async. Re-fetchear `/movimientos/:id` después.
- `confianza < 0.7` → mostrar UI sugerencia "¿es correcto?" en mobile.
- `fuente === 'ia'` → categoría tentativa, conviene mostrar "verificar" badge.

### Ejemplos

```bash
# Caso ideal: cliente envía descripcion + bancard_id + mcc
curl -X POST http://api.tagger.internal/categorizar-movimiento \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "descripcion": "BURGER KING SHOPPING DEL SOL",
    "bancard_id": "12345",
    "codigo_comercio": "999",
    "mcc": "5812",
    "monto": 45000,
    "origen": "mobile"
  }'

# Caso minimal: solo descripción
curl -X POST http://api.tagger.internal/categorizar-movimiento \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"descripcion":"PETROBRAS RUTA 2"}'
```

---

## Polling para IA fallback

Cuando response inmediato es `categoria_id: null` + `requiere_revision: true`, el servicio está procesando con Ollama en background. Cliente debe:

1. Mostrar UI "categorizando..." con `movimiento_id`
2. Poll `GET /movimientos/:id` cada 2-3s, max 15s
3. Cuando `categoria_id !== null` o `fuente === 'ia'` → render
4. Timeout 15s → mostrar "sin categorizar" + opción manual

```bash
GET /movimientos/:movimiento_id
```

Response:

```json
{
  "id": "uuid",
  "descripcion": "...",
  "categoria_id": "uuid | null",
  "categoria_slug": "transporte | null",
  "fuente_categoria": "ia | ...",
  "confianza": 0.7,
  "requiere_revision": false,
  "evidencia": { ... }
}
```

---

## Gasto manual con categoría predefinida

Cuando el usuario carga un gasto manualmente en la app y ya elige categoría desde el dropdown (no espera que el sistema adivine), pasá `categoria_id` directo. El backend salta la cascada y guarda el mov con esa cat como `fuente='manual'` `confianza=1`.

```
POST /categorizar-movimiento
Content-Type: application/json
x-api-key: <API_KEY>

{
  "nombre_bancard": "ALMACEN DON JUAN",
  "monto": 35000,
  "origen": "user123",
  "categoria_id": "<uuid-de-supermercado>",
  "aprender": true
}
```

Campos relevantes:

- `categoria_id` (UUID, opcional) — si está presente, saltea pipeline. Cat manual.
- `aprender` (boolean, opcional, default `false`):
  - `true` + `origen` presente: además del mov, crea regla user-scope con prio 1. Próximos movs con el mismo nombre van a esta categoría automático.
  - `false`: sólo este movimiento.

Sin `categoria_id`: la cascada normal corre (regex → mcc → ia).

Use cases:
- Gasto en efectivo cargado a mano: el user sabe qué fue, elige cat al cargar
- Importación de gastos viejos: cliente ya tiene la categoría, no quiere re-categorizar
- Override puntual: cliente desconfía del pipeline para ese mov específico

---

## Correcciones del usuario

Cuando usuario corrige una categoría desde mobile:

```
POST /movimientos/:movimiento_id/correccion
Content-Type: application/json
x-api-key: <API_KEY>

{
  "categoria_id_nueva": "uuid-de-la-categoria-correcta",
  "motivo": "era taxi",
  "usuario": "user123",
  "aprender": true
}
```

Campos:

- `categoria_id_nueva` (UUID, **required**) — id de la categoría correcta.
- `motivo` (string, opcional, max 500) — feedback opcional.
- `usuario` (string, opcional, max 120) — id del usuario que corrige. Determina el scope de la regla aprendida.
- `aprender` (boolean, opcional, default `true`):
  - `true` (default): crea/actualiza regla user-scope con prioridad 1. Próximos movs del mismo nombre devuelven la categoría corregida automáticamente (capa 0 del pipeline).
  - `false`: **excepción puntual**. Sólo modifica este movimiento. No contamina la memoria del usuario. Útil cuando el comercio en general tiene categoría correcta pero este mov específico es distinto.

Mobile flow: tras `GET /categorias`, mapear slug elegido por usuario → `id` para enviar.

Efecto:

- `categoria_confirmada_id` actualizado en `movimientos`
- `fuente_categoria = 'manual'`, `requiere_revision = false`
- Registro en `correcciones_usuario` (audit, siempre)
- Si `aprender=true` + tiene usuario: upsert en `reglas` con `scope='usuario:<X>' tipo='literal' origen='correccion' prioridad=1`

Response `200 OK`:

```json
{
  "correccion_id": "uuid",
  "categoria_anterior_id": "uuid | null",
  "categoria_anterior": { "id": "uuid", "slug": "...", "nombre": "..." },
  "categoria_nueva_id": "uuid",
  "categoria_nueva": { "id": "uuid", "slug": "...", "nombre": "..." }
}
```

### Caso de uso: excepción puntual (`aprender: false`)

Estación de servicio "ESSO RUTA 1" — la mayoría de tus movs ahí son combustible. Pero hoy sólo bajaste a comprar algo del shop. Querés que ESE mov sea Supermercado, no Combustible, **sin** que próximos movs del mismo lugar cambien:

```json
{
  "categoria_id_nueva": "<uuid-supermercado>",
  "usuario": "user123",
  "aprender": false
}
```

Resultado:
- El movimiento pasa a Supermercado.
- No se crea regla user-scope.
- Próxima vez "ESSO RUTA 1" sigue cayendo en Combustible (regla global o MCC habitual).
- El audit cross-user (sugerencias-globales) sigue captando que existió esta corrección.

---

## Reprocesar movimiento existente

Cuando un movimiento quedó sin categoría (ej. IA falló al momento del POST inicial) o querés volver a evaluarlo tras agregar patrones nuevos:

```
POST /movimientos/:movimiento_id/reprocesar
Content-Type: application/json
x-api-key: <API_KEY>

{}                              // body vacío, o:
{"bypass_catalogo": true}       // opcional, testing
```

Comportamiento:

- Lee campos del movimiento (descripcion, mcc, bancard_id, etc.)
- Ejecuta cascada igual que `POST /categorizar-movimiento`
- Actualiza prediccion + evidencia
- Si cascada agotada → dispara IA async (mismo polling que original)

Response `200 OK`:

```json
{
  "movimiento_id": "uuid",
  "categoria_id": "uuid | null",
  "categoria": { "id": "...", "slug": "...", "nombre": "..." } | null,
  "fuente": "regex | contiene | ... | null",
  "confianza": 0.95,
  "requiere_revision": false,
  "ia_disparada": true
}
```

**`ia_disparada: true`** → cliente debe poll `GET /movimientos/:id` para ver categoría final (mismo flow que IA fallback inicial).

---

## Listar categorías disponibles

Para poblar dropdown UI:

```
GET /categorias
x-api-key: <API_KEY>
```

Response:

```json
{
  "items": [
    {"slug":"transporte","nombre":"Transporte","descripcion":"...","activo":true},
    ...
  ]
}
```

35 categorías por defecto. Cachear en cliente (cambian raro).

---

## Códigos error

| Código | Significado                                  | Retry                   |
| ------ | -------------------------------------------- | ----------------------- |
| `200`  | OK                                           | —                       |
| `400`  | Validación falló (`{error, issues}`)         | NO — fix request        |
| `401`  | API key inválida                             | NO — fix config         |
| `404`  | Movimiento no existe                         | NO                      |
| `409`  | Estado en conflicto (ej. import en progreso) | Esperar + reintentar    |
| `500`  | Error interno                                | Sí, exponential backoff |
| `503`  | DB/Ollama down                               | Sí, exponential backoff |

### Retry strategy sugerida

```ts
async function categorizar(input: CategorizarRequest, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const r = await fetch('/categorizar-movimiento', { ... });
    if (r.ok) return r.json();
    if (r.status >= 400 && r.status < 500 && r.status !== 408) throw new Error(...);
    await sleep(2 ** i * 1000);  // 1s, 2s, 4s
  }
  throw new Error('max retries');
}
```

---

## TypeScript types

Copiar a mobile (o regenerar con OpenAPI cuando esté disponible):

```ts
export interface CategorizarRequest {
  descripcion?: string;
  nombre_comercio?: string;
  nombre_bancard?: string;
  mcc?: string; // 2-4 dígitos
  bancard_id?: string;
  codigo_comercio?: string;
  monto?: number;
  origen?: string; // id del usuario; necesario para memoria y aprender
  batch_id?: string;
  bypass_catalogo?: boolean;
  // Modo manual: usuario ya eligió cat al cargar el gasto en la app.
  // Si está presente, se SALTEA la cascada y se guarda con fuente='manual', conf=1.
  categoria_id?: string;
  // Sólo aplica si hay categoria_id + origen. Si true, guarda regla user-scope
  // para que próximos movs con el mismo nombre devuelvan esta cat automático.
  aprender?: boolean;
}

export type Fuente =
  // Pipeline actual
  | 'regex'
  | 'literal'
  | 'contiene'
  | 'prefijo'
  | 'mcc'
  | 'ia'
  | 'manual'
  // Legacy (movimientos antiguos en DB)
  | 'bancard'
  | 'nombre'
  | 'patrones';

export interface CategorizarResponse {
  movimiento_id: string;
  categoria_id: string | null;
  fuente: Fuente | null;
  confianza: number | null; // 0 a 1
  requiere_revision: boolean;
}

export interface CorreccionRequest {
  categoria_id_nueva: string; // UUID
  motivo?: string;
  usuario?: string; // id del usuario; determina scope de la regla aprendida
  aprender?: boolean; // default true. false = excepción puntual, no crea regla
}

export interface ReprocesarRequest {
  bypass_catalogo?: boolean;
}

export interface ReprocesarResponse extends CategorizarResponse {
  categoria: { id: string; slug: string; nombre: string } | null;
  ia_disparada: boolean;
}

export interface CorreccionResponse {
  ok: boolean;
  correccion_id?: string;
  categoria_anterior_id: string | null;
  categoria_anterior: string | null;
  categoria_nueva_id: string;
  categoria_nueva: string;
}

export interface Categoria {
  slug: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}
```

---

## UX recomendaciones mobile

### Flujo categorización

1. Submit movimiento → response inmediato
2. Si `confianza >= 0.7` → render categoría con icon
3. Si `confianza < 0.7` o `categoria_id === null` → badge "Verificar" + tap → modal de corrección
4. Si `categoria_id === null` y `requiere_revision === true` → poll `/movimientos/:id`

### Trust signals

- Fuente `manual` (confianza 1.0) → no mostrar "verificar"
- Fuente `regex` / `literal` (0.95) → muy alta confianza
- Fuente `contiene` / `prefijo` (0.90) → alta confianza
- Fuente `mcc` (0.75) → mostrar badge "auto-detectado"
- Fuente `ia` (cap 0.70) → mostrar "sugerencia IA"

### Performance

- Llamada típica: 5-50ms (cascada sync)
- Con IA fallback: 1-5s (async, requiere polling)
- Batch import: usar `/movimientos/importar` (200k rows max, chunked async)

---

## Bulk operations (offline / batch)

Si necesitan importar historial:

```
POST /movimientos/importar
{
  "rows": [{"nombre":"...","mcc":"5812","monto":45000}, ...],
  "batch_id": "historico-2024"
}
# → {"import_id":"imp_...", "batch_id":"..."}

# Poll
GET /movimientos/importar/status
```

Max 200.000 rows por request. Procesamiento async.

---

## Health checks

```
GET /health           → {"status":"ok"}                 (sin auth)
GET /health/ready     → {"status,db,ollama}            (sin auth)
```

Usar `/health/ready` para readiness probe en k8s/orquestador.
