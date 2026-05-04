import type { Evidencia, FuenteCategoria } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import { normalize } from '../domain/normalize.js';
import type { ReglaCargada } from '../layers/regex.js';
import type { MccEntry } from '../layers/mcc.js';

export interface FilaBancard {
  nombre: string;
  bancardId: string | null;
  codigoComercio: string | null;
  mcc: string | null;
  marca?: string | null;
  mccInferido?: boolean;
}

export interface DecisionCatalogo {
  categoriaId: string;
  fuente: FuenteCategoria;
  confianza: number;
  requiereRevision: boolean;
  evidencia: Evidencia;
}

export interface CascadaCtx {
  reglas: ReglaCargada[];
  mccPorCodigo: Map<string, MccEntry>;
  patronesNombre: PatronNombre[];
  categoriaOtrosId: string;
}

export interface PatronNombre {
  re: RegExp;
  categoriaSlug: string;
  categoriaId: string;
  nombre: string;
}

export function categorizarComercio(row: FilaBancard, ctx: CascadaCtx): DecisionCatalogo {
  const target = normalize(row.nombre);

  for (const r of ctx.reglas) {
    let re: RegExp;
    try {
      re = new RegExp(r.patron, 'i');
    } catch {
      continue;
    }
    if (re.test(target)) {
      return {
        categoriaId: r.categoriaId,
        fuente: 'regex',
        confianza: CONFIANZA.regex,
        requiereRevision: false,
        evidencia: { regla_id: r.id, patron: r.patron },
      };
    }
  }

  if (row.mcc) {
    const mcc = ctx.mccPorCodigo.get(row.mcc.trim());
    if (mcc && !mcc.ambiguo && mcc.categoriaId) {
      const inferido = row.mccInferido === true;
      return {
        categoriaId: mcc.categoriaId,
        fuente: 'mcc',
        confianza: inferido ? 0.6 : CONFIANZA.mcc,
        requiereRevision: inferido,
        evidencia: {
          mcc_match: mcc.codMcc,
          ...(inferido ? { mcc_inferido: true } : {}),
          ...(inferido && row.marca ? { marca: row.marca } : {}),
        },
      };
    }
  }

  for (const p of ctx.patronesNombre) {
    if (p.re.test(target)) {
      return {
        categoriaId: p.categoriaId,
        fuente: 'nombre',
        confianza: CONFIANZA.nombre,
        requiereRevision: false,
        evidencia: { patron: p.nombre, match_type: 'nombre_parcial' },
      };
    }
  }

  return {
    categoriaId: ctx.categoriaOtrosId,
    fuente: 'mcc',
    confianza: 0.3,
    requiereRevision: true,
    evidencia: row.mcc ? { mcc_match: row.mcc } : {},
  };
}
