import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const testGroundTruth = pgTable(
  'test_ground_truth',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: text('batch_id').notNull(),
    nombre: text('nombre').notNull(),
    nombreNormalizado: text('nombre_normalizado'),
    bancardId: text('bancard_id'),
    codigoComercio: text('codigo_comercio'),
    mcc: text('mcc'),
    combinedMcc: text('combined_mcc'),
    categoriaXlsx: text('categoria_xlsx'),
    sectorXlsx: text('sector_xlsx'),
    cantidad: integer('cantidad'),
    fuenteOrigen: text('fuente_origen').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('test_ground_truth_batch_nombre_uq').on(t.batchId, t.nombre),
    index('test_ground_truth_batch_idx').on(t.batchId),
    index('test_ground_truth_nombre_idx').on(t.nombre),
  ],
);

export type TestGroundTruth = typeof testGroundTruth.$inferSelect;
export type TestGroundTruthInsert = typeof testGroundTruth.$inferInsert;
