import type { ResultadoCapa } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';

export type PatronTipo = 'regex' | 'literal' | 'prefijo' | 'contiene';

export interface PatronCargado {
  id: string;
  tipo: PatronTipo;
  valor: string;
  categoriaId: string;
  prioridad: number;
}

export interface PatronesLoader {
  cargar(): Promise<PatronCargado[]>;
}

const TTL_MS = 60_000;

export interface CapaPatrones {
  evaluar(texto: string): Promise<ResultadoCapa | null>;
  invalidar(): void;
}

function matchPatron(texto: string, p: PatronCargado): boolean {
  switch (p.tipo) {
    case 'regex': {
      try {
        return new RegExp(p.valor, 'i').test(texto);
      } catch {
        return false;
      }
    }
    case 'literal':
      return texto === normalize(p.valor);
    case 'prefijo':
      return texto.startsWith(normalize(p.valor));
    case 'contiene':
      return texto.includes(normalize(p.valor));
  }
}

export function crearCapaPatrones(
  loader: PatronesLoader,
  now: () => number = Date.now,
): CapaPatrones {
  let cache: { reglas: PatronCargado[]; expira: number } | null = null;

  async function getReglas(): Promise<PatronCargado[]> {
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
      for (const p of reglas) {
        if (matchPatron(target, p)) {
          return {
            categoriaId: p.categoriaId,
            confianza: CONFIANZA[p.tipo],
            fuente: p.tipo,
            evidencia: { regla_id: p.id, patron: p.valor },
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
