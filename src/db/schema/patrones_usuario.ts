import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { patronTipo } from './patrones.js';

export const patronesUsuario = pgTable(
  'patrones_usuario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuario: text('usuario').notNull(),
    tipo: patronTipo('tipo').notNull(),
    valor: text('valor').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
    prioridad: integer('prioridad').notNull().default(100),
    activo: boolean('activo').notNull().default(true),
    descripcion: text('descripcion'),
    hits: integer('hits').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('patrones_usuario_user_tipo_valor_uq').on(t.usuario, t.tipo, t.valor),
    index('patrones_usuario_user_activo_idx').on(t.usuario, t.activo, t.prioridad),
  ],
);

export type PatronUsuario = typeof patronesUsuario.$inferSelect;
export type PatronUsuarioInsert = typeof patronesUsuario.$inferInsert;
