import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';

export const marcasConocidas = pgTable(
  'marcas_conocidas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
    marca: text('marca').notNull(),
    descripcion: text('descripcion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('marcas_conocidas_marca_uniq').on(t.marca),
    index('marcas_conocidas_categoria_idx').on(t.categoriaId),
  ],
);

export type MarcaConocida = typeof marcasConocidas.$inferSelect;
export type MarcaConocidaInsert = typeof marcasConocidas.$inferInsert;
