CREATE TABLE "marcas_conocidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"marca" text NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marcas_conocidas" ADD CONSTRAINT "marcas_conocidas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marcas_conocidas_marca_uniq" ON "marcas_conocidas" USING btree ("marca");--> statement-breakpoint
CREATE INDEX "marcas_conocidas_categoria_idx" ON "marcas_conocidas" USING btree ("categoria_id");