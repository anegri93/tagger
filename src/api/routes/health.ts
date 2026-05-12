import type { FastifyPluginAsync } from 'fastify';

export interface HealthDeps {
  pingDb(): Promise<boolean>;
  pingOllama?: () => Promise<boolean>;
}

export const healthRoute =
  (deps: HealthDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/health/ready', async (_req, reply) => {
      const dbOk = await deps.pingDb().catch(() => false);
      let ollama: 'ok' | 'fail' | 'skip' = 'skip';
      if (deps.pingOllama) {
        ollama = (await deps.pingOllama().catch(() => false)) ? 'ok' : 'fail';
      }
      const status = dbOk ? 'ok' : 'degraded';
      const code = dbOk ? 200 : 503;
      return reply.code(code).send({
        status,
        db: dbOk ? 'ok' : 'fail',
        ollama,
      });
    });
  };
