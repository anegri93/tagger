-- 0023: tabla descripcion_uso para autocomplete per-user de descripciones.
--
-- Cada vez que un usuario categoriza un movimiento con descripcion no nula,
-- se hace upsert (freq++, cat_top_id, ultima_vez_at). El endpoint
-- GET /descripciones/sugerencias hace lookup por prefix btree.

CREATE TABLE IF NOT EXISTS descripcion_uso (
  usuario_id text NOT NULL,
  descripcion_normalizada text NOT NULL,
  descripcion_original text NOT NULL,
  freq integer NOT NULL DEFAULT 1,
  cat_top_id uuid REFERENCES categorias(id) ON DELETE SET NULL,
  ultima_vez_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, descripcion_normalizada)
);

CREATE INDEX IF NOT EXISTS idx_descripcion_uso_prefix
  ON descripcion_uso (usuario_id, descripcion_normalizada text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_descripcion_uso_freq
  ON descripcion_uso (usuario_id, freq DESC);
