ALTER TABLE "comercios_catalogo" ADD COLUMN "categoria_nueva_id" uuid;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "fuente_nueva" "fuente_categoria";--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "confianza_nueva" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD COLUMN "recategorizado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD CONSTRAINT "comercios_catalogo_categoria_nueva_id_categorias_id_fk" FOREIGN KEY ("categoria_nueva_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;