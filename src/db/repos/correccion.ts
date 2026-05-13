import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { movimientos, correccionesUsuario, categorias } from '../schema/index.js';
import type { CorreccionService } from '../../api/routes/correccion.js';
import type { MemoriaUsuarioWriter } from './memoria-usuario.js';
import { extraerDestinatarioTransferencia } from '../../layers/memoria.js';

export function crearCorreccionService(db: Db, memoria?: MemoriaUsuarioWriter): CorreccionService {
  return {
    async aplicar(input) {
      const movRows = await db
        .select({
          id: movimientos.id,
          categoriaPredichaId: movimientos.categoriaPredichaId,
          categoriaConfirmadaId: movimientos.categoriaConfirmadaId,
          nombreBancard: movimientos.nombreBancard,
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

      // Hook: si es transferencia y tenemos usuario, guardar en memoria.
      if (memoria) {
        const usuario = input.usuario ?? mov.origen;
        const dest = extraerDestinatarioTransferencia(mov.nombreBancard);
        if (usuario && dest) {
          try {
            await memoria.upsert({
              usuario,
              destinatario: dest.raw,
              categoriaId: input.categoriaIdNueva,
              origen: 'correccion',
            });
          } catch {
            // No bloquear correccion si falla memoria.
          }
        }
      }

      return result;
    },
  };
}
