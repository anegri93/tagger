import { eq, and } from 'drizzle-orm';
import type { Db } from '../client.js';
import { movimientos, correccionesUsuario, categorias, reglas } from '../schema/index.js';
import type { CorreccionService } from '../../api/routes/correccion.js';
import { normalize } from '../../domain/normalize.js';

/**
 * Deriva clave para guardar en memoria (reglas con scope='usuario:X', tipo='literal').
 * Si el movimiento es transferencia `MANGO-X`, usa el destinatario. Sino usa el primer
 * nombre disponible (comercio/bancard/descripción).
 */
function claveMemoria(input: {
  nombreBancard?: string | null;
  nombreComercio?: string | null;
  descripcion?: string | null;
}): { raw: string; normalizado: string } | null {
  const transRe = /^MANGO[-\s](.+)$/i;
  if (input.nombreBancard) {
    const m = transRe.exec(input.nombreBancard.trim());
    if (m && m[1]) {
      const raw = m[1].trim();
      const norm = normalize(raw);
      if (raw && norm) return { raw, normalizado: norm };
    }
  }
  const raw = (input.nombreComercio ?? input.nombreBancard ?? input.descripcion ?? '').trim();
  if (!raw) return null;
  const normalizado = normalize(raw);
  if (!normalizado) return null;
  return { raw, normalizado };
}

export interface CorreccionMemoriaWriter {
  upsert(input: {
    scope: string;
    valor: string;
    valorNormalizado: string;
    categoriaId: string;
  }): Promise<void>;
}

export function crearCorreccionMemoriaWriter(db: Db): CorreccionMemoriaWriter {
  return {
    async upsert({ scope, valor, valorNormalizado, categoriaId }) {
      // Buscar regla literal existente
      const existing = await db
        .select({ id: reglas.id })
        .from(reglas)
        .where(
          and(
            eq(reglas.scope, scope),
            eq(reglas.tipo, 'literal'),
            eq(reglas.valorNormalizado, valorNormalizado),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(reglas)
          .set({ categoriaId, updatedAt: new Date() })
          .where(eq(reglas.id, existing[0]!.id));
        return;
      }
      await db.insert(reglas).values({
        scope,
        tipo: 'literal',
        valor,
        valorNormalizado,
        categoriaId,
        prioridad: 50,
        activo: true,
        origen: 'correccion',
      });
    },
  };
}

export function crearCorreccionService(
  db: Db,
  memoria?: CorreccionMemoriaWriter,
  invalidarReglas?: (scope: string) => void,
): CorreccionService {
  return {
    async aplicar(input) {
      const movRows = await db
        .select({
          id: movimientos.id,
          categoriaPredichaId: movimientos.categoriaPredichaId,
          categoriaConfirmadaId: movimientos.categoriaConfirmadaId,
          nombreBancard: movimientos.nombreBancard,
          nombreComercio: movimientos.nombreComercio,
          descripcion: movimientos.descripcion,
          origen: movimientos.origen,
        })
        .from(movimientos)
        .where(eq(movimientos.id, input.movimientoId))
        .limit(1);
      const mov = movRows[0];
      if (!mov) return { ok: false, error: 'movimiento_no_encontrado' };

      const catRows = await db
        .select({ id: categorias.id })
        .from(categorias)
        .where(eq(categorias.id, input.categoriaIdNueva))
        .limit(1);
      if (catRows.length === 0) return { ok: false, error: 'categoria_invalida' };

      const anterior = mov.categoriaConfirmadaId ?? mov.categoriaPredichaId;

      const result = await db.transaction(async (tx) => {
        await tx
          .update(movimientos)
          .set({
            categoriaConfirmadaId: input.categoriaIdNueva,
            fuenteCategoria: 'manual',
            requiereRevision: false,
            updatedAt: new Date(),
          })
          .where(eq(movimientos.id, input.movimientoId));

        const inserted = await tx
          .insert(correccionesUsuario)
          .values({
            movimientoId: input.movimientoId,
            categoriaAnteriorId: anterior,
            categoriaNuevaId: input.categoriaIdNueva,
            usuario: input.usuario ?? null,
            motivo: input.motivo ?? null,
          })
          .returning({ id: correccionesUsuario.id });
        const correccionId = inserted[0]?.id;
        if (!correccionId) throw new Error('insert correccion sin id');

        return { ok: true as const, correccionId, categoriaAnteriorId: anterior };
      });

      // Hook: si hay usuario y clave derivable, guardar como regla literal user-scope.
      if (memoria) {
        const usuario = input.usuario ?? mov.origen;
        const clave = claveMemoria({
          nombreBancard: mov.nombreBancard,
          nombreComercio: mov.nombreComercio,
          descripcion: mov.descripcion,
        });
        if (usuario && clave) {
          const scope = `usuario:${usuario}`;
          try {
            await memoria.upsert({
              scope,
              valor: clave.raw,
              valorNormalizado: clave.normalizado,
              categoriaId: input.categoriaIdNueva,
            });
            invalidarReglas?.(scope);
          } catch {
            // No bloquear correccion si falla guardado de memoria.
          }
        }
      }

      return result;
    },
  };
}
