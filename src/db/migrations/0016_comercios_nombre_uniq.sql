CREATE UNIQUE INDEX IF NOT EXISTS "comercios_nombre_norm_solo_uniq"
ON "comercios_catalogo" ("nombre_normalizado")
WHERE "bancard_id" IS NULL AND "codigo_comercio" IS NULL;
