import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';

export const patronTipo = pgEnum('patron_tipo', ['regex', 'literal', 'prefijo', 'contiene']);
export const patronFuente = pgEnum('patron_fuente', ['manual', 'catalogo_bancard', 'auto']);

export const patrones = pgTable(
  'patrones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: patronTipo('tipo').notNull(),
    valor: text('valor').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    prioridad: integer('prioridad').notNull().default(100),
    activo: boolean('activo').notNull().default(true),
    fuente: patronFuente('fuente').notNull().default('manual'),
    descripcion: text('descripcion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('patrones_tipo_valor_categoria_uq').on(t.tipo, t.valor, t.categoriaId),
    index('patrones_activo_prioridad_idx').on(t.activo, t.prioridad),
  ],
);

export type Patron = typeof patrones.$inferSelect;
export type PatronInsert = typeof patrones.$inferInsert;
