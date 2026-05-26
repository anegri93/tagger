import type { FastifyPluginAsync } from 'fastify';

export interface HealthDeps {
  pingDb(): Promise<boolean>;
  /** Probe del provider LLM (OpenRouter). Si ausente, devuelve `'skip'`. */
  pingLlm?: () => Promise<boolean>;
  /** @deprecated alias retrocompat — usar `pingLlm`. */
  pingOllama?: () => Promise<boolean>;
}

export const healthRoute =
  (deps: HealthDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/health/ready', async (_req, reply) => {
      const dbOk = await deps.pingDb().catch(() => false);
      let llm: 'ok' | 'fail' | 'skip' = 'skip';
      const llmProbe = deps.pingLlm ?? deps.pingOllama;
      if (llmProbe) {
        llm = (await llmProbe().catch(() => false)) ? 'ok' : 'fail';
      }
      const status = dbOk ? 'ok' : 'degraded';
      const code = dbOk ? 200 : 503;
      return reply.code(code).send({
        status,
        db: dbOk ? 'ok' : 'fail',
        llm,
      });
    });
  };
