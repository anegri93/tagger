# E2E gestión categorías via UI

## Setup

```bash
bash start.sh
# abrir http://localhost:3000/ui/categorias/index.html
```

## Pasos verificación

### 1. Crear categoría
- UI lista categorías → click **+ Nueva**
- Slug: `mascotas`, Nombre: `Mascotas`
- Submit → aparece en lista con counts en 0

### 2. Verificar IA refresca
- Abrir tester → mandar movimiento desconocido
- Ver `evidencia.ia_prompt` → debería contener `mascotas: Mascotas`

### 3. Agregar regla regex
- Click slug `mascotas` → tab **Reglas**
- Patrón: `\b(VETERINARIA|PETSHOP|MASCOTA)\b`
- Prioridad: 20
- Click **Probar patrón** con "VETERINARIA SAN ROQUE" → match ✓
- Click **+ Agregar**

### 4. Asignar MCC
- Tab **MCCs**
- Buscar "Servicios veterinarios" en lista sin categoría (o crear MCC 0742 vía API si falta)
- Click **Asignar** → pasa a MCCs asignados

### 5. Agregar marca
- Tab **Marcas**
- Marca: `PETSHOP CITY`
- Click **+ Agregar**

### 6. Re-procesar catálogo
- Botón global **Re-procesar catálogo** (en /ui/categorias/index.html)
- Confirmar truncate sí/no
- Verificar progreso en panel reproceso

### 7. Validar predicciones
- Tester → `{descripcion: "VETERINARIA SAN ROQUE"}` → predice **mascotas** vía regex 0.95
- Tester → `{descripcion: "petshop city sucursal"}` → IA debería predecir mascotas (vía marca)

### 8. Tratar de eliminar
- Volver a lista → click **Eliminar** en mascotas
- Si hay refs → error 409 con detalle counts
- Eliminar reglas, MCCs, marcas asociadas → Eliminar funciona si counts movimientos = 0

### 9. Tab Comercios (re-categorizar individuales)
- En detalle de categoría → tab **Comercios**
- Búsqueda por nombre + checkbox "solo revisión"
- Tabla paginada (50 por página): nombre, bancard, codigo, MCC, fuente, confianza, revisión
- Dropdown **Cambiar a** → mueve comercio a otra categoría (fuente='manual', confianza=1.00)
- Toggle revisión inline
- Comercios movidos desaparecen de la vista actual

## Flujo automático verificado

Cuando creás una categoría, el sistema cubre los 8 pasos manuales:

| Paso | Cobertura UI |
|------|-------------|
| 1. Editar seed | ✅ persiste a `data/categorias-extras.tsv` |
| 2. Cargar a DB | ✅ POST /categorias inserta directo |
| 3. Reglas regex | ✅ tab Reglas + persistencia `data/reglas-extras.tsv` |
| 4. MCC mapping | ✅ tab MCCs + persistencia `data/mcc-extras.tsv` |
| 5. Re-procesar catálogo | ✅ botón global → POST /catalogo/reprocess |
| 6. IA Gemma | ✅ auto: lee marcas+categorías DB con cache 60s |
| 7. MARCAS_PY prompt | ✅ tab Marcas → tabla `marcas_conocidas` → IA dinámico |
| 8. Tester dropdown | ✅ GET /categorias auto |
