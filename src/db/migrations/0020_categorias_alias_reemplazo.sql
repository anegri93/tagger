-- 0020: aliases + reemplazada_por para reorganizar categorías sin trauma.
--
-- categorias_alias: slugs antiguos siguen funcionando como lookup keys.
--   POST/GET /categorias/<slug-antiguo> resuelve via alias a categoria actual.
--
-- categorias.reemplazada_por_id: si una cat se "borra" lógicamente, su FK queda
--   apuntando a la cat reemplazante. Permite soft-merge sin perder historial.

CREATE TABLE IF NOT EXISTS categorias_alias (
  slug_antiguo text PRIMARY KEY,
  categoria_id uuid NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  motivo text,
  creada_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categorias_alias_categoria ON categorias_alias(categoria_id);

ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS reemplazada_por_id uuid REFERENCES categorias(id);

CREATE INDEX IF NOT EXISTS idx_categorias_reemplazada_por ON categorias(reemplazada_por_id)
  WHERE reemplazada_por_id IS NOT NULL;
