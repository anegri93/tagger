import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { OllamaClient } from '../lib/ollama.js';

export type TipoSugerido = 'regex' | 'literal' | 'prefijo' | 'contiene';

export interface SugerenciaIa {
  token: string;
  tipo: TipoSugerido;
  valor: string;
  categoriaSlug: string;
  ejemplos: string[];
  confianza: number;
  razonamiento: string;
}

export interface SugerirIaOpts {
  loteSize?: number;
  ejemplosPorCategoria?: number;
  confianzaMin?: number;
  minSugerencias?: number;
  maxIteraciones?: number;
}

export interface SugerirIaDeps {
  db: Db;
  ollama: OllamaClient;
}

interface SeedRow {
  nombre: string;
  cat_slug: string;
  fuente_nueva: string;
}

interface SinCatRow {
  nombre: string;
}

interface CategoriaRow {
  slug: string;
}

interface PatronExistenteRow {
  tipo: string;
  valor: string;
}

interface TokenFreqRow {
  tok: string;
  freq: number;
}

// Stopwords geográficos PY/región: países, departamentos, principales ciudades/zonas.
// Se excluyen del ranking de tokens porque agrupan por ubicación, no por rubro.
const STOPWORDS_GEO = [
  // países
  'PARAGUAY','ARGENTINA','BRASIL','URUGUAY','CHILE','BOLIVIA','PERU','ESPANA','ESPAÑA',
  'USA','EEUU','MEXICO','COLOMBIA',
  // departamentos PY
  'CENTRAL','ASUNCION','ASUNCIÓN','ALTOPARANA','ALTO','PARANA','ITAPUA','ITAPÚA',
  'CAAGUAZU','CAAGUAZÚ','CORDILLERA','GUAIRA','GUAIRÁ','MISIONES','PARAGUARI','PARAGUARÍ',
  'CONCEPCION','CONCEPCIÓN','AMAMBAY','CANINDEYU','CANINDEYÚ','PRESIDENTE','HAYES',
  'BOQUERON','BOQUERÓN','NEEMBUCU','ÑEEMBUCÚ','SANPEDRO','PEDRO','CAAZAPA','CAAZAPÁ',
  // ciudades/zonas comunes
  'LUQUE','LAMBARE','LAMBARÉ','FERNANDO','MORA','CAPIATA','CAPIATÁ','LIMPIO','MARIANO',
  'ROQUE','ALONSO','ÑEMBY','NEMBY','VILLA','ELISA','SANBER','SANBERNARDINO','BERNARDINO',
  'ENCARNACION','ENCARNACIÓN','CIUDAD','ESTE','CDE','CORONEL','OVIEDO','PEDROJUAN',
  'CABALLERO','FRANCO','HERNANDARIAS','MINGA','GUAZU','GUAZÚ','ITAUGUA','ITAUGUÁ',
  'AREGUA','AREGUÁ','YPACARAI','YPACARAÍ','SANLORENZO','LORENZO','TRINIDAD','BARRIO',
  'AVENIDA','CALLE','RUTA','KILOMETRO','KILÓMETRO','ZONA','CENTRO','NORTE','SUR','ESTE',
  'OESTE','BARRO','LOMA','LOMAS','SANTA','SANTO','CRUZ','ROSA','MARIA','MARÍA','JOSE','JOSÉ',
];

function construirPrompt(
  seed: SeedRow[],
  sinCat: SinCatRow[],
  categorias: string[],
  patronesExistentes: PatronExistenteRow[],
  tokensCandidatos: TokenFreqRow[] = [],
): string {
  // Agrupar seed por categoria
  const porCat = new Map<string, string[]>();
  for (const r of seed) {
    const arr = porCat.get(r.cat_slug) ?? [];
    arr.push(r.nombre);
    porCat.set(r.cat_slug, arr);
  }
  const ejemplosTxt = Array.from(porCat.entries())
    .map(([cat, nombres]) => `Categoría=${cat}:\n${nombres.map((n) => `  - ${n}`).join('\n')}`)
    .join('\n\n');

  const sinCatTxt = sinCat.map((r) => `  - ${r.nombre}`).join('\n');
  const patronesTxt = patronesExistentes.map((p) => `${p.tipo}:${p.valor}`).join(', ');
  const tokensHintTxt =
    tokensCandidatos.length > 0
      ? tokensCandidatos.map((t) => `${t.tok} (${t.freq})`).join(', ')
      : '(ninguno)';

  return `Sos un categorizador de comercios paraguayos.

Categorías disponibles: ${categorias.join(', ')}

EJEMPLOS VALIDADOS por categoría (cómo se categorizan correctamente):

${ejemplosTxt}

PATRONES EXISTENTES (NO repetir, solo referencia): ${patronesTxt}

TOKENS CANDIDATOS detectados en sin-categorizar (token → freq comercios). Priorizá estos:
${tokensHintTxt}

COMERCIOS SIN CATEGORIZAR (objetivo, agrupar por similitud y proponer patrones):

${sinCatTxt}

INSTRUCCIONES:
- Encontrá tokens/palabras clave que aparezcan en al menos 3 comercios sin categorizar.
- Para cada token, sugerí una categoría (de la lista arriba) y un tipo de patrón.
- Token corto (≤4 chars) → tipo="regex" con valor "\\\\bTOKEN\\\\b"
- Token largo (>4 chars) → tipo="contiene" con valor=TOKEN
- Si dudás de la categoría o no es claro → omitir.
- No repitas tokens ya en patrones existentes.
- Confianza 0.0-1.0 según qué tan claro es.

Devolvé SOLO JSON con este formato exacto, sin texto extra:
{
  "sugerencias": [
    {
      "token": "GIMNASIO",
      "tipo": "contiene",
      "valor": "GIMNASIO",
      "categoria_slug": "salud",
      "ejemplos": ["GIMNASIO ATLAS", "GIMNASIO PUMA", "GIMNASIO XYZ"],
      "confianza": 0.9,
      "razonamiento": "gimnasio se asocia a fitness/salud"
    }
  ]
}`;
}

interface IaResponse {
  sugerencias?: Array<{
    token?: string;
    tipo?: string;
    valor?: string;
    categoria_slug?: string;
    ejemplos?: string[];
    confianza?: number;
    razonamiento?: string;
  }>;
}

export async function sugerirPatronesIa(
  deps: SugerirIaDeps,
  opts: SugerirIaOpts = {},
): Promise<SugerenciaIa[]> {
  const { db, ollama } = deps;
  const loteSize = opts.loteSize ?? 100;
  const ejemplosPorCategoria = opts.ejemplosPorCategoria ?? 5;
  const confianzaMin = opts.confianzaMin ?? 0.7;
  const minSugerencias = opts.minSugerencias ?? 10;
  const maxIteraciones = opts.maxIteraciones ?? 5;

  // 1. Seed validado: top N por categoría
  const seedRows = await db.execute(sql`
    WITH ranked AS (
      SELECT cc.nombre, c.slug as cat_slug, cc.fuente_nueva,
             row_number() OVER (PARTITION BY c.slug ORDER BY random()) as rn
      FROM comercios_catalogo cc
      JOIN categorias c ON c.id = cc.categoria_nueva_id
      WHERE cc.fuente_nueva IN ('regex','literal','prefijo','contiene','manual')
        AND cc.confianza_nueva::float >= 0.8
    )
    SELECT nombre, cat_slug, fuente_nueva FROM ranked WHERE rn <= ${ejemplosPorCategoria}
  `);

  // 2. Tokens candidatos: top tokens (>=4 chars) por freq en sin-cat, excluye geo stopwords
  const stopwordsSql = sql.join(
    STOPWORDS_GEO.map((w) => sql`${w}`),
    sql`, `,
  );
  const tokensRows = await db.execute(sql`
    WITH base AS (
      SELECT id, nombre,
             upper(regexp_replace(nombre, '[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ ]', ' ', 'g')) AS norm
      FROM comercios_catalogo
      WHERE recategorizado_at IS NOT NULL AND categoria_nueva_id IS NULL
    ),
    toks AS (
      SELECT id, unnest(string_to_array(norm, ' ')) AS tok FROM base
    ),
    filtered AS (
      SELECT DISTINCT id, tok FROM toks WHERE length(tok) >= 4
    ),
    existentes AS (
      SELECT upper(valor) AS v FROM patrones
    ),
    stopwords AS (
      SELECT unnest(ARRAY[${stopwordsSql}]::text[]) AS w
    )
    SELECT f.tok, count(DISTINCT f.id)::int AS freq
    FROM filtered f
    WHERE NOT EXISTS (SELECT 1 FROM existentes e WHERE e.v = f.tok)
      AND NOT EXISTS (SELECT 1 FROM stopwords s WHERE s.w = f.tok)
    GROUP BY f.tok
    HAVING count(DISTINCT f.id) >= 3
    ORDER BY freq DESC
    LIMIT 100
  `);
  const tokensTop = tokensRows.rows as unknown as TokenFreqRow[];

  // 3. Categorías + patrones existentes (constantes entre iters)
  const categoriasRows = await db.execute(sql`SELECT slug FROM categorias WHERE activo = true`);
  const patronesRows = await db.execute(sql`SELECT tipo, valor FROM patrones`);
  const seed = seedRows.rows as unknown as SeedRow[];
  const categorias = (categoriasRows.rows as unknown as CategoriaRow[]).map((r) => r.slug);
  const patronesExistentes = patronesRows.rows as unknown as PatronExistenteRow[];
  const valoresExistentes = new Set(patronesExistentes.map((p) => p.valor.toUpperCase()));

  // 4. Loop iterativo: chunks de tokens, llamada IA, acumular hasta minSugerencias
  const out: SugerenciaIa[] = [];
  const tokensVistos = new Set<string>();
  const tokensPorIter = 20;
  let iter = 0;
  while (out.length < minSugerencias && iter < maxIteraciones) {
    iter += 1;
    const start = (iter - 1) * tokensPorIter;
    const tokensCandidatos = tokensTop.slice(start, start + tokensPorIter);
    if (tokensCandidatos.length === 0) {
      console.log(`[sugerir-patrones-ia] iter=${iter} sin más tokens, parando`);
      break;
    }

    let sinCatRows;
    const tokensSql = sql.join(
      tokensCandidatos.map((t) => sql`${t.tok}`),
      sql`, `,
    );
    sinCatRows = await db.execute(sql`
      WITH base AS (
        SELECT id, nombre,
               upper(regexp_replace(nombre, '[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ ]', ' ', 'g')) AS norm
        FROM comercios_catalogo
        WHERE recategorizado_at IS NOT NULL AND categoria_nueva_id IS NULL
      ),
      toks AS (
        SELECT unnest(ARRAY[${tokensSql}]::text[]) AS tok
      )
      SELECT DISTINCT base.nombre FROM base
      JOIN toks ON base.norm ~ ('(^| )' || toks.tok || '( |$)')
      ORDER BY base.nombre
      LIMIT ${loteSize}
    `);
    const sinCat = sinCatRows.rows as unknown as SinCatRow[];
    if (sinCat.length === 0) {
      console.log(`[sugerir-patrones-ia] iter=${iter} lote vacío, parando`);
      break;
    }

    const prompt = construirPrompt(seed, sinCat, categorias, patronesExistentes, tokensCandidatos);
    console.log(
      `[sugerir-patrones-ia] iter=${iter} sin-cat=${sinCat.length} tokens_cand=${tokensCandidatos.length} prompt_chars=${prompt.length} acum=${out.length}`,
    );
    let raw: string;
    try {
      raw = await ollama.generate({ prompt, format: 'json', temperature: 0.2 });
    } catch (err) {
      console.error(`[sugerir-patrones-ia] iter=${iter} ollama error:`, err);
      continue;
    }
    console.log(`[sugerir-patrones-ia] iter=${iter} raw (first 300): ${raw.slice(0, 300)}`);

    let parsed: IaResponse;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`[sugerir-patrones-ia] iter=${iter} JSON parse error:`, err);
      continue;
    }
    const sugerencias = parsed.sugerencias ?? [];
    const descartadas: Array<{ token: string; motivo: string }> = [];
    let aceptadasIter = 0;
    for (const s of sugerencias) {
      if (!s.token || !s.tipo || !s.valor || !s.categoria_slug) {
        descartadas.push({ token: s.token ?? '?', motivo: 'campos_incompletos' });
        continue;
      }
      if (typeof s.confianza !== 'number' || s.confianza < confianzaMin) {
        descartadas.push({ token: s.token, motivo: `confianza=${s.confianza ?? 'null'}` });
        continue;
      }
      if (!categorias.includes(s.categoria_slug)) {
        descartadas.push({ token: s.token, motivo: `cat_inexistente=${s.categoria_slug}` });
        continue;
      }
      if (!['regex', 'literal', 'prefijo', 'contiene'].includes(s.tipo)) {
        descartadas.push({ token: s.token, motivo: `tipo_invalido=${s.tipo}` });
        continue;
      }
      const tokenUp = s.token.toUpperCase();
      const valorUp = s.valor.toUpperCase();
      if (valoresExistentes.has(tokenUp)) {
        descartadas.push({ token: s.token, motivo: 'token_ya_en_patrones' });
        continue;
      }
      if (valoresExistentes.has(valorUp)) {
        descartadas.push({ token: s.token, motivo: 'valor_ya_en_patrones' });
        continue;
      }
      if (tokensVistos.has(valorUp)) {
        descartadas.push({ token: s.token, motivo: 'duplicado_iter_previa' });
        continue;
      }
      tokensVistos.add(valorUp);
      out.push({
        token: s.token,
        tipo: s.tipo as TipoSugerido,
        valor: s.valor,
        categoriaSlug: s.categoria_slug,
        ejemplos: s.ejemplos ?? [],
        confianza: s.confianza,
        razonamiento: s.razonamiento ?? '',
      });
      aceptadasIter += 1;
    }
    if (descartadas.length > 0) {
      console.log(`[sugerir-patrones-ia] iter=${iter} descartadas: ${JSON.stringify(descartadas)}`);
    }
    console.log(
      `[sugerir-patrones-ia] iter=${iter} aceptadas=${aceptadasIter} acum=${out.length}/${minSugerencias}`,
    );
  }

  console.log(`[sugerir-patrones-ia] finales=${out.length} iters=${iter}`);
  out.sort((a, b) => b.confianza - a.confianza);
  return out;
}

// export interno para tests
export { construirPrompt };
