-- 0026: subcategorías por usuario.
--
-- Modelo: cada user puede crear sus propias "categorías" que internamente son
-- subcategorías ancladas a una canónica (rubro Mango). Movimientos tienen ahora
-- dos columnas: categoria_id (canónica/rubro) + subcategoria_usuario_id (opcional).
--
-- Decisiones:
-- - Misma DB, tabla nueva separada para mantener canónicas curadas inmutables.
-- - canonica_id NOT NULL, FK RESTRICT: Mango no puede borrar canónica con subcats activas.
-- - movimientos.subcategoria_usuario_id ON DELETE SET NULL: borrar subcat preserva
--   historial de movs con su canónica.
-- - Slug único por user (UNIQUE usuario_id, slug).
-- - Soft delete via flag activo (no se borra fila).
-- - Reports Mango siguen agrupando por categoria_id (canónica) sin cambios.

CREATE TABLE IF NOT EXISTS categorias_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text NOT NULL,
  canonica_id uuid NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  slug text NOT NULL,
  emoji text,
  color text,
  activo boolean NOT NULL DEFAULT true,
  origen text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Slug único per user (alcance scoping).
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_usuario_slug
  ON categorias_usuario(usuario_id, slug);

-- Lookup hot path: cats activas de un user.
CREATE INDEX IF NOT EXISTS idx_categorias_usuario_user_activo
  ON categorias_usuario(usuario_id)
  WHERE activo;

-- Rollup por canónica (reports + delete protection).
CREATE INDEX IF NOT EXISTS idx_categorias_usuario_canonica
  ON categorias_usuario(canonica_id);

-- Movimientos: nueva columna opcional.
ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS subcategoria_usuario_id uuid
  REFERENCES categorias_usuario(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_subcategoria
  ON movimientos(subcategoria_usuario_id)
  WHERE subcategoria_usuario_id IS NOT NULL;

-- Correcciones: preservar elección de subcat para historial/aprendizaje.
ALTER TABLE correcciones_usuario
  ADD COLUMN IF NOT EXISTS subcategoria_usuario_id uuid
  REFERENCES categorias_usuario(id) ON DELETE SET NULL;
