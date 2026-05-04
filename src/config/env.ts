import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('gemma2:2b'),
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
