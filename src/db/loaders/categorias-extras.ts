import { categorias } from '../schema/index.js';
import { type LoaderConfig } from './csv.js';

interface ExtraRow extends Record<string, string> {
  slug: string;
  nombre: string;
  descripcion: string;
}

interface ExtraInsert {
  slug: string;
  nombre: string;
  descripcion: string | null;
}

export const categoriasExtrasLoaderConfig: LoaderConfig<ExtraRow, ExtraInsert> = {
  table: categorias,
  tableName: 'categorias (extras)',
  file: 'data/categorias-extras.tsv',
  mapRow(row) {
    const slug = row.slug?.trim();
    const nombre = row.nombre?.trim();
    if (!slug || !nombre) return null;
    return { slug, nombre, descripcion: row.descripcion?.trim() || null };
  },
  upsert: {
    target: categorias.slug,
    setUpdate: (r) => ({
      nombre: r.nombre,
      descripcion: r.descripcion,
      updatedAt: new Date(),
    }),
  },
};
