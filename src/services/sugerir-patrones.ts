import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { normalize } from '../domain/normalize.js';

export type TipoSugerido = 'regex' | 'literal' | 'prefijo' | 'contiene';

export interface PatronSugerido {
  token: string;
  tipo: TipoSugerido;
  valor: string;
  categoriaId: string;
  categoriaSlug: string;
  freqSeed: number;
  pureza: number;
  impactoSinCat: number;
}

export interface SugerirOpts {
  freqMin?: number;
  purezaMin?: number;
  longitudMin?: number;
  impactoMin?: number;
}

const STOPWORDS = new Set([
  'PARAGUAY', 'ASUNCION', 'CALLE', 'AVENIDA', 'AVDA', 'CENTRO', 'SUCURSAL', 'BRANCH',
  'CIUDAD', 'BARRIO', 'NORTE', 'SUR', 'ESTE', 'OESTE', 'NUEVO', 'NUEVA', 'GRAN',
  'PRINCIPAL', 'ZONA', 'ESQ', 'KILOMETRO', 'KM', 'ENTRE', 'PARA', 'COMO', 'SOBRE',
  'DESDE', 'HASTA', 'SAN', 'SANTA', 'REPUBLICA', 'AMERICA', 'BRASIL', 'ARGENTINA',
]);

export function tokenizar(nombre: string, longitudMin = 4): string[] {
  const norm = normalize(nombre);
  return norm
    .split(/\s+/)
    .filter((t) => t.length >= longitudMin && !STOPWORDS.has(t));
}

export async function sugerirPatrones(db: Db, opts: SugerirOpts = {}): Promise<PatronSugerido[]> {
  const freqMin = opts.freqMin ?? 5;
  const purezaMin = opts.purezaMin ?? 0.8;
  const longitudMin = opts.longitudMin ?? 4;
  const impactoMin = opts.impactoMin ?? 3;

  // 1. Seed: comercios bien categorizados
  const seedRows = await db.execute(sql`
    SELECT cc.nombre, c.id as cat_id, c.slug as cat_slug
    FROM comercios_catalogo cc
    JOIN categorias c ON c.id = cc.categoria_id
    WHERE cc.fuente_categoria IN ('regex','manual','patrones','bancard','literal','prefijo','contiene')
      AND cc.confianza::float >= 0.8
  `);

  // 2. Construir matriz token → categoria → count
  const matriz = new Map<string, Map<string, { catId: string; catSlug: string; count: number }>>();
  for (const r of seedRows.rows as Array<{ nombre: string; cat_id: string; cat_slug: string }>) {
    const tokens = tokenizar(r.nombre, longitudMin);
    for (const t of tokens) {
      let porCat = matriz.get(t);
      if (!porCat) {
        porCat = new Map();
        matriz.set(t, porCat);
      }
      const slot = porCat.get(r.cat_id) ?? { catId: r.cat_id, catSlug: r.cat_slug, count: 0 };
      slot.count++;
      porCat.set(r.cat_id, slot);
    }
  }

  // 3. Patrones existentes (para descartar duplicados/conflictos)
  const patronesExistentes = await db.execute(sql`
    SELECT tipo, valor, categoria_id FROM patrones
  `);
  const valoresUsados = new Set<string>(); // valores que ya tienen al menos un patrón
  const valoresPorCat = new Set<string>(); // (tipo|valor|cat) para skip exacto
  for (const p of patronesExistentes.rows as Array<{
    tipo: string;
    valor: string;
    categoria_id: string;
  }>) {
    valoresUsados.add(p.valor.toUpperCase());
    valoresPorCat.add(`${p.tipo}|${p.valor.toUpperCase()}|${p.categoria_id}`);
  }

  // 4. Comercios sin categorizar (para impacto)
  const sinCatRows = await db.execute(sql`
    SELECT nombre FROM comercios_catalogo
    WHERE recategorizado_at IS NOT NULL AND categoria_nueva_id IS NULL
  `);
  const sinCatNombres = (sinCatRows.rows as Array<{ nombre: string }>).map((r) =>
    normalize(r.nombre),
  );

  // 5. Evaluar tokens
  const sugerencias: PatronSugerido[] = [];
  for (const [token, porCat] of matriz) {
    const counts = Array.from(porCat.values());
    const total = counts.reduce((a, b) => a + b.count, 0);
    if (total < freqMin) continue;
    const dominante = counts.reduce((a, b) => (a.count >= b.count ? a : b));
    const pureza = dominante.count / total;
    if (pureza < purezaMin) continue;

    // Conflicto: token ya existe como patrón en otra categoría → skip
    // (descartamos si valor ya usado pero NO en esta cat — o sea, conflict)
    const claveExacta = `contiene|${token}|${dominante.catId}`;
    const claveExactaRegex = `regex|\\b${token}\\b|${dominante.catId}`;
    if (valoresPorCat.has(claveExacta) || valoresPorCat.has(claveExactaRegex)) continue;

    // Si valor ya usado pero en otra cat → conflicto, skip
    if (valoresUsados.has(token)) continue;

    const tipo: TipoSugerido = token.length <= 4 ? 'regex' : 'contiene';
    const valor = tipo === 'regex' ? `\\b${token}\\b` : token;

    // Impacto en sin-cat
    let impacto = 0;
    if (tipo === 'contiene') {
      for (const n of sinCatNombres) if (n.includes(token)) impacto++;
    } else {
      const re = new RegExp(`\\b${token}\\b`, 'i');
      for (const n of sinCatNombres) if (re.test(n)) impacto++;
    }
    if (impacto < impactoMin) continue;

    sugerencias.push({
      token,
      tipo,
      valor,
      categoriaId: dominante.catId,
      categoriaSlug: dominante.catSlug,
      freqSeed: total,
      pureza,
      impactoSinCat: impacto,
    });
  }

  sugerencias.sort((a, b) => b.freqSeed - a.freqSeed);
  return sugerencias;
}
