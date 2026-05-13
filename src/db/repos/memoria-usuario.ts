import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { memoriaUsuarioDestinatario, categorias } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';

export interface MemoriaEntry {
  categoriaId: string;
  categoriaSlug: string;
  categoriaNombre: string;
  destinatario: string;
  hits: number;
}

export interface MemoriaUsuarioLookup {
  buscar(usuario: string, destinatarioNormalizado: string): Promise<MemoriaEntry | null>;
}

export function crearMemoriaUsuarioLookup(db: Db): MemoriaUsuarioLookup {
  return {
    async buscar(usuario, destinatarioNormalizado) {
      const rows = await db
        .select({
          categoriaId: memoriaUsuarioDestinatario.categoriaId,
          categoriaSlug: categorias.slug,
          categoriaNombre: categorias.nombre,
          destinatario: memoriaUsuarioDestinatario.destinatario,
          hits: memoriaUsuarioDestinatario.hits,
        })
        .from(memoriaUsuarioDestinatario)
        .innerJoin(categorias, eq(categorias.id, memoriaUsuarioDestinatario.categoriaId))
        .where(
          and(
            eq(memoriaUsuarioDestinatario.usuario, usuario),
            eq(memoriaUsuarioDestinatario.destinatarioNormalizado, destinatarioNormalizado),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return r;
    },
  };
}

export interface MemoriaUpsertInput {
  usuario: string;
  destinatario: string;
  categoriaId: string;
  origen?: 'correccion' | 'manual';
}

export interface MemoriaListItem {
  destinatario: string;
  destinatarioNormalizado: string;
  categoriaSlug: string;
  categoriaNombre: string;
  hits: number;
  updatedAt: Date;
}

export interface MemoriaUsuarioWriter {
  upsert(input: MemoriaUpsertInput): Promise<{ id: string; created: boolean }>;
  listar(usuario: string): Promise<MemoriaListItem[]>;
  eliminar(usuario: string, destinatarioNormalizado: string): Promise<boolean>;
}

export function crearMemoriaUsuarioWriter(db: Db): MemoriaUsuarioWriter {
  return {
    async upsert(input) {
      const destNorm = normalize(input.destinatario);
      if (!destNorm) throw new Error('destinatario_invalido');
      const result = await db
        .insert(memoriaUsuarioDestinatario)
        .values({
          usuario: input.usuario,
          destinatario: input.destinatario.trim(),
          destinatarioNormalizado: destNorm,
          categoriaId: input.categoriaId,
          origen: input.origen ?? 'correccion',
        })
        .onConflictDoUpdate({
          target: [
            memoriaUsuarioDestinatario.usuario,
            memoriaUsuarioDestinatario.destinatarioNormalizado,
          ],
          set: {
            categoriaId: input.categoriaId,
            hits: sql`${memoriaUsuarioDestinatario.hits} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: memoriaUsuarioDestinatario.id,
          hits: memoriaUsuarioDestinatario.hits,
        });
      const row = result[0];
      if (!row) throw new Error('upsert_sin_resultado');
      return { id: row.id, created: row.hits === 1 };
    },
    async listar(usuario) {
      const rows = await db
        .select({
          destinatario: memoriaUsuarioDestinatario.destinatario,
          destinatarioNormalizado: memoriaUsuarioDestinatario.destinatarioNormalizado,
          categoriaSlug: categorias.slug,
          categoriaNombre: categorias.nombre,
          hits: memoriaUsuarioDestinatario.hits,
          updatedAt: memoriaUsuarioDestinatario.updatedAt,
        })
        .from(memoriaUsuarioDestinatario)
        .innerJoin(categorias, eq(categorias.id, memoriaUsuarioDestinatario.categoriaId))
        .where(eq(memoriaUsuarioDestinatario.usuario, usuario))
        .orderBy(memoriaUsuarioDestinatario.updatedAt);
      return rows;
    },
    async eliminar(usuario, destinatarioNormalizado) {
      const result = await db
        .delete(memoriaUsuarioDestinatario)
        .where(
          and(
            eq(memoriaUsuarioDestinatario.usuario, usuario),
            eq(memoriaUsuarioDestinatario.destinatarioNormalizado, destinatarioNormalizado),
          ),
        )
        .returning({ id: memoriaUsuarioDestinatario.id });
      return result.length > 0;
    },
  };
}
