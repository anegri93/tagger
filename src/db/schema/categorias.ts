import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const categorias = pgTable('categorias', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Categoria = typeof categorias.$inferSelect;
export type CategoriaInsert = typeof categorias.$inferInsert;
