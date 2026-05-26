import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { categorias, categoriasUsuario } from '../schema/index.js';
import type { SubcategoriaResolverPort, SubcategoriaPublica } from '../../api/routes/movimiento-get.js';

export interface CategoriaUsuarioPublica {
  id: string;
  usuario_id: string;
  canonica_id: string;
  canonica_slug: string;
  canonica_nombre: string;
  nombre: string;
  slug: string;
  emoji: string | null;
  color: string | null;
  activo: boolean;
  origen: string;
  created_at: string;
}

export interface CategoriaUsuarioRepo {
  /** Lista activas del usuario, con datos de la canónica padre. */
  listar(usuarioId: string): Promise<CategoriaUsuarioPublica[]>;
  /** Resuelve por id. Devuelve también la canónica padre. */
  porId(id: string): Promise<CategoriaUsuarioPublica | null>;
  /** Crea subcat. Valida: canónica activa+no reemplazada, slug único, nombre≠canon, cap 200. */
  crear(input: {
    usuarioId: string;
    canonicaId: string;
    nombre: string;
    slug: string;
    emoji?: string | null;
    color?: string | null;
  }): Promise<CategoriaUsuarioPublica>;
  /** Edita campos mutables. No permite cambiar usuario_id ni canonica_id. */
  actualizar(
    id: string,
    input: {
      nombre?: string | undefined;
      emoji?: string | null | undefined;
      color?: string | null | undefined;
      activo?: boolean | undefined;
    },
  ): Promise<CategoriaUsuarioPublica | null>;
  /** Hard delete. FK SET NULL en movimientos.subcategoria_usuario_id. */
  eliminar(id: string): Promise<boolean>;
}

export class CategoriaUsuarioError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const CAP_POR_USUARIO = 200;

function mapRow(row: {
  id: string;
  usuario_id: string;
  canonica_id: string;
  canonica_slug: string;
  canonica_nombre: string;
  nombre: string;
  slug: string;
  emoji: string | null;
  color: string | null;
  activo: boolean;
  origen: string;
  created_at: Date;
}): CategoriaUsuarioPublica {
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    canonica_id: row.canonica_id,
    canonica_slug: row.canonica_slug,
    canonica_nombre: row.canonica_nombre,
    nombre: row.nombre,
    slug: row.slug,
    emoji: row.emoji,
    color: row.color,
    activo: row.activo,
    origen: row.origen,
    created_at: row.created_at.toISOString(),
  };
}

export function crearCategoriaUsuarioRepo(db: Db): CategoriaUsuarioRepo {
  return {
    async listar(usuarioId) {
      const rows = await db
        .select({
          id: categoriasUsuario.id,
          usuario_id: categoriasUsuario.usuarioId,
          canonica_id: categoriasUsuario.canonicaId,
          canonica_slug: categorias.slug,
          canonica_nombre: categorias.nombre,
          nombre: categoriasUsuario.nombre,
          slug: categoriasUsuario.slug,
          emoji: categoriasUsuario.emoji,
          color: categoriasUsuario.color,
          activo: categoriasUsuario.activo,
          origen: categoriasUsuario.origen,
          created_at: categoriasUsuario.createdAt,
        })
        .from(categoriasUsuario)
        .innerJoin(categorias, eq(categorias.id, categoriasUsuario.canonicaId))
        .where(
          and(eq(categoriasUsuario.usuarioId, usuarioId), eq(categoriasUsuario.activo, true)),
        )
        .orderBy(categoriasUsuario.nombre);
      return rows.map(mapRow);
    },

    async porId(id) {
      const rows = await db
        .select({
          id: categoriasUsuario.id,
          usuario_id: categoriasUsuario.usuarioId,
          canonica_id: categoriasUsuario.canonicaId,
          canonica_slug: categorias.slug,
          canonica_nombre: categorias.nombre,
          nombre: categoriasUsuario.nombre,
          slug: categoriasUsuario.slug,
          emoji: categoriasUsuario.emoji,
          color: categoriasUsuario.color,
          activo: categoriasUsuario.activo,
          origen: categoriasUsuario.origen,
          created_at: categoriasUsuario.createdAt,
        })
        .from(categoriasUsuario)
        .innerJoin(categorias, eq(categorias.id, categoriasUsuario.canonicaId))
        .where(eq(categoriasUsuario.id, id))
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async crear({ usuarioId, canonicaId, nombre, slug, emoji, color }) {
      // 1. Validar canónica activa y no reemplazada.
      const canonRows = await db
        .select({
          id: categorias.id,
          nombre: categorias.nombre,
          activo: categorias.activo,
          reemplazadaPorId: categorias.reemplazadaPorId,
        })
        .from(categorias)
        .where(eq(categorias.id, canonicaId))
        .limit(1);
      const canon = canonRows[0];
      if (!canon) {
        throw new CategoriaUsuarioError('canonica_no_existe', 'Canónica padre no existe.');
      }
      if (!canon.activo || canon.reemplazadaPorId) {
        throw new CategoriaUsuarioError(
          'canonica_inactiva',
          'Canónica padre inactiva o reemplazada.',
        );
      }

      // 2. Nombre ≠ canónica padre.
      if (nombre.trim().toLowerCase() === canon.nombre.trim().toLowerCase()) {
        throw new CategoriaUsuarioError(
          'nombre_igual_canonica',
          'El nombre no puede ser igual al de la canónica padre.',
        );
      }

      // 3. Cap por usuario.
      const countRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(categoriasUsuario)
        .where(
          and(eq(categoriasUsuario.usuarioId, usuarioId), eq(categoriasUsuario.activo, true)),
        );
      const count = Number(countRows[0]?.c ?? 0);
      if (count >= CAP_POR_USUARIO) {
        throw new CategoriaUsuarioError(
          'cap_alcanzado',
          `Llegaste al máximo de ${CAP_POR_USUARIO} categorías.`,
        );
      }

      // 4. Insertar. Slug único per user via UNIQUE INDEX → si colisiona, error 23505.
      try {
        const rows = await db
          .insert(categoriasUsuario)
          .values({
            usuarioId,
            canonicaId,
            nombre: nombre.trim(),
            slug: slug.trim().toLowerCase(),
            emoji: emoji ?? null,
            color: color ?? null,
          })
          .returning();
        const r = rows[0];
        if (!r) throw new Error('insert sin id');
        const full = await this.porId(r.id);
        if (!full) throw new Error('no se pudo leer subcat creada');
        return full;
      } catch (e) {
        const msg = (e as { code?: string; message?: string }).code === '23505'
          ? 'slug_duplicado'
          : null;
        if (msg) {
          throw new CategoriaUsuarioError(
            'slug_duplicado',
            'Ya tenés una categoría con ese slug.',
          );
        }
        throw e;
      }
    },

    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.nombre !== undefined) set.nombre = input.nombre.trim();
      if (input.emoji !== undefined) set.emoji = input.emoji;
      if (input.color !== undefined) set.color = input.color;
      if (input.activo !== undefined) set.activo = input.activo;
      const rows = await db
        .update(categoriasUsuario)
        .set(set)
        .where(eq(categoriasUsuario.id, id))
        .returning({ id: categoriasUsuario.id });
      if (rows.length === 0) return null;
      return await this.porId(id);
    },

    async eliminar(id) {
      const rows = await db
        .delete(categoriasUsuario)
        .where(eq(categoriasUsuario.id, id))
        .returning({ id: categoriasUsuario.id });
      return rows.length > 0;
    },
  };
}

/** Resolver para inflar subcats en listados/details de mov. */
export function crearSubcategoriaResolver(db: Db): SubcategoriaResolverPort {
  return {
    async porIds(ids) {
      const clean = [...new Set(ids.filter((x): x is string => Boolean(x)))];
      if (clean.length === 0) return new Map<string, SubcategoriaPublica>();
      const rows = await db
        .select({
          id: categoriasUsuario.id,
          nombre: categoriasUsuario.nombre,
          slug: categoriasUsuario.slug,
          emoji: categoriasUsuario.emoji,
          color: categoriasUsuario.color,
          canonica_id: categoriasUsuario.canonicaId,
        })
        .from(categoriasUsuario)
        .where(inArray(categoriasUsuario.id, clean));
      const out = new Map<string, SubcategoriaPublica>();
      for (const r of rows) out.set(r.id, r);
      return out;
    },
  };
}
