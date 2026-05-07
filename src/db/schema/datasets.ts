import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  numeric,
} from 'drizzle-orm/pg-core';
import { categorias } from './categorias.js';
import { fuenteCategoriaEnum } from './movimientos.js';

export const datasets = pgTable('datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const datasetComercios = pgTable(
  'dataset_comercios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    categoriaId: uuid('categoria_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    categoriaSlug: text('categoria_slug'),
    categoriaNuevaId: uuid('categoria_nueva_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    categoriaNuevaSlug: text('categoria_nueva_slug'),
    fuenteNueva: fuenteCategoriaEnum('fuente_nueva'),
    confianzaNueva: numeric('confianza_nueva', { precision: 3, scale: 2 }),
    recategorizadoAt: timestamp('recategorizado_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dataset_comercios_unico').on(t.datasetId, t.nombre),
    index('dataset_comercios_dataset_idx').on(t.datasetId),
    index('dataset_comercios_recat_idx').on(t.datasetId, t.recategorizadoAt),
  ],
);

export type Dataset = typeof datasets.$inferSelect;
export type DatasetComercio = typeof datasetComercios.$inferSelect;
