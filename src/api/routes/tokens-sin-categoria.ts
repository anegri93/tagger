import type { FastifyPluginAsync } from 'fastify';
import { sql, and, isNull, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { comerciosCatalogo } from '../../db/schema/index.js';
import { normalize } from '../../domain/normalize.js';

const STOPWORDS = new Set([
  'SA',
  'SRL',
  'LTDA',
  'EIRL',
  'CIA',
  'SAS',
  'LLC',
  'INC',
  'DEL',
  'DE',
  'LA',
  'EL',
  'LOS',
  'LAS',
  'Y',
  'EN',
  'CON',
  'POR',
]);

interface TokenRow {
  token: string;
  freq: number;
  ejemplos: string[];
}

export function tokenizar(nombre: string): string[] {
  const norm = normalize(nombre);
  return norm.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export const tokensSinCategoriaRoute =
  (db: Db): FastifyPluginAsync =>
  async (app) => {
    app.get<{ Querystring: { limit?: string } }>(
      '/catalogo/tokens-sin-categoria',
      async (req, reply) => {
        const limit = Math.min(Number(req.query.limit ?? 50), 500);
        const filas = await db
          .select({
            id: comerciosCatalogo.id,
            nombre: comerciosCatalogo.nombre,
          })
          .from(comerciosCatalogo)
          .where(
            and(
              isNull(comerciosCatalogo.categoriaNuevaId),
              isNotNull(comerciosCatalogo.recategorizadoAt),
            ),
          );

        const tokenMap = new Map<string, { freq: number; ejemplos: string[] }>();
        for (const f of filas) {
          for (const t of tokenizar(f.nombre)) {
            const cur = tokenMap.get(t) ?? { freq: 0, ejemplos: [] };
            cur.freq++;
            if (cur.ejemplos.length < 5) cur.ejemplos.push(f.nombre);
            tokenMap.set(t, cur);
          }
        }

        const items: TokenRow[] = Array.from(tokenMap.entries())
          .map(([token, v]) => ({ token, freq: v.freq, ejemplos: v.ejemplos }))
          .sort((a, b) => b.freq - a.freq)
          .slice(0, limit);

        void sql;
        return reply.send({ total_sin_categoria: filas.length, items });
      },
    );
  };
