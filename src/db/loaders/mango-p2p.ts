import { sql } from 'drizzle-orm';
import { comerciosCatalogo } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';
import { type LoaderConfig } from './csv.js';

interface MangoRow extends Record<string, string> {
  Nombre: string;
  BancardId: string;
  CodigoComercio: string;
  MCC: string;
}

interface MangoInsert extends Record<string, unknown> {
  nombre: string;
  nombreBancard: string | null;
  nombreNormalizado: string;
  bancardId: string | null;
  codigoComercio: string | null;
  categoriaId: string;
  mcc: string | null;
  mccOriginal: string | null;
  fuenteCategoria: 'regex';
  confianza: string;
  requiereRevision: boolean;
  evidencia: { patron: string };
}

export const mangoP2pLoaderConfig: LoaderConfig<MangoRow, MangoInsert> = {
  table: comerciosCatalogo,
  tableName: 'comercios_catalogo (mango-p2p)',
  file: 'data/mango-p2p.tsv',
  batchSize: 500,
  progressEvery: 5000,
  mapRow(row, ctx) {
    const nombre = row.Nombre?.trim();
    if (!nombre) return null;
    const categoriaId = ctx.resolveCategoria('transferencia');
    if (!categoriaId) {
      console.warn(`[mango-p2p] categoría 'transferencia' no existe — skip`);
      return null;
    }
    const mccRaw = row.MCC?.trim() ?? '';
    const mcc = mccRaw && mccRaw !== 'SIN RUBRO' && mccRaw !== 'null' ? mccRaw : null;
    return {
      nombre,
      nombreBancard: null,
      nombreNormalizado: normalize(nombre),
      bancardId: row.BancardId?.trim() || null,
      codigoComercio: row.CodigoComercio?.trim() || null,
      categoriaId,
      mcc,
      mccOriginal: mccRaw || null,
      fuenteCategoria: 'regex',
      confianza: '0.95',
      requiereRevision: false,
      evidencia: { patron: '^MANGO-' },
    };
  },
  batchUpsert: {
    target: [comerciosCatalogo.bancardId, comerciosCatalogo.codigoComercio],
    targetWhere: sql`${comerciosCatalogo.bancardId} IS NOT NULL`,
    set: {
      nombre: sql`excluded.nombre`,
      nombreNormalizado: sql`excluded.nombre_normalizado`,
      categoriaId: sql`excluded.categoria_id`,
      mcc: sql`excluded.mcc`,
      mccOriginal: sql`excluded.mcc_original`,
      fuenteCategoria: sql`excluded.fuente_categoria`,
      confianza: sql`excluded.confianza`,
      requiereRevision: sql`excluded.requiere_revision`,
      evidencia: sql`excluded.evidencia`,
      updatedAt: sql`now()`,
    },
  },
};
