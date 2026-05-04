import type { FastifyPluginAsync } from 'fastify';

export interface CategoriaPublica {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
}

export interface CategoriasReader {
  activas(): Promise<CategoriaPublica[]>;
}

export const categoriasRoute = (reader: CategoriasReader): FastifyPluginAsync => async (app) => {
  app.get('/categorias', async () => {
    const items = await reader.activas();
    return { items };
  });
};
