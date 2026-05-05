import { reglasRegex } from '../schema/index.js';
import { type LoaderConfig } from './csv.js';

interface ExtraRow extends Record<string, string> {
  patron: string;
  categoria_slug: string;
  prioridad: string;
  descripcion: string;
  activo: string;
}

interface ExtraInsert {
  patron: string;
  categoriaId: string;
  prioridad: number;
  descripcion: string | null;
  activo: boolean;
}

export const reglasExtrasLoaderConfig: LoaderConfig<ExtraRow, ExtraInsert> = {
  table: reglasRegex,
  tableName: 'reglas_regex (extras)',
  file: 'data/reglas-extras.tsv',
  mapRow(row, ctx) {
    const patron = row.patron?.trim();
    const slug = row.categoria_slug?.trim();
    if (!patron || !slug) return null;
    const categoriaId = ctx.resolveCategoria(slug);
    if (!categoriaId) {
      console.warn(`[reglas-extras] slug '${slug}' inexistente, skip ${patron}`);
      return null;
    }
    return {
      patron,
      categoriaId,
      prioridad: Number(row.prioridad) || 100,
      descripcion: row.descripcion?.trim() || null,
      activo: row.activo !== '0',
    };
  },
};
