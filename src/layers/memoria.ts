import type { MovimientoInput, ResultadoCapa } from '../domain/types.js';
import { normalize } from '../domain/normalize.js';
import type { MemoriaUsuarioLookup } from '../db/repos/memoria-usuario.js';

const TRANSFERENCIA_RE = /^MANGO[-\s](.+)$/i;

export function extraerDestinatarioTransferencia(
  nombreBancard: string | null | undefined,
): { raw: string; normalizado: string } | null {
  if (!nombreBancard) return null;
  const m = TRANSFERENCIA_RE.exec(nombreBancard.trim());
  if (!m || !m[1]) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  const normalizado = normalize(raw);
  if (!normalizado) return null;
  return { raw, normalizado };
}

export interface CapaMemoria {
  evaluar(input: MovimientoInput, usuario: string | null): Promise<ResultadoCapa | null>;
}

export function crearCapaMemoria(lookup: MemoriaUsuarioLookup): CapaMemoria {
  return {
    async evaluar(input, usuario) {
      if (!usuario) return null;
      const dest = extraerDestinatarioTransferencia(input.nombreBancard);
      if (!dest) return null;
      const hit = await lookup.buscar(usuario, dest.normalizado);
      if (!hit) return null;
      return {
        categoriaId: hit.categoriaId,
        confianza: 1.0,
        fuente: 'manual',
        evidencia: { memoria_destinatario: dest.raw },
      };
    },
  };
}
