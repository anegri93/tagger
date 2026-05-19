import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const categorias = pgTable('categorias', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activo: boolean('activo').notNull().default(true),
  reemplazadaPorId: uuid('reemplazada_por_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categoriasAlias = pgTable(
  'categorias_alias',
  {
    slugAntiguo: text('slug_antiguo').primaryKey(),
    categoriaId: uuid('categoria_id').notNull(),
    motivo: text('motivo'),
    creadaAt: timestamp('creada_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_categorias_alias_categoria').on(t.categoriaId)],
);

export type Categoria = typeof categorias.$inferSelect;
export type CategoriaInsert = typeof categorias.$inferInsert;
export type CategoriaAlias = typeof categoriasAlias.$inferSelect;
