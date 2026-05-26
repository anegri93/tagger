import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { categoriasUsuario } from './categorias_usuario.js';
import { movimientos } from './movimientos.js';

export const correccionesUsuario = pgTable(
  'correcciones_usuario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    movimientoId: uuid('movimiento_id')
      .notNull()
      .references(() => movimientos.id, { onDelete: 'cascade' }),
    categoriaAnteriorId: uuid('categoria_anterior_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    categoriaNuevaId: uuid('categoria_nueva_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    subcategoriaUsuarioId: uuid('subcategoria_usuario_id').references(() => categoriasUsuario.id, {
      onDelete: 'set null',
    }),
    usuario: text('usuario'),
    motivo: text('motivo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('correcciones_movimiento_idx').on(t.movimientoId)],
);

export type Correccion = typeof correccionesUsuario.$inferSelect;
export type CorreccionInsert = typeof correccionesUsuario.$inferInsert;
