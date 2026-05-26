-- 0025: versionar presupuestos.
--
-- Cambio de modelo: en lugar de 1 fila por (usuario, categoria), múltiples filas
-- con `vigente_desde`. Editar tope = INSERT nueva versión. Lectura de un mes X
-- = última fila con vigente_desde <= último día de X.
--
-- Bonus: sobrevivir a borrado de categoría sin perder histórico de topes.
-- Se denormalizan nombre y slug en la propia tabla. FK pasa a SET NULL.
--
-- Baja de presupuesto = INSERT con monto_mensual = 0 (no se elimina histórico).

-- 1. Quitar UNIQUE para permitir múltiples versiones por (usuario, categoria)
ALTER TABLE presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_usuario_id_categoria_id_key;

-- 2. Versionado
ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS vigente_desde date NOT NULL DEFAULT '2000-01-01';

-- 3. Sobrevivir a borrado de categoría
ALTER TABLE presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_categoria_id_fkey;

ALTER TABLE presupuestos
  ALTER COLUMN categoria_id DROP NOT NULL;

ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_categoria_id_fkey
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL;

ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS categoria_nombre text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS categoria_slug text NOT NULL DEFAULT '';

-- 4. Backfill nombre/slug de las filas existentes
UPDATE presupuestos p
SET categoria_nombre = c.nombre,
    categoria_slug = c.slug
FROM categorias c
WHERE p.categoria_id = c.id
  AND (p.categoria_nombre = '' OR p.categoria_slug = '');

-- 5. Permitir monto = 0 (baja)
ALTER TABLE presupuestos
  DROP CONSTRAINT IF EXISTS presupuestos_monto_mensual_check;

ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_monto_mensual_check
    CHECK (monto_mensual >= 0);

-- 6. Índice para query de tope vigente por (usuario, categoria_slug, fecha)
CREATE INDEX IF NOT EXISTS idx_presupuestos_vigente
  ON presupuestos (usuario_id, categoria_slug, vigente_desde DESC);
