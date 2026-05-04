import { describe, it, expect } from 'vitest';

describe('logger', () => {
  it('importa sin throw y expone métodos pino', async () => {
    process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
    const { logger } = await import('./logger.js');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(() => logger.info({ test: true }, 'log de prueba')).not.toThrow();
  });
});
