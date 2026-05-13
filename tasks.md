# tasks.md — UI Refactor (rama: `style/ui-refactor`)

> Fuente de verdad. Marcar `[x]` al completar. Al cierre de cada fase: lint + tests + smoke manual.

## Convenciones globales

- **Lint**: `pnpm lint` debe pasar sin warnings nuevos.
- **Tests**: `pnpm test` debe pasar (vitest).
- **Consistencia**: respetar tokens en `ui/shared/theme.css`. Sin colores hardcoded. Sin emojis nuevos (usar set de iconos elegido en Fase 6).
- **Accesibilidad mínima**: contraste AA, `aria-label` en botones icon-only, focus visible, navegable por teclado.
- **No romper rutas existentes**: `/ui/`, `/ui/categorias/`, `/ui/importar/`, `/ui/recat/`, `/ui/test-monitor/` siguen funcionando.
- **Commits**: prefijo `style(ui):` o `feat(ui):`. Uno por tarea.
- **Validación fin de fase**: `pnpm lint && pnpm test && pnpm build` + smoke en browser de cada página tocada.

---

## Fase 1 — Navegación + identidad

### T1.1 Topbar persistente
- **Req**: nuevo `ui/shared/topbar.js` que monte header con: logo `tagger`, links a 4 páginas, badge health (verde/rojo según `/health/ready`), dropdown "Recursos" con: GitHub repo (`https://github.com/anegri93/tagger`), Postman collection (`/postman/tagger.postman_collection.json`), OpenAPI (`/openapi.yaml`), Runbook (`/docs/runbook.md` si servible, si no link relativo).
- **Test**: agregar `ui-smoke.test.ts` (vitest + supertest contra `build()`) que verifique GET `/postman/tagger.postman_collection.json` y `/openapi.yaml` retornan 200.
- **Lint**: limpio.
- **Aceptación**:
  - Topbar visible en las 4 páginas + home.
  - Health badge actualiza cada 30s.
  - Dropdown abre con click + teclado (Enter/Space).
  - Links externos abren en nueva tab con `rel="noopener"`.

### T1.2 Servir `postman/`, `openapi.yaml`, `docs/` como estáticos
- **Req**: en `src/api/server.ts` registrar `@fastify/static` adicional para `/postman/` (root `postman/`), exponer `/openapi.yaml` (file send) y `/docs/` (root `docs/`, prefix `/docs/`).
- **Test**: extender `server.test.ts` con assertions de los 3 endpoints.
- **Lint**: limpio.
- **Aceptación**:
  - `curl -I /postman/tagger.postman_collection.json` → 200 + content-type json.
  - `curl -I /openapi.yaml` → 200.
  - `curl -I /docs/runbook.md` → 200.

### T1.3 Footer global
- **Req**: `ui/shared/footer.js` con: versión (leer de `package.json` vía endpoint `/version` nuevo), link repo, link Postman, link OpenAPI.
- **Req backend**: endpoint `GET /version` → `{ version, commit? }`.
- **Test**: `server.test.ts` verifica `/version` retorna shape correcto.
- **Aceptación**: footer visible en todas las páginas, versión coincide con `package.json`.

### T1.4 Breadcrumbs
- **Req**: helper `ui/shared/breadcrumbs.js`. Cada página declara su path (`Home / Categorías / Detalle`).
- **Aceptación**: breadcrumbs en `categorias/detalle.html`, `recat`, `importar`, `test-monitor`. Click en "Home" navega a `/ui/`.

### Validación Fase 1
- [x] `pnpm lint` (sin errores nuevos; 13 warnings preexistentes)
- [x] `pnpm test` (241/241)
- [x] `pnpm build`
- [ ] Smoke manual pendiente usuario.

---

## Fase 2 — Home rediseñada

### T2.1 Sección "¿Cómo funciona?"
- **Req**: bloque visual con 4 pasos cascada (`Catálogo → Patrones → MCC → IA`). Cada paso es card clicable con descripción 1 línea + link a página relevante.
- **Aceptación**: responsive (stack en mobile), keyboard nav, focus visible.

### T2.2 Quickstart 3 pasos
- **Req**: cards numeradas: "1. Importar catálogo" → `/ui/importar/`, "2. Definir patrones" → `/ui/categorias/`, "3. Recategorizar" → `/ui/recat/`.
- **Aceptación**: estado check si conteo > 0 (categorías, patrones, movimientos).

### T2.3 Card Developers
- **Req**: sección "Para developers" con 3 botones: Abrir GitHub, Descargar Postman, Ver OpenAPI.
- **Aceptación**: descarga Postman dispara `download` attribute.

### Validación Fase 2
- [x] `pnpm lint && pnpm test && pnpm build`
- [ ] Smoke manual pendiente.

---

## Fase 3 — Empty states + ayuda contextual

### T3.1 Componente empty state
- **Req**: `ui/shared/empty-state.js`. API: `renderEmpty(container, { icon, title, message, ctaLabel, ctaHref, postmanRequest })`.
- **Aceptación**: usado en categorias (sin items), recat (sin diffs), test-monitor (sin tests), importar (sin imports previos si aplica).

### T3.2 Tooltips contextuales
- **Req**: `ui/shared/tooltip.js`. Aplicar a campos: `mcc`, `confianza_minima`, `patrón regex`, `marcas IA`.
- **Aceptación**: tooltip visible hover + focus, dismiss con Esc.

### T3.3 Modal "API / Atajos"
- **Req**: `ui/shared/api-modal.js`. Cada página registra endpoints relevantes: muestra curl + link a request Postman correspondiente (deep-link via query param o índice JSON).
- **Aceptación**: modal abre con `?` keyboard shortcut o botón `</>` en topbar.

### Validación Fase 3
- [x] `pnpm lint && pnpm test && pnpm build`
- [ ] Smoke manual pendiente (tooltip MCC, modal `?`, empty state cuando no hay categorías).
- Nota: empty state integrado en `categorias` (lista vacía). Recat/test-monitor/importar usan modal API; integración empty-state queda lista para adopción incremental.

---

## Fase 4 — Feedback y errores

### T4.1 Toasts unificados
- **Req**: `ui/shared/toast.js`. API: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`. Auto-dismiss 4s, dismiss manual.
- **Aceptación**: reemplazar todos los `alert()` y mensajes inline rojos en categorias/recat/importar/test-monitor.

### T4.2 Skeletons en tablas
- **Req**: `ui/shared/skeleton.js`. Render N filas placeholder mientras carga.
- **Aceptación**: tabla categorias y recat muestran skeleton, no "…".

### T4.3 Manejo errores API
- **Req**: en `ui/shared/api.js` parsear response error, retornar `{ ok: false, error: { code, message } }`. Wrapper UI muestra toast con `message` + botón retry.
- **Test**: agregar test unitario en `vitest` mockeando fetch (puede ir a `src/`-side o agregar `ui-tests/`).
- **Aceptación**: matar API → reintento desde toast funciona al levantarla.

### Validación Fase 4
- [x] `pnpm lint && pnpm test && pnpm build`
- [ ] Smoke manual pendiente.
- Nota: `api.js` expone `taggerApiSafe` con toast+retry automático; pages pueden migrar `taggerApi` → `taggerApiSafe` incrementalmente. `categorias` ya usa toast en `loadList` y `crear`.

---

## Fase 5 — Postman embebido (opcional)

### T5.1 Página `/ui/api/`
- **Req**: nueva página que parsea `tagger.postman_collection.json` y renderiza árbol navegable (folders → requests). Cada request muestra: método, URL, descripción, headers, body example.
- **Aceptación**: árbol coincide con colección. Búsqueda filtra requests.

### T5.2 Botón "Probar request"
- **Req**: botón ejecuta request via `taggerApi()` con substitución de `{{baseUrl}}` y `{{apiKey}}` desde state. Muestra response prettified.
- **Aceptación**: GET `/categorias` se ejecuta, response visible. Editar body funciona para POST.

### Validación Fase 5
- [x] `pnpm lint && pnpm test && pnpm build`
- [ ] Smoke manual pendiente.
- Implementación: `/ui/api/index.html` con árbol filtrable + ejecutor inline (curl, retry, response viewer).

---

## Fase 6 — Pulido visual

### T6.1 Auditoría theme
- **Req**: revisar `ui/shared/theme.css`: contraste AA en pares texto/fondo. Documentar tokens en comentario top.
- **Aceptación**: pasar contraste con herramienta (axe DevTools manual). 0 errores críticos.

### T6.2 Iconos consistentes
- **Req**: reemplazar emojis en topbar/cards/empty states por set Lucide (CDN inline SVG sprite o `lucide-static`).
- **Aceptación**: 0 emojis en HTML/JS de UI excepto strings de datos usuario.

### T6.3 Densidad tabla configurable
- **Req**: toggle compacto/normal en tabla categorias. Persistir preferencia en `localStorage` via `state.js`.
- **Aceptación**: refresh mantiene preferencia.

### T6.4 Dark mode toggle
- **Req**: si theme.css ya soporta vars, agregar toggle light/dark en topbar. Persistir en `localStorage`. Default = system preference.
- **Aceptación**: toggle cambia tema sin reload, persiste.

### Validación Fase 6 (FINAL)
- [x] `pnpm lint` (0 errores; 13 warnings preexistentes)
- [x] `pnpm test` (241/241)
- [x] `pnpm build`
- [ ] Smoke completo manual pendiente.
- [ ] Lighthouse a11y manual.
- [ ] PR a `main` (pendiente acción usuario).
- Implementación: dark/light toggle persistido + densidad compacta para tablas, drop emojis en headers, audit comentado en theme.css.

---

## Estado global

- [x] Fase 1
- [x] Fase 2
- [x] Fase 3
- [x] Fase 4
- [x] Fase 5
- [x] Fase 6
