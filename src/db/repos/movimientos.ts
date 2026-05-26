import { eq, desc, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { movimientos } from '../schema/index.js';
import type { MovimientoRepository, MovimientoNuevo } from '../../pipeline/persistir.js';
import type { MovimientoUpdater } from '../../pipeline/ia-fallback.js';
import type {
  MovimientoReader,
  MovimientoGetData,
  MovimientoLister,
} from '../../api/routes/movimiento-get.js';
import type { Evidencia, FuenteCategoria } from '../schema/movimientos.js';

export function crearMovimientoRepository(db: Db): MovimientoRepository {
  return {
    async insertar(data: MovimientoNuevo) {
      const rows = await db
        .insert(movimientos)
        .values({
          descripcion: data.descripcion,
          nombreComercio: data.nombreComercio,
          nombreBancard: data.nombreBancard,
          mcc: data.mcc,
          monto: data.monto,
          categoriaPredichaId: data.categoriaPredichaId,
          subcategoriaUsuarioId: data.subcategoriaUsuarioId ?? null,
          fuenteCategoria: data.fuenteCategoria,
          confianza: data.confianza,
          requiereRevision: data.requiereRevision,
          rawInput: data.rawInput,
          evidencia: data.evidencia as Evidencia | null,
          origen: data.origen,
          batchId: data.batchId,
          bancardId: data.bancardId,
          codigoComercio: data.codigoComercio,
          latencyMs: data.latencyMs,
        })
        .returning({ id: movimientos.id });
      const id = rows[0]?.id;
      if (!id) throw new Error('insert movimiento sin id');
      return { id };
    },
  };
}

export function crearMovimientoUpdater(db: Db): MovimientoUpdater {
  return {
    async actualizarPrediccion(movimientoId, data) {
      await db
        .update(movimientos)
        .set({
          categoriaPredichaId: data.categoriaId,
          fuenteCategoria: data.fuente as FuenteCategoria,
          confianza: data.confianza.toFixed(2),
          evidencia: data.evidencia as Evidencia,
          updatedAt: new Date(),
        })
        .where(eq(movimientos.id, movimientoId));
    },
  };
}

export interface MovimientoReprocesadorData {
  categoriaPredichaId: string | null;
  fuenteCategoria: FuenteCategoria | null;
  confianza: string | null;
  requiereRevision: boolean;
  evidencia: Evidencia | null;
}

export interface MovimientoReprocesador {
  reprocesar(id: string, data: MovimientoReprocesadorData): Promise<void>;
}

export function crearMovimientoReprocesador(db: Db): MovimientoReprocesador {
  return {
    async reprocesar(id, data) {
      await db
        .update(movimientos)
        .set({
          categoriaPredichaId: data.categoriaPredichaId,
          fuenteCategoria: data.fuenteCategoria,
          confianza: data.confianza,
          requiereRevision: data.requiereRevision,
          evidencia: data.evidencia,
          updatedAt: new Date(),
        })
        .where(eq(movimientos.id, id));
    },
  };
}

export interface MovimientoInputReader {
  porIdInput(id: string): Promise<{
    descripcion: string | null;
    nombreComercio: string | null;
    nombreBancard: string | null;
    mcc: string | null;
    bancardId: string | null;
    codigoComercio: string | null;
    monto: string | null;
    rawInput: unknown;
  } | null>;
}

export function crearMovimientoInputReader(db: Db): MovimientoInputReader {
  return {
    async porIdInput(id) {
      const rows = await db
        .select({
          descripcion: movimientos.descripcion,
          nombreComercio: movimientos.nombreComercio,
          nombreBancard: movimientos.nombreBancard,
          mcc: movimientos.mcc,
          bancardId: movimientos.bancardId,
          codigoComercio: movimientos.codigoComercio,
          monto: movimientos.monto,
          rawInput: movimientos.rawInput,
        })
        .from(movimientos)
        .where(eq(movimientos.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}

export function crearMovimientoLister(db: Db): MovimientoLister {
  return {
    async listar({ limit, offset, origen }) {
      const where = origen !== undefined ? eq(movimientos.origen, origen) : undefined;
      const rowsQ = db
        .select({
          id: movimientos.id,
          descripcion: movimientos.descripcion,
          nombreComercio: movimientos.nombreComercio,
          monto: movimientos.monto,
          categoriaPredichaId: movimientos.categoriaPredichaId,
          categoriaConfirmadaId: movimientos.categoriaConfirmadaId,
          subcategoriaUsuarioId: movimientos.subcategoriaUsuarioId,
          fuenteCategoria: movimientos.fuenteCategoria,
          confianza: movimientos.confianza,
          requiereRevision: movimientos.requiereRevision,
          origen: movimientos.origen,
          createdAt: movimientos.createdAt,
        })
        .from(movimientos);
      const rows = await (where ? rowsQ.where(where) : rowsQ)
        .orderBy(desc(movimientos.createdAt))
        .limit(limit)
        .offset(offset);
      const totalQ = db.select({ n: sql<number>`count(*)::int` }).from(movimientos);
      const totalRows = await (where ? totalQ.where(where) : totalQ);
      const total = totalRows[0]?.n ?? 0;
      return { items: rows, total };
    },
  };
}

export function crearMovimientoReader(db: Db): MovimientoReader {
  return {
    async porId(id): Promise<MovimientoGetData | null> {
      const rows = await db.select().from(movimientos).where(eq(movimientos.id, id)).limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        descripcion: r.descripcion,
        nombreComercio: r.nombreComercio,
        nombreBancard: r.nombreBancard,
        mcc: r.mcc,
        monto: r.monto,
        categoriaPredichaId: r.categoriaPredichaId,
        categoriaConfirmadaId: r.categoriaConfirmadaId,
        subcategoriaUsuarioId: r.subcategoriaUsuarioId,
        fuenteCategoria: r.fuenteCategoria,
        confianza: r.confianza,
        requiereRevision: r.requiereRevision,
        evidencia: r.evidencia,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    },
  };
}
