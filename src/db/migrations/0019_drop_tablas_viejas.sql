-- Etapa 2 final: drop tablas reemplazadas por "reglas"
-- Backfill ya migrado en 0018. Estas tablas no se usan más.

DROP TABLE IF EXISTS "patrones_usuario";--> statement-breakpoint
DROP TABLE IF EXISTS "patrones";--> statement-breakpoint
DROP TABLE IF EXISTS "memoria_usuario_destinatario";--> statement-breakpoint
DROP TYPE IF EXISTS "patron_tipo";--> statement-breakpoint
DROP TYPE IF EXISTS "patron_fuente";
