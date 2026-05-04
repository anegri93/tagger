ALTER TABLE "comercios_catalogo" ADD COLUMN "marca" text;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "mcc_inferido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "comercios_marca_idx" ON "comercios_catalogo" USING btree ("marca");