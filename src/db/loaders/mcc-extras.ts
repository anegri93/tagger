import { mccCatalogo } from '../schema/index.js';
import { type LoaderConfig } from './csv.js';

interface ExtraRow extends Record<string, string> {
  cod_mcc: string;
  descripcion: string;
  categoria_slug: string;
}

interface ExtraInsert {
  codMcc: string;
  descripcion: string | null;
  categoriaId: string | null;
  source: string;
}

export const mccExtrasLoaderConfig: LoaderConfig<ExtraRow, ExtraInsert> = {
  table: mccCatalogo,
  tableName: 'mcc_catalogo (extras)',
  file: 'data/mcc-extras.tsv',
  mapRow(row, ctx) {
    const codMcc = row.cod_mcc?.trim();
    if (!codMcc) return null;
    const slug = row.categoria_slug?.trim();
    const categoriaId = slug ? (ctx.resolveCategoria(slug) ?? null) : null;
    if (slug && !categoriaId) {
      console.warn(`[mcc-extras] slug '${slug}' inexistente, skip ${codMcc}`);
      return null;
    }
    return {
      codMcc,
      descripcion: row.descripcion?.trim() || null,
      categoriaId,
      source: 'mcc-extras',
    };
  },
  upsert: {
    target: mccCatalogo.codMcc,
    setUpdate: (r) => ({
      descripcion: r.descripcion,
      categoriaId: r.categoriaId,
      source: r.source,
      updatedAt: new Date(),
    }),
  },
};
