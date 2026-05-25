// Traduce reglas técnicas a lenguaje humano.

import type { Regla } from '@mango/tagger-sdk';

const TIPO_LABEL: Record<string, string> = {
  literal: 'Es exactamente',
  contiene: 'Contiene',
  regex: 'Coincide con',
};

export function friendlyRule(r: Pick<Regla, 'tipo' | 'valor'>): { verbo: string; texto: string } {
  if (r.tipo === 'regex') {
    // ^MANGO\b → "empieza con MANGO"
    // \bMANGO\b → "menciona MANGO"
    // \b(A|B|C)\b → "menciona A, B o C"
    const v = r.valor;
    const startMatch = v.match(/^\^([A-ZÀ-Ÿ0-9]+)\\b$/i);
    if (startMatch) return { verbo: 'Empieza con', texto: startMatch[1] };
    const wholeMatch = v.match(/^\\b([A-ZÀ-Ÿ0-9]+)\\b$/i);
    if (wholeMatch) return { verbo: 'Menciona', texto: wholeMatch[1] };
    const altMatch = v.match(/^\\b\(([^)]+)\)\\b$/i);
    if (altMatch) {
      const opts = altMatch[1].split('|').slice(0, 3).join(', ');
      return { verbo: 'Menciona', texto: opts };
    }
    // Fallback: limpiar metacaracteres comunes
    const cleaned = v.replace(/\\b|\\s\*|\\s\?|\^|\$|\(\?:?|\)/g, ' ').replace(/\s+/g, ' ').trim();
    return { verbo: 'Coincide con', texto: cleaned };
  }
  return { verbo: TIPO_LABEL[r.tipo] ?? 'Coincide con', texto: r.valor };
}

export function formatHits(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
