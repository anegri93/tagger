import { and, eq, sql, desc } from 'drizzle-orm';
import type { Db } from '../client.js';
import { reglas, categorias, correccionesUsuario, movimientos } from '../schema/index.js';
import { normalize } from '../../domain/normalize.js';

export type ReglaTipo = 'literal' | 'contiene' | 'regex';

export interface ReglaCargada {
  id: string;
  scope: string;
  tipo: ReglaTipo;
  valor: string;
  valorNormalizado: string;
  categoriaId: string;
  prioridad: number;
  origen: string;
}

export interface ReglaPublica {
  id: string;
  scope: string;
  tipo: ReglaTipo;
  valor: string;
  valorNormalizado: string;
  categoriaId: string;
  categoriaSlug: string;
  prioridad: number;
  activo: boolean;
  hits: number;
  origen: string;
  descripcion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SugerenciaRegla {
  scope: string;
  valor: string;
  valorNormalizado: string;
  categoriaSlug: string;
  categoriaNombre: string;
  veces: number;
  ejemplos: string[];
}

export interface ReglasLoader {
  porScope(scope: string): Promise<ReglaCargada[]>;
}

export function crearReglasLoader(db: Db): ReglasLoader {
  return {
    async porScope(scope) {
      const rows = await db
        .select({
          id: reglas.id,
          scope: reglas.scope,
          tipo: reglas.tipo,
          valor: reglas.valor,
          valorNormalizado: reglas.valorNormalizado,
          categoriaId: reglas.categoriaId,
          prioridad: reglas.prioridad,
          origen: reglas.origen,
        })
        .from(reglas)
        .where(and(eq(reglas.scope, scope), eq(reglas.activo, true)));
      return rows.map((r) => ({ ...r, tipo: r.tipo as ReglaTipo }));
    },
  };
}

export interface ReglasWriter {
  listar(scope: string): Promise<ReglaPublica[]>;
  obtener(id: string): Promise<ReglaPublica | null>;
  crear(input: {
    scope: string;
    tipo: ReglaTipo;
    valor: string;
    categoriaSlug: string;
    prioridad?: number | undefined;
    descripcion?: string | null | undefined;
    origen?: string | undefined;
  }): Promise<ReglaPublica>;
  actualizar(
    id: string,
    input: { activo?: boolean | undefined; prioridad?: number | undefined },
  ): Promise<ReglaPublica | null>;
  eliminar(id: string): Promise<boolean>;
  eliminarPorScopeYValorNormalizado(scope: string, valorNormalizado: string): Promise<boolean>;
  incrementarHit(id: string): Promise<void>;
  sugerencias(scope: string, umbral?: number): Promise<SugerenciaRegla[]>;
}

function toPublica(r: typeof reglas.$inferSelect, slug: string): ReglaPublica {
  return {
    id: r.id,
    scope: r.scope,
    tipo: r.tipo as ReglaTipo,
    valor: r.valor,
    valorNormalizado: r.valorNormalizado,
    categoriaId: r.categoriaId,
    categoriaSlug: slug,
    prioridad: r.prioridad,
    activo: r.activo,
    hits: r.hits,
    origen: r.origen,
    descripcion: r.descripcion,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function crearReglasWriter(
  db: Db,
  invalidar?: (scope: string) => void,
): ReglasWriter {
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
    async listar(scope) {
      const rows = await db
        .select({ r: reglas, slug: categorias.slug })
        .from(reglas)
        .innerJoin(categorias, eq(categorias.id, reglas.categoriaId))
        .where(eq(reglas.scope, scope))
        .orderBy(reglas.prioridad);
      return rows.map((x) => toPublica(x.r, x.slug));
    },
    async obtener(id) {
      const rows = await db
        .select({ r: reglas, slug: categorias.slug })
        .from(reglas)
        .innerJoin(categorias, eq(categorias.id, reglas.categoriaId))
        .where(eq(reglas.id, id))
        .limit(1);
      const x = rows[0];
      return x ? toPublica(x.r, x.slug) : null;
    },
    async crear({ scope, tipo, valor, categoriaSlug, prioridad, descripcion, origen }) {
      const trimmed = valor.trim();
      if (trimmed.length < 2) throw new Error('valor_muy_corto');
      if (tipo === 'regex') {
        try {
          new RegExp(trimmed, 'i');
        } catch {
          throw new Error('regex_invalido');
        }
      }
      const categoriaId = await resolveCategoriaId(categoriaSlug);
      const valorNormalizado = normalize(trimmed);
      const ins = await db
        .insert(reglas)
        .values({
          scope,
          tipo,
          valor: trimmed,
          valorNormalizado,
          categoriaId,
          prioridad: prioridad ?? 100,
          descripcion: descripcion ?? null,
          origen: origen ?? 'manual',
        })
        .returning();
      const r = ins[0]!;
      invalidar?.(scope);
      return toPublica(r, categoriaSlug);
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.activo !== undefined) set.activo = input.activo;
      if (input.prioridad !== undefined) set.prioridad = input.prioridad;
      const upd = await db.update(reglas).set(set).where(eq(reglas.id, id)).returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = await db
        .select({ slug: categorias.slug })
        .from(categorias)
        .where(eq(categorias.id, r.categoriaId))
        .limit(1);
      invalidar?.(r.scope);
      return toPublica(r, slugRow[0]?.slug ?? '');
    },
    async eliminar(id) {
      const del = await db.delete(reglas).where(eq(reglas.id, id)).returning();
      if (del.length === 0) return false;
      invalidar?.(del[0]!.scope);
      return true;
    },
    async eliminarPorScopeYValorNormalizado(scope, valorNormalizado) {
      const del = await db
        .delete(reglas)
        .where(and(eq(reglas.scope, scope), eq(reglas.valorNormalizado, valorNormalizado)))
        .returning();
      if (del.length === 0) return false;
      invalidar?.(scope);
      return true;
    },
    async incrementarHit(id) {
      await db
        .update(reglas)
        .set({ hits: sql`${reglas.hits} + 1` })
        .where(eq(reglas.id, id));
    },
    async sugerencias(scope, umbral = 2) {
      const usuario = scope.startsWith('usuario:') ? scope.slice(8) : null;
      if (!usuario) return [];
      const rows = await db
        .select({
          nombreBancard: movimientos.nombreBancard,
          nombreComercio: movimientos.nombreComercio,
          categoriaSlug: categorias.slug,
          categoriaNombre: categorias.nombre,
        })
        .from(correccionesUsuario)
        .innerJoin(movimientos, eq(movimientos.id, correccionesUsuario.movimientoId))
        .innerJoin(categorias, eq(categorias.id, correccionesUsuario.categoriaNuevaId))
        .where(eq(correccionesUsuario.usuario, usuario))
        .orderBy(desc(correccionesUsuario.createdAt))
        .limit(500);

      const groups = new Map<
        string,
        {
          valor: string;
          valorNormalizado: string;
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
          g.veces++;
        } else {
          groups.set(key, {
            valor: raw,
            valorNormalizado: norm,
            ejemplos: new Set([raw]),
            categoriaSlug: r.categoriaSlug,
            categoriaNombre: r.categoriaNombre,
            veces: 1,
          });
        }
      }

      // Excluir las que ya tienen regla activa en este scope
      const existentes = await db
        .select({ vn: reglas.valorNormalizado })
        .from(reglas)
        .where(and(eq(reglas.scope, scope), eq(reglas.activo, true)));
      const existSet = new Set(existentes.map((e) => e.vn));

      const out: SugerenciaRegla[] = [];
      for (const g of groups.values()) {
        if (g.veces < umbral) continue;
        if (existSet.has(g.valorNormalizado)) continue;
        out.push({
          scope,
          valor: g.valor,
          valorNormalizado: g.valorNormalizado,
          categoriaSlug: g.categoriaSlug,
          categoriaNombre: g.categoriaNombre,
          veces: g.veces,
          ejemplos: [...g.ejemplos].slice(0, 3),
        });
      }
      out.sort((a, b) => b.veces - a.veces);
      return out;
    },
  };
}
