import { eq } from 'drizzle-orm';
import { mccCatalogo } from '../schema/index.js';
import { type LoaderConfig } from './csv.js';

interface McCategoriaRow extends Record<string, string> {
  cod_mcc: string;
  descripcion: string;
  categoria_slug: string;
}

interface McCategoriaUpdate {
  codMcc: string;
  categoriaId: string;
}

export const mccCategoriaLoaderConfig: LoaderConfig<McCategoriaRow, McCategoriaUpdate> = {
  table: mccCatalogo,
  tableName: 'mcc_catalogo (mapping)',
  file: 'data/mcc-categoria-mapping.tsv',
  mapRow(row, ctx) {
    const codMcc = row.cod_mcc?.trim();
    const slug = row.categoria_slug?.trim();
    if (!codMcc || !slug) return null;
    const categoriaId = ctx.resolveCategoria(slug);
    if (!categoriaId) {
      console.warn(`[mcc-categoria] slug '${slug}' inexistente → skip ${codMcc}`);
      return null;
    }
    return { codMcc, categoriaId };
  },
  async customInsert(row, ctx) {
    const res = await ctx.db
      .update(mccCatalogo)
      .set({ categoriaId: row.categoriaId, updatedAt: new Date() })
      .where(eq(mccCatalogo.codMcc, row.codMcc))
      .returning({ id: mccCatalogo.codMcc });
    return res.length > 0 ? 'updated' : 'skipped';
  },
};
