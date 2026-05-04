const SEPARATOR_RE = /[-/\\_|]/g;
const STRIP_RE = /[.,;:*+!?¿¡"'`´()[\]{}<>@#$%^&=]/g;
// Combining marks excepto U+0303 (tilde sobre ñ).
const DIACRITICS_EXCEPT_TILDE_RE = /[̀-̂̄-ͯ]/g;

export function normalize(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.normalize('NFD').replace(DIACRITICS_EXCEPT_TILDE_RE, '').normalize('NFC');
  s = s.replace(SEPARATOR_RE, ' ');
  s = s.replace(STRIP_RE, '');
  s = s.toUpperCase();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
