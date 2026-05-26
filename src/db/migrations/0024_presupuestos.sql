-- 0024: tabla presupuestos para límites mensuales por categoría/usuario.
--
-- V1: mensual fijo (mes calendario, no rolling). Un solo presupuesto activo
-- por (usuario, categoria) a la vez. Para cambiar monto se UPDATE en lugar
-- de versionar (V2 podría versionar con activo_desde si hace falta histórico).
-- Sin-categoria NO admite presupuesto (no se valida acá, lo aplica la API).

CREATE TABLE IF NOT EXISTS presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text NOT NULL,
  categoria_id uuid NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  monto_mensual numeric(14,2) NOT NULL CHECK (monto_mensual > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_usuario
  ON presupuestos (usuario_id);
