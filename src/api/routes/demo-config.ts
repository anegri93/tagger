import type { FastifyPluginAsync } from 'fastify';

// Endpoint público — devuelve config para el demo UI.
// Permite que el bundle JS no tenga la API_KEY hardcodeada en build time.
// Solo expone valores seguros de compartir con el browser del demo.
export const demoConfigRoute: FastifyPluginAsync = async (app) => {
  app.get('/demo/config', async (_req, reply) => {
    return reply.send({
      apiKey: process.env.API_KEY ?? '',
      hasOpenRouter: Boolean(process.env.OPENROUTER_API_KEY),
    });
  });
};
