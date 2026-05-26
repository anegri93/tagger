import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  // IA fallback (capa 4 del pipeline) y chat — ambos vía OpenRouter.
  OPENROUTER_API_KEY: z.string().optional(),
  /** Modelo preferido. Si vacío, usa el primero del fallback chain hardcoded. */
  OPENROUTER_IA_MODEL: z.string().optional(),
  IA_MAX_CONCURRENT: z.coerce.number().int().positive().default(4),
  DB_POOL_MAX: z.coerce.number().int().positive().default(30),
  REGLAS_CACHE_MAX: z.coerce.number().int().positive().default(5000),
  REGLAS_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  IA_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  API_KEY: z.string().min(16, 'API_KEY debe tener al menos 16 caracteres'),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Configuración inválida:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Variables de entorno inválidas. Revisar .env');
  }
  return parsed.data;
})();
