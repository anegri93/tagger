CREATE TYPE "public"."patron_fuente" AS ENUM('manual', 'catalogo_bancard', 'auto');--> statement-breakpoint
CREATE TYPE "public"."patron_tipo" AS ENUM('regex', 'literal', 'prefijo', 'contiene');--> statement-breakpoint
CREATE TABLE "patrones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "patron_tipo" NOT NULL,
	"valor" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridad" integer DEFAULT 100 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"fuente" "patron_fuente" DEFAULT 'manual' NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patrones" ADD CONSTRAINT "patrones_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patrones_tipo_valor_categoria_uq" ON "patrones" USING btree ("tipo","valor","categoria_id");--> statement-breakpoint
CREATE INDEX "patrones_activo_prioridad_idx" ON "patrones" USING btree ("activo","prioridad");