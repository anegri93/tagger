-- Etapa 2: unificar memoria + patrones + patrones_usuario en tabla "reglas"
-- Scope: 'global' o 'usuario:<usuario>'
-- Tipo: literal | contiene | regex (3 valores, prefijo migra a literal)

CREATE TABLE IF NOT EXISTS "reglas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "tipo" text NOT NULL,
  "valor" text NOT NULL,
  "valor_normalizado" text NOT NULL,
  "categoria_id" uuid NOT NULL,
  "prioridad" integer NOT NULL DEFAULT 100,
  "activo" boolean NOT NULL DEFAULT true,
  "hits" integer NOT NULL DEFAULT 0,
  "origen" text NOT NULL DEFAULT 'manual',
  "descripcion" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reglas_tipo_check" CHECK (tipo IN ('literal','contiene','regex'))
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "reglas" ADD CONSTRAINT "reglas_categoria_id_categorias_id_fk"
    FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reglas_scope_tipo_norm_uq"
  ON "reglas" USING btree ("scope","tipo","valor_normalizado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reglas_scope_activo_idx"
  ON "reglas" USING btree ("scope","activo","prioridad");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reglas_valor_norm_idx"
  ON "reglas" USING btree ("valor_normalizado");--> statement-breakpoint

-- Backfill patrones globales (prefijo→literal, literal→literal, contiene→contiene, regex→regex)
INSERT INTO "reglas"
  (scope, tipo, valor, valor_normalizado, categoria_id, prioridad, activo, origen, descripcion, created_at, updated_at)
SELECT
  'global' AS scope,
  CASE
    WHEN tipo IN ('literal','prefijo') THEN 'literal'
    WHEN tipo = 'contiene' THEN 'contiene'
    ELSE 'regex'
  END AS tipo,
  valor,
  upper(regexp_replace(valor, '[^A-Za-z0-9 ]', '', 'g')) AS valor_normalizado,
  categoria_id,
  prioridad,
  activo,
  CASE
    WHEN fuente = 'manual' THEN 'manual'
    WHEN fuente = 'catalogo_bancard' THEN 'catalogo_bancard'
    ELSE 'auto'
  END AS origen,
  descripcion,
  created_at,
  updated_at
FROM "patrones"
ON CONFLICT (scope, tipo, valor_normalizado) DO NOTHING;--> statement-breakpoint

-- Backfill patrones_usuario (mismo mapeo de tipo)
INSERT INTO "reglas"
  (scope, tipo, valor, valor_normalizado, categoria_id, prioridad, activo, hits, origen, descripcion, created_at, updated_at)
SELECT
  'usuario:' || usuario AS scope,
  CASE
    WHEN tipo IN ('literal','prefijo') THEN 'literal'
    WHEN tipo = 'contiene' THEN 'contiene'
    ELSE 'regex'
  END AS tipo,
  valor,
  upper(regexp_replace(valor, '[^A-Za-z0-9 ]', '', 'g')) AS valor_normalizado,
  categoria_id,
  prioridad,
  activo,
  hits,
  'sugerencia' AS origen,
  descripcion,
  created_at,
  updated_at
FROM "patrones_usuario"
ON CONFLICT (scope, tipo, valor_normalizado) DO NOTHING;--> statement-breakpoint

-- Backfill memoria_usuario_destinatario (siempre tipo literal)
INSERT INTO "reglas"
  (scope, tipo, valor, valor_normalizado, categoria_id, prioridad, activo, hits, origen, created_at, updated_at)
SELECT
  'usuario:' || usuario AS scope,
  'literal' AS tipo,
  destinatario AS valor,
  destinatario_normalizado AS valor_normalizado,
  categoria_id,
  50 AS prioridad,
  true AS activo,
  hits,
  CASE WHEN origen = 'correccion' THEN 'correccion' ELSE 'manual' END AS origen,
  created_at,
  updated_at
FROM "memoria_usuario_destinatario"
ON CONFLICT (scope, tipo, valor_normalizado) DO NOTHING;
