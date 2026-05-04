import { pgTable, text, uuid, boolean, timestamp } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';

export const mccCatalogo = pgTable('mcc_catalogo', {
  codMcc: text('cod_mcc').primaryKey(),
  codRubro: text('cod_rubro'),
  descRubro: text('desc_rubro'),
  descripcion: text('descripcion'),
  categoriaId: uuid('categoria_id').references(() => categorias.id, { onDelete: 'set null' }),
  ambiguo: boolean('ambiguo').notNull().default(false),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Mcc = typeof mccCatalogo.$inferSelect;
export type MccInsert = typeof mccCatalogo.$inferInsert;
