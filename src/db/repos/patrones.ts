import { eq, and, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { patrones, categorias } from '../schema/index.js';
import type { PatronesLoader, PatronCargado } from '../../layers/patrones.js';

export type PatronTipo = 'regex' | 'literal' | 'prefijo' | 'contiene';
export type PatronFuente = 'manual' | 'catalogo_bancard' | 'auto';

export interface PatronPublico {
  id: string;
  tipo: PatronTipo;
  valor: string;
  categoriaId: string;
  categoriaSlug: string;
  prioridad: number;
  activo: boolean;
  fuente: PatronFuente;
  descripcion: string | null;
}

export interface PatronWriter {
  listar(filter?: {
    categoriaSlug?: string;
    tipo?: PatronTipo;
    activo?: boolean;
  }): Promise<PatronPublico[]>;
  obtener(id: string): Promise<PatronPublico | null>;
  crear(input: {
    tipo: PatronTipo;
    valor: string;
    categoriaSlug: string;
    prioridad?: number;
    descripcion?: string | null | undefined;
    fuente?: PatronFuente;
  }): Promise<PatronPublico>;
  actualizar(
    id: string,
    input: {
      valor?: string | undefined;
      prioridad?: number | undefined;
      descripcion?: string | null | undefined;
      activo?: boolean | undefined;
      categoriaSlug?: string | undefined;
    },
  ): Promise<PatronPublico | null>;
  eliminar(id: string): Promise<boolean>;
  conflictos(): Promise<PatronConflicto[]>;
}

export interface PatronConflictoEntry {
  id: string;
  categoriaSlug: string;
  categoriaNombre: string;
  prioridad: number;
}

export interface PatronConflicto {
  tipo: PatronTipo;
  valor: string;
  entries: PatronConflictoEntry[];
}

export function crearPatronesLoader(db: Db): PatronesLoader {
  return {
    async cargar(): Promise<PatronCargado[]> {
      const rows = await db
        .select({
          id: patrones.id,
          tipo: patrones.tipo,
          valor: patrones.valor,
          categoriaId: patrones.categoriaId,
          prioridad: patrones.prioridad,
        })
        .from(patrones)
        .where(eq(patrones.activo, true));
      return rows;
    },
  };
}

export function validarRegex(valor: string): boolean {
  try {
    new RegExp(valor, 'i');
    return true;
  } catch {
    return false;
  }
}

export function crearPatronWriter(db: Db, invalidar?: () => void): PatronWriter {
  async function resolveCategoriaId(slug: string): Promise<string> {
    const cat = await db
      .select({ id: categorias.id })
      .from(categorias)
      .where(eq(categorias.slug, slug))
      .limit(1);
    if (cat.length === 0) throw new Error('categoria_inexistente');
    return cat[0]!.id;
  }

  function toPublico(r: typeof patrones.$inferSelect, slug: string): PatronPublico {
    return {
      id: r.id,
      tipo: r.tipo,
      valor: r.valor,
      categoriaId: r.categoriaId,
      categoriaSlug: slug,
      prioridad: r.prioridad,
      activo: r.activo,
      fuente: r.fuente,
      descripcion: r.descripcion,
    };
  }

  return {
    async listar(filter) {
      const where = [];
      if (filter?.categoriaSlug) where.push(eq(categorias.slug, filter.categoriaSlug));
      if (filter?.tipo) where.push(eq(patrones.tipo, filter.tipo));
      if (filter?.activo !== undefined) where.push(eq(patrones.activo, filter.activo));
      const base = db
        .select({
          id: patrones.id,
          tipo: patrones.tipo,
          valor: patrones.valor,
          categoriaId: patrones.categoriaId,
          categoriaSlug: categorias.slug,
          prioridad: patrones.prioridad,
          activo: patrones.activo,
          fuente: patrones.fuente,
          descripcion: patrones.descripcion,
        })
        .from(patrones)
        .innerJoin(categorias, eq(patrones.categoriaId, categorias.id));
      const rows =
        where.length > 0
          ? await base.where(and(...where)).orderBy(patrones.prioridad)
          : await base.orderBy(patrones.prioridad);
      return rows;
    },
    async obtener(id) {
      const rows = await db
        .select({
          id: patrones.id,
          tipo: patrones.tipo,
          valor: patrones.valor,
          categoriaId: patrones.categoriaId,
          categoriaSlug: categorias.slug,
          prioridad: patrones.prioridad,
          activo: patrones.activo,
          fuente: patrones.fuente,
          descripcion: patrones.descripcion,
        })
        .from(patrones)
        .innerJoin(categorias, eq(patrones.categoriaId, categorias.id))
        .where(eq(patrones.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async crear({ tipo, valor, categoriaSlug, prioridad, descripcion, fuente }) {
      if (tipo === 'regex' && !validarRegex(valor)) throw new Error('patron_invalido');
      const categoriaId = await resolveCategoriaId(categoriaSlug);
      const ins = await db
        .insert(patrones)
        .values({
          tipo,
          valor,
          categoriaId,
          prioridad: prioridad ?? 100,
          descripcion: descripcion ?? null,
          fuente: fuente ?? 'manual',
        })
        .returning();
      const r = ins[0]!;
      invalidar?.();
      return toPublico(r, categoriaSlug);
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.valor !== undefined) set.valor = input.valor;
      if (input.prioridad !== undefined) set.prioridad = input.prioridad;
      if (input.descripcion !== undefined) set.descripcion = input.descripcion;
      if (input.activo !== undefined) set.activo = input.activo;
      if (input.categoriaSlug !== undefined) {
        set.categoriaId = await resolveCategoriaId(input.categoriaSlug);
      }
      // Validar regex si se cambia el valor en patrón tipo regex
      if (input.valor !== undefined) {
        const existing = await db
          .select({ tipo: patrones.tipo })
          .from(patrones)
          .where(eq(patrones.id, id))
          .limit(1);
        if (existing[0]?.tipo === 'regex' && !validarRegex(input.valor)) {
          throw new Error('patron_invalido');
        }
      }
      const upd = await db.update(patrones).set(set).where(eq(patrones.id, id)).returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = await db
        .select({ slug: categorias.slug })
        .from(categorias)
        .where(eq(categorias.id, r.categoriaId))
        .limit(1);
      invalidar?.();
      return toPublico(r, slugRow[0]?.slug ?? '');
    },
    async eliminar(id) {
      const del = await db.delete(patrones).where(eq(patrones.id, id)).returning();
      if (del.length === 0) return false;
      invalidar?.();
      return true;
    },
    async conflictos() {
      const rows = await db.execute(sql`
        SELECT p.tipo, p.valor, p.id, p.prioridad,
               c.slug AS categoria_slug, c.nombre AS categoria_nombre
        FROM patrones p
        JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = true
          AND (p.tipo, p.valor) IN (
            SELECT tipo, valor FROM patrones
            WHERE activo = true
            GROUP BY tipo, valor
            HAVING count(DISTINCT categoria_id) > 1
          )
        ORDER BY p.tipo, p.valor, p.prioridad
      `);
      const grupos = new Map<string, PatronConflicto>();
      for (const r of rows.rows as Array<{
        tipo: PatronTipo;
        valor: string;
        id: string;
        prioridad: number;
        categoria_slug: string;
        categoria_nombre: string;
      }>) {
        const key = `${r.tipo}|${r.valor}`;
        let g = grupos.get(key);
        if (!g) {
          g = { tipo: r.tipo, valor: r.valor, entries: [] };
          grupos.set(key, g);
        }
        g.entries.push({
          id: r.id,
          categoriaSlug: r.categoria_slug,
          categoriaNombre: r.categoria_nombre,
          prioridad: r.prioridad,
        });
      }
      return [...grupos.values()];
    },
  };
}
