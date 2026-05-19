import { pgTable, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categorias } from './categorias.js';

export const mccPorNombre = pgTable(
  'mcc_por_nombre',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    nombreNormalizado: text('nombre_normalizado').notNull(),
    mcc: text('mcc').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    requiereRevision: boolean('requiere_revision').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mcc_por_nombre_norm_uq').on(t.nombreNormalizado),
    index('mcc_por_nombre_requiere_revision_idx')
      .on(t.requiereRevision)
      .where(sql`${t.requiereRevision} = true`),
  ],
);

export type MccPorNombre = typeof mccPorNombre.$inferSelect;
export type MccPorNombreInsert = typeof mccPorNombre.$inferInsert;
