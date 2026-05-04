import type { ResultadoCapa, MovimientoInput } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import type { OllamaClient } from '../lib/ollama.js';

export interface CategoriaActiva {
  id: string;
  slug: string;
  nombre: string;
}

export interface CategoriasLoader {
  activas(): Promise<CategoriaActiva[]>;
}

export interface CapaIa {
  evaluar(input: MovimientoInput): Promise<ResultadoCapa | null>;
}

const SYSTEM_PROMPT = `Sos un clasificador de movimientos bancarios paraguayos. Devolvés SOLO JSON con esta forma:
{"categoria_slug": "<slug>", "confianza": <0..1>}
Si no estás seguro, devolvés {"categoria_slug": null, "confianza": 0}.`;

function buildPrompt(input: MovimientoInput, categorias: CategoriaActiva[]): string {
  const lista = categorias.map((c) => `- ${c.slug}: ${c.nombre}`).join('\n');
  const datos = [
    input.descripcion ? `descripcion: ${input.descripcion}` : null,
    input.nombreComercio ? `nombre_comercio: ${input.nombreComercio}` : null,
    input.nombreBancard ? `nombre_bancard: ${input.nombreBancard}` : null,
    input.mcc ? `mcc: ${input.mcc}` : null,
    input.monto !== undefined ? `monto: ${input.monto}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `${SYSTEM_PROMPT}

Categorías disponibles:
${lista}

Movimiento:
${datos}

Respondé solo con el JSON.`;
}

interface IaResponse {
  categoria_slug: string | null;
  confianza: number;
}

function parseJson(raw: string): IaResponse | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as IaResponse;
    if (typeof obj.confianza !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}

export function crearCapaIa(client: OllamaClient, loader: CategoriasLoader): CapaIa {
  return {
    async evaluar(input) {
      const cats = await loader.activas();
      if (cats.length === 0) return null;
      const prompt = buildPrompt(input, cats);
      let raw: string;
      try {
        raw = await client.generate({ prompt, format: 'json', temperature: 0.1 });
      } catch {
        return null;
      }
      const parsed = parseJson(raw);
      if (!parsed || !parsed.categoria_slug) return null;
      const cat = cats.find((c) => c.slug === parsed.categoria_slug);
      if (!cat) return null;
      const confianza = Math.min(Math.max(parsed.confianza, 0), CONFIANZA.ia_max);
      return {
        categoriaId: cat.id,
        confianza,
        fuente: 'ia',
        evidencia: { ia_prompt: prompt, ia_response: raw },
      };
    },
  };
}
