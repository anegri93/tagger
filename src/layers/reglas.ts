import type { MovimientoInput, ResultadoCapa, FuenteCategoria } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';
import type { ReglaCargada, ReglasLoader, ReglaTipo } from '../db/repos/reglas.js';

const TTL_MS = 60_000;

export interface CapaReglas {
  evaluar(input: MovimientoInput, scope: string): Promise<ResultadoCapa | null>;
  invalidar(scope?: string): void;
}

function textoPara(input: MovimientoInput): string {
  return [input.nombreBancard, input.nombreComercio, input.descripcion]
    .filter((v): v is string => Boolean(v))
    .join(' ');
}

function matchRegla(textoNorm: string, textoRaw: string, r: ReglaCargada): boolean {
  switch (r.tipo) {
    case 'literal':
      return textoNorm === r.valorNormalizado;
    case 'contiene':
      return r.valorNormalizado.length > 0 && textoNorm.includes(r.valorNormalizado);
    case 'regex': {
      try {
        return new RegExp(r.valor, 'i').test(textoRaw);
      } catch {
        return false;
      }
    }
  }
}

function fuenteYConfianza(r: ReglaCargada): { fuente: FuenteCategoria; confianza: number } {
  // Reglas user-scope con origen correccion/manual son aprendizajes 1:1 → confianza 1.0 fuente 'manual'.
  // Resto: usar el tipo de patrón (regex/literal/contiene).
  if (r.scope.startsWith('usuario:') && (r.origen === 'correccion' || r.origen === 'manual')) {
    return { fuente: 'manual', confianza: CONFIANZA.manual };
  }
  const tipoFuente: Record<ReglaTipo, FuenteCategoria> = {
    literal: 'literal',
    contiene: 'contiene',
    regex: 'regex',
  };
  return { fuente: tipoFuente[r.tipo], confianza: CONFIANZA[r.tipo] };
}

export function crearCapaReglas(
  loader: ReglasLoader,
  onHit?: (reglaId: string) => void,
  now: () => number = Date.now,
): CapaReglas {
  const cache = new Map<string, { reglas: ReglaCargada[]; expira: number }>();

  async function getReglas(scope: string): Promise<ReglaCargada[]> {
    const hit = cache.get(scope);
    if (hit && hit.expira > now()) return hit.reglas;
    const reglas = (await loader.porScope(scope))
      .slice()
      .sort((a, b) => a.prioridad - b.prioridad);
    cache.set(scope, { reglas, expira: now() + TTL_MS });
    return reglas;
  }

  return {
    async evaluar(input, scope) {
      const texto = textoPara(input);
      const textoNorm = normalize(texto);
      if (!textoNorm) return null;
      const reglas = await getReglas(scope);
      for (const r of reglas) {
        if (matchRegla(textoNorm, texto, r)) {
          if (onHit) void Promise.resolve().then(() => onHit(r.id));
          const { fuente, confianza } = fuenteYConfianza(r);
          return {
            categoriaId: r.categoriaId,
            fuente,
            confianza,
            evidencia: { regla_id: r.id, patron: r.valor },
          };
        }
      }
      return null;
    },
    invalidar(scope) {
      if (scope) cache.delete(scope);
      else cache.clear();
    },
  };
}

export function scopeUsuario(usuario: string): string {
  return `usuario:${usuario}`;
}
