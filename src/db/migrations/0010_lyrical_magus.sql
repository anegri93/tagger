CREATE TABLE "dataset_comercios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"categoria_id" uuid,
	"categoria_slug" text,
	"categoria_nueva_id" uuid,
	"categoria_nueva_slug" text,
	"fuente_nueva" "fuente_categoria",
	"confianza_nueva" numeric(3, 2),
	"recategorizado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "dataset_comercios" ADD CONSTRAINT "dataset_comercios_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_comercios" ADD CONSTRAINT "dataset_comercios_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_comercios" ADD CONSTRAINT "dataset_comercios_categoria_nueva_id_categorias_id_fk" FOREIGN KEY ("categoria_nueva_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_comercios_unico" ON "dataset_comercios" USING btree ("dataset_id","nombre");--> statement-breakpoint
CREATE INDEX "dataset_comercios_dataset_idx" ON "dataset_comercios" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "dataset_comercios_recat_idx" ON "dataset_comercios" USING btree ("dataset_id","recategorizado_at");