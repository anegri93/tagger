import type { ResultadoCapa, MovimientoInput } from '../domain/types.js';
import { CONFIANZA } from '../domain/confianza.js';
import type { LlmClient } from '../lib/llm.js';

export interface CategoriaActiva {
  id: string;
  slug: string;
  nombre: string;
  descripcion?: string | null;
}

export interface CategoriasLoader {
  activas(): Promise<CategoriaActiva[]>;
}

export interface MarcasReaderPort {
  porCategoria(): Promise<Map<string, Array<{ marca: string }>>>;
}

export interface CapaIa {
  evaluar(input: MovimientoInput): Promise<ResultadoCapa | null>;
}

const SYSTEM_PROMPT = `Sos un clasificador de movimientos bancarios paraguayos. Tu única tarea es elegir UN slug de la lista CATEGORÍAS y devolverlo en JSON.

REGLAS ESTRICTAS:
1. Respondé SOLO JSON con esta forma exacta:
   {"categoria_slug": "<slug>", "confianza": <0.0-1.0>}
2. El slug DEBE estar exactamente como aparece en CATEGORÍAS. NO inventés slugs.
3. Si ningún slug encaja → {"categoria_slug": null, "confianza": 0}.
4. NO incluyas texto fuera del JSON. NO uses code fences.

GUÍA DE CONFIANZA:
- 0.95: nombre obvio (ej. "FARMACIA CATEDRAL" → farmacia)
- 0.85: probable con contexto local conocido
- 0.65: razonable pero ambiguo
- 0.40: adivinanza fundada
- 0:    no sé → usar también categoria_slug:null

CONTEXTO PARAGUAY:
- "MANGO-..." al inicio → transferencia P2P entre personas (slug: transferencia)
- PUNTO FARMA, FARMACIA, FARMA, BOTICA → farmacia
- TIGO, COPACO, ANDE, ESSAP con "PAGO FACT" → servicios
- DESPENSA, MINIMARKET, ALMACEN, BODEGA → alimentacion (NO supermercado grande)

EJEMPLOS:
"MANGO-PEREZ JUAN" → {"categoria_slug":"transferencia","confianza":0.95}
"FARMACIA CATEDRAL-FB" → {"categoria_slug":"farmacia","confianza":0.95}
"DESPENSA SAN JORGE" → {"categoria_slug":"alimentacion","confianza":0.85}
"TIGO PAGO DE FACT" → {"categoria_slug":"servicios","confianza":0.9}
"COMERCIAL XYZ S.A." → {"categoria_slug":null,"confianza":0}`;

function buildMarcasBlock(marcasPorCat: Map<string, Array<{ marca: string }>>): string {
  if (marcasPorCat.size === 0) return '';
  const lines = ['Marcas extra conocidas (interpretá typos con flexibilidad):'];
  for (const [slug, list] of marcasPorCat) {
    if (list.length === 0) continue;
    lines.push(`- ${slug}: ${list.map((m) => m.marca).join(', ')}`);
  }
  return lines.join('\n');
}

function buildPrompt(
  input: MovimientoInput,
  categorias: CategoriaActiva[],
  marcasBlock: string,
): string {
  const lista = categorias
    .map((c) => {
      const desc = c.descripcion ? ` — ${c.descripcion}` : '';
      return `- ${c.slug}: ${c.nombre}${desc}`;
    })
    .join('\n');
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

CATEGORÍAS (usá EXACTAMENTE estos slugs):
${lista}
${marcasBlock ? '\n' + marcasBlock : ''}

MOVIMIENTO A CLASIFICAR:
${datos}

JSON:`;
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

export function crearCapaIa(
  client: LlmClient,
  loader: CategoriasLoader,
  marcasReader?: MarcasReaderPort,
): CapaIa {
  return {
    async evaluar(input) {
      const cats = await loader.activas();
      if (cats.length === 0) return null;
      const marcasMap = marcasReader ? await marcasReader.porCategoria() : new Map();
      const marcasBlock = buildMarcasBlock(marcasMap);
      const prompt = buildPrompt(input, cats, marcasBlock);
      let raw: string;
      try {
        raw = await client.generate({ prompt, format: 'json', temperature: 0.1 });
      } catch {
        return null;
      }
      const parsed = parseJson(raw);
      if (!parsed || !parsed.categoria_slug) return null;
      const slugNorm = parsed.categoria_slug.trim().toLowerCase();
      const cat = cats.find((c) => c.slug.toLowerCase() === slugNorm);
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
