import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  numeric,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categorias } from './categorias.js';
import { fuenteCategoriaEnum, type Evidencia } from './movimientos.js';

export const comerciosCatalogo = pgTable(
  'comercios_catalogo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    nombreBancard: text('nombre_bancard'),
    nombreNormalizado: text('nombre_normalizado').notNull(),
    bancardId: text('bancard_id'),
    codigoComercio: text('codigo_comercio'),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    mcc: text('mcc'),
    mccOriginal: text('mcc_original'),
    fuenteCategoria: fuenteCategoriaEnum('fuente_categoria'),
    confianza: numeric('confianza', { precision: 3, scale: 2 }),
    requiereRevision: boolean('requiere_revision').notNull().default(false),
    evidencia: jsonb('evidencia').$type<Evidencia>(),
    marca: text('marca'),
    mccInferido: boolean('mcc_inferido').notNull().default(false),
    categoriaNuevaId: uuid('categoria_nueva_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    fuenteNueva: fuenteCategoriaEnum('fuente_nueva'),
    confianzaNueva: numeric('confianza_nueva', { precision: 3, scale: 2 }),
    evidenciaNueva: jsonb('evidencia_nueva').$type<Evidencia>(),
    recategorizadoAt: timestamp('recategorizado_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('comercios_nombre_bancard_uniq')
      .on(t.nombreBancard)
      .where(sql`${t.nombreBancard} IS NOT NULL`),
    uniqueIndex('comercios_bancard_codigo_uniq')
      .on(t.bancardId, t.codigoComercio)
      .where(sql`${t.bancardId} IS NOT NULL`),
    index('comercios_nombre_normalizado_idx').on(t.nombreNormalizado),
    index('comercios_requiere_revision_idx')
      .on(t.requiereRevision)
      .where(sql`${t.requiereRevision} = true`),
    index('comercios_marca_idx').on(t.marca),
  ],
);

export type Comercio = typeof comerciosCatalogo.$inferSelect;
export type ComercioInsert = typeof comerciosCatalogo.$inferInsert;
