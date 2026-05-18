CREATE TABLE IF NOT EXISTS "patrones_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario" text NOT NULL,
	"tipo" "patron_tipo" NOT NULL,
	"valor" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridad" integer DEFAULT 100 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"descripcion" text,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patrones_usuario" ADD CONSTRAINT "patrones_usuario_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patrones_usuario_user_tipo_valor_uq" ON "patrones_usuario" USING btree ("usuario","tipo","valor");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patrones_usuario_user_activo_idx" ON "patrones_usuario" USING btree ("usuario","activo","prioridad");
