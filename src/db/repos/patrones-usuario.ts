import { eq, and, sql, desc } from 'drizzle-orm';
import type { Db } from '../client.js';
import { patronesUsuario, categorias, correccionesUsuario, movimientos } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';
import { validarRegex } from './patrones.js';

export type PatronTipo = 'regex' | 'literal' | 'prefijo' | 'contiene';

export interface PatronUsuarioCargado {
  id: string;
  usuario: string;
  tipo: PatronTipo;
  valor: string;
  categoriaId: string;
  prioridad: number;
}

export interface PatronesUsuarioLoader {
  porUsuario(usuario: string): Promise<PatronUsuarioCargado[]>;
}

export function crearPatronesUsuarioLoader(db: Db): PatronesUsuarioLoader {
  return {
    async porUsuario(usuario) {
      const rows = await db
        .select({
          id: patronesUsuario.id,
          usuario: patronesUsuario.usuario,
          tipo: patronesUsuario.tipo,
          valor: patronesUsuario.valor,
          categoriaId: patronesUsuario.categoriaId,
          prioridad: patronesUsuario.prioridad,
        })
        .from(patronesUsuario)
        .where(and(eq(patronesUsuario.usuario, usuario), eq(patronesUsuario.activo, true)));
      return rows;
    },
  };
}

export interface PatronUsuarioPublico {
  id: string;
  usuario: string;
  tipo: PatronTipo;
  valor: string;
  categoriaId: string;
  categoriaSlug: string;
  prioridad: number;
  activo: boolean;
  descripcion: string | null;
  hits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SugerenciaPatron {
  usuario: string;
  nombreNormalizado: string;
  ejemplos: string[];
  categoriaSlug: string;
  categoriaNombre: string;
  veces: number;
}

export interface PatronesUsuarioWriter {
  listar(usuario: string): Promise<PatronUsuarioPublico[]>;
  crear(input: {
    usuario: string;
    tipo: PatronTipo;
    valor: string;
    categoriaSlug: string;
    prioridad?: number | undefined;
    descripcion?: string | null | undefined;
  }): Promise<PatronUsuarioPublico>;
  actualizar(
    id: string,
    input: { activo?: boolean | undefined; prioridad?: number | undefined },
  ): Promise<PatronUsuarioPublico | null>;
  eliminar(id: string): Promise<boolean>;
  incrementarHit(id: string): Promise<void>;
  sugerencias(usuario: string, umbral?: number): Promise<SugerenciaPatron[]>;
}

function toPublico(
  r: typeof patronesUsuario.$inferSelect,
  slug: string,
): PatronUsuarioPublico {
  return {
    id: r.id,
    usuario: r.usuario,
    tipo: r.tipo as PatronTipo,
    valor: r.valor,
    categoriaId: r.categoriaId,
    categoriaSlug: slug,
    prioridad: r.prioridad,
    activo: r.activo,
    descripcion: r.descripcion,
    hits: r.hits,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function crearPatronesUsuarioWriter(
  db: Db,
  invalidar?: (usuario: string) => void,
): PatronesUsuarioWriter {
  async function resolveCategoriaId(slug: string): Promise<string> {
    const cat = await db
      .select({ id: categorias.id })
      .from(categorias)
      .where(eq(categorias.slug, slug))
      .limit(1);
    if (cat.length === 0) throw new Error('categoria_inexistente');
    return cat[0]!.id;
  }

  return {
    async listar(usuario) {
      const rows = await db
        .select({
          p: patronesUsuario,
          slug: categorias.slug,
        })
        .from(patronesUsuario)
        .innerJoin(categorias, eq(categorias.id, patronesUsuario.categoriaId))
        .where(eq(patronesUsuario.usuario, usuario))
        .orderBy(patronesUsuario.prioridad);
      return rows.map((r) => toPublico(r.p, r.slug));
    },
    async crear({ usuario, tipo, valor, categoriaSlug, prioridad, descripcion }) {
      if (tipo === 'regex' && !validarRegex(valor)) throw new Error('patron_invalido');
      if (valor.trim().length < 2) throw new Error('valor_muy_corto');
      const categoriaId = await resolveCategoriaId(categoriaSlug);
      const ins = await db
        .insert(patronesUsuario)
        .values({
          usuario,
          tipo,
          valor,
          categoriaId,
          prioridad: prioridad ?? 100,
          descripcion: descripcion ?? null,
        })
        .returning();
      const r = ins[0]!;
      invalidar?.(usuario);
      return toPublico(r, categoriaSlug);
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.activo !== undefined) set.activo = input.activo;
      if (input.prioridad !== undefined) set.prioridad = input.prioridad;
      const upd = await db
        .update(patronesUsuario)
        .set(set)
        .where(eq(patronesUsuario.id, id))
        .returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = await db
        .select({ slug: categorias.slug })
        .from(categorias)
        .where(eq(categorias.id, r.categoriaId))
        .limit(1);
      invalidar?.(r.usuario);
      return toPublico(r, slugRow[0]?.slug ?? '');
    },
    async eliminar(id) {
      const del = await db.delete(patronesUsuario).where(eq(patronesUsuario.id, id)).returning();
      if (del.length === 0) return false;
      invalidar?.(del[0]!.usuario);
      return true;
    },
    async incrementarHit(id) {
      await db
        .update(patronesUsuario)
        .set({ hits: sql`${patronesUsuario.hits} + 1` })
        .where(eq(patronesUsuario.id, id));
    },
    async sugerencias(usuario, umbral = 2) {
      const rows = await db
        .select({
          nombreBancard: movimientos.nombreBancard,
          nombreComercio: movimientos.nombreComercio,
          categoriaNuevaId: correccionesUsuario.categoriaNuevaId,
          categoriaSlug: categorias.slug,
          categoriaNombre: categorias.nombre,
        })
        .from(correccionesUsuario)
        .innerJoin(movimientos, eq(movimientos.id, correccionesUsuario.movimientoId))
        .innerJoin(categorias, eq(categorias.id, correccionesUsuario.categoriaNuevaId))
        .where(eq(correccionesUsuario.usuario, usuario))
        .orderBy(desc(correccionesUsuario.createdAt))
        .limit(500);

      // Agrupar por nombre normalizado + categoría
      const groups = new Map<
        string,
        {
          nombreNormalizado: string;
          ejemplos: Set<string>;
          categoriaSlug: string;
          categoriaNombre: string;
          veces: number;
        }
      >();
      for (const r of rows) {
        const raw = r.nombreBancard ?? r.nombreComercio ?? '';
        const norm = normalize(raw);
        if (!norm) continue;
        const key = `${norm}|${r.categoriaSlug}`;
        const g = groups.get(key);
        if (g) {
          g.ejemplos.add(raw);
          g.veces += 1;
        } else {
          groups.set(key, {
            nombreNormalizado: norm,
            ejemplos: new Set([raw]),
            categoriaSlug: r.categoriaSlug,
            categoriaNombre: r.categoriaNombre,
            veces: 1,
          });
        }
      }

      // Excluir las que ya tienen patrón activo para ese usuario
      const yaExistentes = await db
        .select({ valor: patronesUsuario.valor })
        .from(patronesUsuario)
        .where(and(eq(patronesUsuario.usuario, usuario), eq(patronesUsuario.activo, true)));
      const existentesNorm = new Set(yaExistentes.map((p) => normalize(p.valor)));

      const sugerencias: SugerenciaPatron[] = [];
      for (const g of groups.values()) {
        if (g.veces < umbral) continue;
        if (existentesNorm.has(g.nombreNormalizado)) continue;
        sugerencias.push({
          usuario,
          nombreNormalizado: g.nombreNormalizado,
          ejemplos: [...g.ejemplos].slice(0, 3),
          categoriaSlug: g.categoriaSlug,
          categoriaNombre: g.categoriaNombre,
          veces: g.veces,
        });
      }
      sugerencias.sort((a, b) => b.veces - a.veces);
      return sugerencias;
    },
  };
}
