import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { reglasRegex } from '../schema/index.js';
import type { ReglasLoader, ReglaCargada } from '../../layers/regex.js';

export function crearReglasLoader(db: Db): ReglasLoader {
  return {
    async cargar(): Promise<ReglaCargada[]> {
      const rows = await db
        .select({
          id: reglasRegex.id,
          patron: reglasRegex.patron,
          categoriaId: reglasRegex.categoriaId,
          prioridad: reglasRegex.prioridad,
        })
        .from(reglasRegex)
        .where(eq(reglasRegex.activo, true));
      return rows;
    },
  };
}
