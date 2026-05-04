CREATE TYPE "public"."fuente_categoria" AS ENUM('regex', 'bancard', 'nombre', 'mcc', 'ia', 'manual');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reglas_regex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patron" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"prioridad" integer DEFAULT 100 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comercios_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_bancard" text,
	"nombre_normalizado" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"mcc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc_catalogo" (
	"cod_mcc" text PRIMARY KEY NOT NULL,
	"cod_rubro" text,
	"desc_rubro" text,
	"descripcion" text,
	"categoria_id" uuid,
	"ambiguo" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descripcion" text,
	"nombre_comercio" text,
	"nombre_bancard" text,
	"mcc" text,
	"monto" numeric(18, 2),
	"categoria_predicha_id" uuid,
	"categoria_confirmada_id" uuid,
	"fuente_categoria" "fuente_categoria",
	"confianza" numeric(3, 2),
	"requiere_revision" boolean DEFAULT false NOT NULL,
	"raw_input" jsonb,
	"evidencia" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correcciones_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"categoria_anterior_id" uuid,
	"categoria_nueva_id" uuid NOT NULL,
	"usuario" text,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reglas_regex" ADD CONSTRAINT "reglas_regex_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comercios_catalogo" ADD CONSTRAINT "comercios_catalogo_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc_catalogo" ADD CONSTRAINT "mcc_catalogo_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_predicha_id_categorias_id_fk" FOREIGN KEY ("categoria_predicha_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_confirmada_id_categorias_id_fk" FOREIGN KEY ("categoria_confirmada_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correcciones_usuario" ADD CONSTRAINT "correcciones_usuario_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correcciones_usuario" ADD CONSTRAINT "correcciones_usuario_categoria_anterior_id_categorias_id_fk" FOREIGN KEY ("categoria_anterior_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correcciones_usuario" ADD CONSTRAINT "correcciones_usuario_categoria_nueva_id_categorias_id_fk" FOREIGN KEY ("categoria_nueva_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reglas_regex_activo_prioridad_idx" ON "reglas_regex" USING btree ("activo","prioridad");--> statement-breakpoint
CREATE UNIQUE INDEX "comercios_nombre_bancard_uniq" ON "comercios_catalogo" USING btree ("nombre_bancard") WHERE "comercios_catalogo"."nombre_bancard" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "comercios_nombre_normalizado_idx" ON "comercios_catalogo" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX "movimientos_created_at_idx" ON "movimientos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "movimientos_requiere_revision_idx" ON "movimientos" USING btree ("requiere_revision");--> statement-breakpoint
CREATE INDEX "correcciones_movimiento_idx" ON "correcciones_usuario" USING btree ("movimiento_id");