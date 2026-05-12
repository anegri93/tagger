import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categorias } from './categorias.js';

export type Evidencia = {
  regla_id?: string;
  patron?: string;
  comercio_id?: string;
  match_type?: 'bancard' | 'nombre_exacto' | 'nombre_parcial';
  match_score?: number;
  mcc_match?: string;
  mcc_inferido?: boolean;
  mcc_inferido_por_nombre?: boolean;
  marca?: string;
  bypass_catalogo?: boolean;
  ia_prompt?: string;
  ia_response?: string;
};

export const fuenteCategoriaEnum = pgEnum('fuente_categoria', [
  'regex',
  'bancard',
  'nombre',
  'mcc',
  'ia',
  'manual',
  'patrones',
  'literal',
  'prefijo',
  'contiene',
]);

export const movimientos = pgTable(
  'movimientos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    descripcion: text('descripcion'),
    nombreComercio: text('nombre_comercio'),
    nombreBancard: text('nombre_bancard'),
    mcc: text('mcc'),
    monto: numeric('monto', { precision: 18, scale: 2 }),
    categoriaPredichaId: uuid('categoria_predicha_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    categoriaConfirmadaId: uuid('categoria_confirmada_id').references(() => categorias.id, {
      onDelete: 'set null',
    }),
    fuenteCategoria: fuenteCategoriaEnum('fuente_categoria'),
    confianza: numeric('confianza', { precision: 3, scale: 2 }),
    requiereRevision: boolean('requiere_revision').notNull().default(false),
    rawInput: jsonb('raw_input'),
    evidencia: jsonb('evidencia').$type<Evidencia>(),
    origen: text('origen').notNull().default('api'),
    batchId: text('batch_id'),
    bancardId: text('bancard_id'),
    codigoComercio: text('codigo_comercio'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('movimientos_created_at_idx').on(t.createdAt),
    index('movimientos_requiere_revision_idx').on(t.requiereRevision),
    index('movimientos_batch_id_idx').on(t.batchId).where(sql`${t.batchId} IS NOT NULL`),
    index('movimientos_origen_idx').on(t.origen),
  ],
);

export type Movimiento = typeof movimientos.$inferSelect;
export type MovimientoInsert = typeof movimientos.$inferInsert;
export type FuenteCategoria = (typeof fuenteCategoriaEnum.enumValues)[number];
