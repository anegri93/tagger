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
  maxConcurrent?: number;
}

export function crearIaFallback(deps: IaFallbackDeps): IaFallback {
  const sched = deps.schedule ?? ((cb) => setImmediate(cb));
  const maxConcurrent = deps.maxConcurrent ?? 2;
  const queue: Array<() => Promise<void>> = [];
  let active = 0;

  function tick(): void {
    while (active < maxConcurrent && queue.length > 0) {
      const job = queue.shift()!;
      active++;
      void job().finally(() => {
        active--;
        tick();
      });
    }
  }

  return {
    schedule(movimientoId, input) {
      const job = async (): Promise<void> => {
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
      };
      queue.push(job);
      sched(tick);
    },
  };
}
