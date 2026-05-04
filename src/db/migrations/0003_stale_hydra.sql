ALTER TABLE "movimientos" ADD COLUMN "origen" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "bancard_id" text;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "codigo_comercio" text;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
CREATE INDEX "movimientos_batch_id_idx" ON "movimientos" USING btree ("batch_id") WHERE "movimientos"."batch_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "movimientos_origen_idx" ON "movimientos" USING btree ("origen");