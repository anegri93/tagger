import { marcasConocidas } from '../schema/index.js';
import { type LoaderConfig } from './csv.js';

interface SeedRow extends Record<string, string> {
  marca: string;
  categoria_slug: string;
}

interface SeedInsert {
  marca: string;
  categoriaId: string;
  descripcion: string | null;
}

const SEED: SeedRow[] = [
  // Supermercado
  ...['BIGGIE', 'SUPERSEIS', 'SUPER 6', 'STOCK', 'SALEMMA', 'AREA UNO', 'CASA RICA', 'LOS JARDINES', 'NUESTRA CASA', 'REAL', 'GRANJA', 'COMERCIAL', 'CIAL', 'HIPER', 'SUPER'].map((m) => ({ marca: m, categoria_slug: 'supermercado' })),
  // Alimentación
  ...['AMANDAU', 'GRIDO', 'MBURUCUYA', 'CHIPERIA', 'HELADERIA', 'CONFITERIA', 'PANADERIA'].map((m) => ({ marca: m, categoria_slug: 'alimentacion' })),
  // Combustible
  ...['COPETROL', 'SHELL', 'PETROBRAS', 'PUMA', 'ESSO', 'BARCOS Y RODADOS', 'MONTE ALTO', 'ENERGY'].map((m) => ({ marca: m, categoria_slug: 'combustible' })),
  // Farmacia
  ...['PUNTO FARMA', 'FARMACENTER', 'FARMA OLIVA', 'FARMATOTAL', 'BRISTOL', 'CATEDRAL', 'FARMACIA', 'DROGUERIA', 'BOTICA'].map((m) => ({ marca: m, categoria_slug: 'farmacia' })),
  // Restaurante
  ...['MC DONALDS', 'BURGER KING', 'KFC', 'PIZZA HUT', 'DELIPOLLO', 'HAMBURG', 'PIZZERIA', 'RESTAURANT', 'PARRILLA', 'LOMITERIA'].map((m) => ({ marca: m, categoria_slug: 'restaurante' })),
  // Transporte
  ...['MUV', 'UBER', 'BOLT', 'TAXI', 'REMIS'].map((m) => ({ marca: m, categoria_slug: 'transporte' })),
  // Entretenimiento
  ...['NETFLIX', 'SPOTIFY', 'DISNEY', 'HBO', 'AMAZON PRIME'].map((m) => ({ marca: m, categoria_slug: 'entretenimiento' })),
  // Servicios
  ...['ANDE', 'ESSAP', 'COPACO', 'TIGO', 'PERSONAL', 'CLARO', 'CABLE'].map((m) => ({ marca: m, categoria_slug: 'servicios' })),
  // Azar
  ...['AZAR LATINO', 'SLOTS', 'GIRO WIN', 'SOLBET', 'BETSAT', 'CASINO', 'TRAGAMONEDA', 'APUESTA'].map((m) => ({ marca: m, categoria_slug: 'azar' })),
  // Transferencia
  { marca: 'MANGO', categoria_slug: 'transferencia' },
];

export const marcasLoaderConfig: LoaderConfig<SeedRow, SeedInsert> = {
  table: marcasConocidas,
  tableName: 'marcas_conocidas',
  data: SEED,
  mapRow(row, ctx) {
    const categoriaId = ctx.resolveCategoria(row.categoria_slug);
    if (!categoriaId) {
      console.warn(`[marcas] slug '${row.categoria_slug}' inexistente, skip ${row.marca}`);
      return null;
    }
    return { marca: row.marca, categoriaId, descripcion: null };
  },
  upsert: {
    target: marcasConocidas.marca,
    setUpdate: (r) => ({ categoriaId: r.categoriaId, updatedAt: new Date() }),
  },
};
