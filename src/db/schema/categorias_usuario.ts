import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categorias } from './categorias.js';

export const categoriasUsuario = pgTable(
  'categorias_usuario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: text('usuario_id').notNull(),
    canonicaId: uuid('canonica_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    nombre: text('nombre').notNull(),
    slug: text('slug').notNull(),
    emoji: text('emoji'),
    color: text('color'),
    activo: boolean('activo').notNull().default(true),
    origen: text('origen').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_categorias_usuario_slug').on(t.usuarioId, t.slug),
    index('idx_categorias_usuario_user_activo').on(t.usuarioId).where(sql`${t.activo}`),
    index('idx_categorias_usuario_canonica').on(t.canonicaId),
  ],
);

export type CategoriaUsuario = typeof categoriasUsuario.$inferSelect;
export type CategoriaUsuarioInsert = typeof categoriasUsuario.$inferInsert;
