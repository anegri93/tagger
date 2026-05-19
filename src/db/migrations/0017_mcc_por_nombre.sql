-- Etapa 1: comercios_catalogo → mcc_por_nombre
-- Drop 15 columnas inertes (verificado contra DB: NULL en 100% de filas o constantes)
-- Renombrar tabla + índices

DROP INDEX IF EXISTS "comercios_nombre_bancard_uniq";--> statement-breakpoint
DROP INDEX IF EXISTS "comercios_bancard_codigo_uniq";--> statement-breakpoint
DROP INDEX IF EXISTS "comercios_nombre_norm_solo_uniq";--> statement-breakpoint
DROP INDEX IF EXISTS "comercios_marca_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "comercios_requiere_revision_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "comercios_nombre_normalizado_idx";--> statement-breakpoint

ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "bancard_id";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "codigo_comercio";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "nombre_bancard";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "marca";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "mcc_original";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "mcc_inferido";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "fuente_categoria";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "confianza";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "evidencia";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "categoria_nueva_id";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "fuente_nueva";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "confianza_nueva";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "evidencia_nueva";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" DROP COLUMN IF EXISTS "recategorizado_at";--> statement-breakpoint

-- mcc debe ser NOT NULL (verificado: 100% lo tienen)
ALTER TABLE "comercios_catalogo" ALTER COLUMN "mcc" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "comercios_catalogo" RENAME TO "mcc_por_nombre";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "mcc_por_nombre_norm_uq" ON "mcc_por_nombre" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcc_por_nombre_requiere_revision_idx" ON "mcc_por_nombre" USING btree ("requiere_revision") WHERE "requiere_revision" = true;
