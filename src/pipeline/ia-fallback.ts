import type { Logger } from 'pino';
import type { CapaIa } from '../layers/ia.js';
import type { MovimientoInput } from '../domain/types.js';

export interface MovimientoUpdater {
  actualizarPrediccion(
    movimientoId: string,
    data: {
      categoriaId: string;
      fuente: 'ia';
      confianza: number;
      evidencia: unknown;
    },
  ): Promise<void>;
}

export interface IaFallback {
  schedule(movimientoId: string, input: MovimientoInput): void;
}

export interface IaFallbackDeps {
  capa: CapaIa;
  updater: MovimientoUpdater;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  schedule?: (cb: () => void) => void;
}

export function crearIaFallback(deps: IaFallbackDeps): IaFallback {
  const sched = deps.schedule ?? ((cb) => setImmediate(cb));

  return {
    schedule(movimientoId, input) {
      sched(() => {
        void (async () => {
          try {
            const r = await deps.capa.evaluar(input);
            if (!r) {
              deps.logger.warn({ movimientoId }, 'ia-fallback sin resultado');
              return;
            }
            await deps.updater.actualizarPrediccion(movimientoId, {
              categoriaId: r.categoriaId,
              fuente: 'ia',
              confianza: r.confianza,
              evidencia: r.evidencia,
            });
            deps.logger.info({ movimientoId, categoriaId: r.categoriaId }, 'ia-fallback ok');
          } catch (err) {
            deps.logger.error({ err, movimientoId }, 'ia-fallback error');
          }
        })();
      });
    },
  };
}
