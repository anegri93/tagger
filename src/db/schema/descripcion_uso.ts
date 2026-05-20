import { pgTable, uuid, text, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';

export const descripcionUso = pgTable(
  'descripcion_uso',
  {
    usuarioId: text('usuario_id').notNull(),
    descripcionNormalizada: text('descripcion_normalizada').notNull(),
    descripcionOriginal: text('descripcion_original').notNull(),
    freq: integer('freq').notNull().default(1),
    catTopId: uuid('cat_top_id').references(() => categorias.id, { onDelete: 'set null' }),
    ultimaVezAt: timestamp('ultima_vez_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.descripcionNormalizada] }),
    index('idx_descripcion_uso_freq').on(t.usuarioId, t.freq),
  ],
);

export type DescripcionUso = typeof descripcionUso.$inferSelect;
export type DescripcionUsoInsert = typeof descripcionUso.$inferInsert;
