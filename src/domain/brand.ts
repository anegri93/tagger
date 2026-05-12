const DIACRITICS_EXCEPT_TILDE_RE = /[̀-̂̄-ͯ]/g;
const SEPARATOR_RE = /[-/\\_|]/;
const SUFIJOS_RE =
  /\b(?:I{1,3}V?|VI{0,3}|S\s?\.?A\.?|S\s?\.?R\s?\.?L\s?\.?|EIRL|LTDA|SAS|SUC|SUCURSAL|CENTRO|MATRIZ|CASA\s+CENTRAL|QR\s?\d*|QR\s?[A-Z]+)\b\.?\s*$/i;
const TRAILING_DIGITS_RE = /[\s-]*\d+\s*$/;
const MULTI_SPACE_RE = /\s+/g;
const PUNCT_RE = /[.,;:*+!?¿¡"'`´()[\]{}<>@#$%^&=]/g;
const MIN_CHARS = 4;

function preNormalize(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_EXCEPT_TILDE_RE, '').normalize('NFC').toUpperCase();
}

export function extractBrand(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  let s = preNormalize(nombre);

  const sepMatch = s.match(SEPARATOR_RE);
  if (sepMatch && sepMatch.index !== undefined && sepMatch.index > 0) {
    s = s.slice(0, sepMatch.index);
  }

  const digitMatch = s.match(/\d/);
  if (digitMatch && digitMatch.index !== undefined && digitMatch.index > 0) {
    s = s.slice(0, digitMatch.index);
  }

  s = s.replace(PUNCT_RE, ' ');

  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(SUFIJOS_RE, '').replace(TRAILING_DIGITS_RE, '').trim();
    if (s === before) break;
  }

  s = s.replace(MULTI_SPACE_RE, ' ').trim();

  if (s.replace(/\s/g, '').length < MIN_CHARS) return null;
  return s;
}
