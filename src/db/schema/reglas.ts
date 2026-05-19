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

export const reglas = pgTable(
  'reglas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(), // 'global' | 'usuario:<usuario>'
    tipo: text('tipo').notNull(), // 'literal' | 'contiene' | 'regex'
    valor: text('valor').notNull(),
    valorNormalizado: text('valor_normalizado').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
    prioridad: integer('prioridad').notNull().default(100),
    activo: boolean('activo').notNull().default(true),
    hits: integer('hits').notNull().default(0),
    origen: text('origen').notNull().default('manual'),
    descripcion: text('descripcion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reglas_scope_tipo_norm_uq').on(t.scope, t.tipo, t.valorNormalizado),
    index('reglas_scope_activo_idx').on(t.scope, t.activo, t.prioridad),
    index('reglas_valor_norm_idx').on(t.valorNormalizado),
  ],
);

export type Regla = typeof reglas.$inferSelect;
export type ReglaInsert = typeof reglas.$inferInsert;
export type ReglaTipo = 'literal' | 'contiene' | 'regex';
