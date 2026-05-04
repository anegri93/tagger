import type { ResultadoCapa } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';

export interface ReglaCargada {
  id: string;
  patron: string;
  categoriaId: string;
  prioridad: number;
}

export interface ReglasLoader {
  cargar(): Promise<ReglaCargada[]>;
}

const TTL_MS = 60_000;

export interface CapaRegex {
  evaluar(texto: string): Promise<ResultadoCapa | null>;
  invalidar(): void;
}

export function crearCapaRegex(loader: ReglasLoader, now: () => number = Date.now): CapaRegex {
  let cache: { reglas: ReglaCargada[]; expira: number } | null = null;

  async function getReglas(): Promise<ReglaCargada[]> {
    if (cache && cache.expira > now()) return cache.reglas;
    const reglas = (await loader.cargar()).slice().sort((a, b) => a.prioridad - b.prioridad);
    cache = { reglas, expira: now() + TTL_MS };
    return reglas;
  }

  return {
    async evaluar(texto: string) {
      const target = normalize(texto);
      if (!target) return null;
      const reglas = await getReglas();
      for (const r of reglas) {
        let re: RegExp;
        try {
          re = new RegExp(r.patron, 'i');
        } catch {
          continue;
        }
        if (re.test(target)) {
          return {
            categoriaId: r.categoriaId,
            confianza: CONFIANZA.regex,
            fuente: 'regex',
            evidencia: { regla_id: r.id, patron: r.patron },
          };
        }
      }
      return null;
    },
    invalidar() {
      cache = null;
    },
  };
}
