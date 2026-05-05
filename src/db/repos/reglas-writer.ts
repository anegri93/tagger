import { eq, sql } from 'drizzle-orm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from '../client.js';
import { reglasRegex, categorias } from '../schema/index.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const EXTRAS_PATH = resolve(ROOT, 'data/reglas-extras.tsv');
const HEADER = 'patron\tcategoria_slug\tprioridad\tdescripcion\tactivo';

export interface ReglaPublica {
  id: string;
  patron: string;
  categoriaId: string;
  categoriaSlug: string;
  prioridad: number;
  descripcion: string | null;
  activo: boolean;
}

export interface ReglaWriter {
  listar(filterCategoriaSlug?: string): Promise<ReglaPublica[]>;
  crear(input: {
    patron: string;
    categoriaSlug: string;
    prioridad: number;
    descripcion?: string | null | undefined;
  }): Promise<ReglaPublica>;
  actualizar(
    id: string,
    input: {
      patron?: string | undefined;
      prioridad?: number | undefined;
      descripcion?: string | null | undefined;
      activo?: boolean | undefined;
      categoriaSlug?: string | undefined;
    },
  ): Promise<ReglaPublica | null>;
  eliminar(id: string): Promise<boolean>;
}

function readExtras(): Map<string, { patron: string; categoria_slug: string; prioridad: string; descripcion: string; activo: string }> {
  if (!existsSync(EXTRAS_PATH)) return new Map();
  const lines = readFileSync(EXTRAS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const out = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split('\t');
    const [patron, categoria_slug, prioridad, descripcion, activo] = cols;
    if (patron) out.set(patron, { patron, categoria_slug: categoria_slug ?? '', prioridad: prioridad ?? '100', descripcion: descripcion ?? '', activo: activo ?? '1' });
  }
  return out;
}

function writeExtras(rows: Array<{ patron: string; categoria_slug: string; prioridad: number; descripcion: string | null; activo: boolean }>): void {
  const lines = [HEADER];
  for (const r of rows) {
    lines.push(`${r.patron}\t${r.categoria_slug}\t${r.prioridad}\t${r.descripcion ?? ''}\t${r.activo ? '1' : '0'}`);
  }
  writeFileSync(EXTRAS_PATH, lines.join('\n') + '\n');
}

async function dumpAllExtras(db: Db): Promise<void> {
  const rows = await db
    .select({
      patron: reglasRegex.patron,
      categoria_slug: categorias.slug,
      prioridad: reglasRegex.prioridad,
      descripcion: reglasRegex.descripcion,
      activo: reglasRegex.activo,
    })
    .from(reglasRegex)
    .innerJoin(categorias, eq(reglasRegex.categoriaId, categorias.id));
  writeExtras(rows);
}

void readExtras;

export function crearReglaWriter(
  db: Db,
  invalidar?: () => void,
): ReglaWriter {
  return {
    async listar(filterCategoriaSlug) {
      const base = db
        .select({
          id: reglasRegex.id,
          patron: reglasRegex.patron,
          categoriaId: reglasRegex.categoriaId,
          categoriaSlug: categorias.slug,
          prioridad: reglasRegex.prioridad,
          descripcion: reglasRegex.descripcion,
          activo: reglasRegex.activo,
        })
        .from(reglasRegex)
        .innerJoin(categorias, eq(reglasRegex.categoriaId, categorias.id));
      const rows = filterCategoriaSlug
        ? await base.where(eq(categorias.slug, filterCategoriaSlug)).orderBy(reglasRegex.prioridad)
        : await base.orderBy(reglasRegex.prioridad);
      return rows;
    },
    async crear({ patron, categoriaSlug, prioridad, descripcion }) {
      const cat = await db
        .select({ id: categorias.id })
        .from(categorias)
        .where(eq(categorias.slug, categoriaSlug))
        .limit(1);
      if (cat.length === 0) throw new Error('categoria_inexistente');
      const ins = await db
        .insert(reglasRegex)
        .values({
          patron,
          categoriaId: cat[0]!.id,
          prioridad,
          descripcion: descripcion ?? null,
        })
        .returning();
      const r = ins[0]!;
      await dumpAllExtras(db);
      invalidar?.();
      return {
        id: r.id,
        patron: r.patron,
        categoriaId: r.categoriaId,
        categoriaSlug,
        prioridad: r.prioridad,
        descripcion: r.descripcion,
        activo: r.activo,
      };
    },
    async actualizar(id, input) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.patron !== undefined) set.patron = input.patron;
      if (input.prioridad !== undefined) set.prioridad = input.prioridad;
      if (input.descripcion !== undefined) set.descripcion = input.descripcion;
      if (input.activo !== undefined) set.activo = input.activo;
      if (input.categoriaSlug !== undefined) {
        const cat = await db
          .select({ id: categorias.id })
          .from(categorias)
          .where(eq(categorias.slug, input.categoriaSlug))
          .limit(1);
        if (cat.length === 0) throw new Error('categoria_inexistente');
        set.categoriaId = cat[0]!.id;
      }
      const upd = await db.update(reglasRegex).set(set).where(eq(reglasRegex.id, id)).returning();
      const r = upd[0];
      if (!r) return null;
      const slugRow = await db
        .select({ slug: categorias.slug })
        .from(categorias)
        .where(eq(categorias.id, r.categoriaId))
        .limit(1);
      await dumpAllExtras(db);
      invalidar?.();
      return {
        id: r.id,
        patron: r.patron,
        categoriaId: r.categoriaId,
        categoriaSlug: slugRow[0]?.slug ?? '',
        prioridad: r.prioridad,
        descripcion: r.descripcion,
        activo: r.activo,
      };
    },
    async eliminar(id) {
      const del = await db.delete(reglasRegex).where(eq(reglasRegex.id, id)).returning();
      if (del.length === 0) return false;
      await dumpAllExtras(db);
      invalidar?.();
      return true;
    },
  };
}

void sql;
