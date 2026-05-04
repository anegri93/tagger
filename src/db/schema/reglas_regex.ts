import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';

export const reglasRegex = pgTable(
  'reglas_regex',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patron: text('patron').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    prioridad: integer('prioridad').notNull().default(100),
    activo: boolean('activo').notNull().default(true),
    descripcion: text('descripcion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reglas_regex_activo_prioridad_idx').on(t.activo, t.prioridad)],
);

export type ReglaRegex = typeof reglasRegex.$inferSelect;
export type ReglaRegexInsert = typeof reglasRegex.$inferInsert;
