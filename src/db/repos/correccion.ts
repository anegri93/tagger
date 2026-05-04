import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { movimientos, correccionesUsuario, categorias } from '../schema/index.js';
import type { CorreccionService } from '../../api/routes/correccion.js';

export function crearCorreccionService(db: Db): CorreccionService {
  return {
    async aplicar(input) {
      const movRows = await db
        .select({
          id: movimientos.id,
          categoriaPredichaId: movimientos.categoriaPredichaId,
          categoriaConfirmadaId: movimientos.categoriaConfirmadaId,
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

      return await db.transaction(async (tx) => {
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
    },
  };
}
