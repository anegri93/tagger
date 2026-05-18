import type { ResultadoCapa, MovimientoInput } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';
import type {
  PatronUsuarioCargado,
  PatronesUsuarioLoader,
} from '../db/repos/patrones-usuario.js';

const TTL_MS = 60_000;

export interface CapaPatronesUsuario {
  evaluar(input: MovimientoInput, usuario: string | null): Promise<ResultadoCapa | null>;
  invalidar(usuario?: string): void;
}

function matchPatron(texto: string, p: PatronUsuarioCargado): boolean {
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

export function crearCapaPatronesUsuario(
  loader: PatronesUsuarioLoader,
  onHit?: (patronId: string) => void,
  now: () => number = Date.now,
): CapaPatronesUsuario {
  const cache = new Map<string, { reglas: PatronUsuarioCargado[]; expira: number }>();

  async function getReglas(usuario: string): Promise<PatronUsuarioCargado[]> {
    const hit = cache.get(usuario);
    if (hit && hit.expira > now()) return hit.reglas;
    const reglas = (await loader.porUsuario(usuario))
      .slice()
      .sort((a, b) => a.prioridad - b.prioridad);
    cache.set(usuario, { reglas, expira: now() + TTL_MS });
    return reglas;
  }

  return {
    async evaluar(input, usuario) {
      if (!usuario) return null;
      const texto = [input.nombreBancard, input.nombreComercio, input.descripcion]
        .filter((v): v is string => Boolean(v))
        .join(' ');
      const target = normalize(texto);
      if (!target) return null;
      const reglas = await getReglas(usuario);
      for (const p of reglas) {
        if (matchPatron(target, p)) {
          if (onHit) {
            // Fire-and-forget: no await
            void Promise.resolve().then(() => onHit(p.id));
          }
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
    invalidar(usuario) {
      if (usuario) cache.delete(usuario);
      else cache.clear();
    },
  };
}
