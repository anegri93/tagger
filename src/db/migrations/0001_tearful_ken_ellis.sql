ALTER TABLE "comercios_catalogo" ADD COLUMN "bancard_id" text;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "codigo_comercio" text;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "mcc_original" text;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "fuente_categoria" "fuente_categoria";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "confianza" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "requiere_revision" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "evidencia" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "comercios_bancard_codigo_uniq" ON "comercios_catalogo" USING btree ("bancard_id","codigo_comercio") WHERE "comercios_catalogo"."bancard_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "comercios_requiere_revision_idx" ON "comercios_catalogo" USING btree ("requiere_revision") WHERE "comercios_catalogo"."requiere_revision" = true;