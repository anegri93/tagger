CREATE TABLE "test_ground_truth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" text NOT NULL,
	"nombre" text NOT NULL,
	"bancard_id" text,
	"codigo_comercio" text,
	"mcc" text,
	"categoria_xlsx" text,
	"sector_xlsx" text,
	"cantidad" integer,
	"fuente_origen" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "test_ground_truth_batch_nombre_uq" ON "test_ground_truth" USING btree ("batch_id","nombre");--> statement-breakpoint
CREATE INDEX "test_ground_truth_batch_idx" ON "test_ground_truth" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "test_ground_truth_nombre_idx" ON "test_ground_truth" USING btree ("nombre");