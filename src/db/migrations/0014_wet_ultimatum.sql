CREATE TABLE "memoria_usuario_destinatario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario" text NOT NULL,
	"destinatario" text NOT NULL,
	"destinatario_normalizado" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"origen" text DEFAULT 'correccion' NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_ground_truth" ADD COLUMN "nombre_normalizado" text;--> statement-breakpoint
ALTER TABLE "test_ground_truth" ADD COLUMN "combined_mcc" text;--> statement-breakpoint
ALTER TABLE "memoria_usuario_destinatario" ADD CONSTRAINT "memoria_usuario_destinatario_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memoria_usuario_dest_norm_uq" ON "memoria_usuario_destinatario" USING btree ("usuario","destinatario_normalizado");