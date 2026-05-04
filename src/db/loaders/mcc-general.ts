import { mccCatalogo } from '../schema/index.js';
import { type LoaderConfig } from './csv.js';

interface McGeneralRow extends Record<string, string> {
  MCC: string;
  'MCC Descripción': string;
}

interface McGeneralInsert {
  codMcc: string;
  descripcion: string | null;
  source: string;
}

export const mccGeneralLoaderConfig: LoaderConfig<McGeneralRow, McGeneralInsert> = {
  table: mccCatalogo,
  tableName: 'mcc_catalogo',
  file: 'data/mcc-general.tsv',
  mapRow(row) {
    const codMcc = row.MCC?.trim();
    if (!codMcc) return null;
    const descripcion = row['MCC Descripción']?.trim() ?? null;
    return {
      codMcc,
      descripcion: descripcion || null,
      source: 'mcc-general',
    };
  },
  upsert: {
    target: mccCatalogo.codMcc,
    setUpdate: (r) => ({
      descripcion: r.descripcion,
      source: r.source,
      updatedAt: new Date(),
    }),
  },
};
