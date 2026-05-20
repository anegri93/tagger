-- 0021: similitud semántica para categorías vía pg_trgm.
--
-- Habilita similarity() y agrega índice GIN sobre texto concatenado
-- (slug + nombre + descripcion) para búsquedas top-K rápidas cuando
-- el usuario recategoriza un movimiento.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_categorias_trgm_texto
  ON categorias
  USING gin ((coalesce(slug,'') || ' ' || coalesce(nombre,'') || ' ' || coalesce(descripcion,'')) gin_trgm_ops);
