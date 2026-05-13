import { pgTable, uuid, text, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';

export const memoriaUsuarioDestinatario = pgTable(
  'memoria_usuario_destinatario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuario: text('usuario').notNull(),
    destinatario: text('destinatario').notNull(),
    destinatarioNormalizado: text('destinatario_normalizado').notNull(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
    origen: text('origen').notNull().default('correccion'),
    hits: integer('hits').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('memoria_usuario_dest_norm_uq').on(t.usuario, t.destinatarioNormalizado)],
);

export type MemoriaUsuarioDestinatario = typeof memoriaUsuarioDestinatario.$inferSelect;
export type MemoriaUsuarioDestinatarioInsert = typeof memoriaUsuarioDestinatario.$inferInsert;
