import type { Regla } from '@mango/tagger-sdk';
import type { UiMov } from './api';
import { catStyle } from './cat-style';
import { CUR_M, PREV_M, fmt, monthOf } from './utils';

export type MangoMood = 'tranquilo' | 'curioso' | 'alerta' | 'silencio' | 'celebrando';

export type NudgeKind = 'sin-categoria' | 'spike-categoria' | 'recurrencia';

export interface Nudge {
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  cta: string;
  mood: MangoMood;
  /** Datos opcionales para que el handler de la acción los use. */
  payload?: {
    categoriaSlug?: string;
    nombreComercio?: string;
    nombresNormalizados?: string[];
  };
}

export interface NudgeContext {
  movs: UiMov[];
  userRules: Regla[];
  dismissedIds: Record<string, number>;
  /** Epoch ms del último silenciamiento global; si < ahora, silenciado. */
  silencedUntil?: number;
}

export interface NudgeResult {
  nudge: Nudge | null;
  mood: MangoMood;
}

const SPIKE_THRESHOLD = 1.2;
const SPIKE_MIN_AMOUNT = 100_000;
const RECURRENCE_MIN_COUNT = 3;
const RECURRENCE_WINDOW_DAYS = 30;

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function detectSinCategoria(movs: UiMov[]): Nudge | null {
  const pendientes = movs.filter((m) => !m.forecast && m.catId == null);
  if (pendientes.length === 0) return null;
  return {
    id: `sin-categoria-${pendientes.length}`,
    kind: 'sin-categoria',
    title:
      pendientes.length === 1
        ? 'Tenés 1 movimiento sin categorizar'
        : `Tenés ${pendientes.length} movimientos sin categorizar`,
    body: '¿Los repasamos? Toca cada uno y aprendo para próximas veces.',
    cta: 'Repasar ahora',
    mood: 'curioso',
  };
}

function detectSpikeCategoria(movs: UiMov[]): Nudge | null {
  const acc = (mes: string): Record<string, number> => {
    const out: Record<string, number> = {};
    movs.forEach((m) => {
      if (m.forecast || m.amt >= 0) return;
      if (monthOf(m.date) !== mes) return;
      const slug = m.cat ?? 'sin-categoria';
      out[slug] = (out[slug] ?? 0) + -m.amt;
    });
    return out;
  };
  const cur = acc(CUR_M);
  const prev = acc(PREV_M);
  let best: { slug: string; cur: number; prev: number; pct: number } | null = null;
  for (const [slug, curAmt] of Object.entries(cur)) {
    const prevAmt = prev[slug] ?? 0;
    if (curAmt < SPIKE_MIN_AMOUNT) continue;
    if (prevAmt <= 0) continue;
    if (curAmt < prevAmt * SPIKE_THRESHOLD) continue;
    const pct = Math.round((curAmt / prevAmt - 1) * 100);
    if (!best || pct > best.pct) best = { slug, cur: curAmt, prev: prevAmt, pct };
  }
  if (!best) return null;
  const style = catStyle(best.slug);
  return {
    id: `spike-${best.slug}-${best.pct}`,
    kind: 'spike-categoria',
    title: `Tu gasto en ${style.label} subió ${best.pct}% este mes`,
    body: `Llevás ${fmt(best.cur)} vs ${fmt(best.prev)} el mes pasado. ¿Querés ver el desglose?`,
    cta: 'Ver desglose',
    mood: 'alerta',
    payload: { categoriaSlug: best.slug },
  };
}

function detectRecurrencia(movs: UiMov[], userRules: Regla[]): Nudge | null {
  const cutoffMs = Date.now() - RECURRENCE_WINDOW_DAYS * 86_400_000;
  const groups: Record<string, UiMov[]> = {};
  movs.forEach((m) => {
    if (m.forecast || m.amt >= 0) return;
    if (new Date(m.date).getTime() < cutoffMs) return;
    const key = normalize(m.t);
    if (!key) return;
    (groups[key] = groups[key] ?? []).push(m);
  });
  // Excluir nombres que ya tienen regla user-scope.
  const yaConRegla = new Set(userRules.map((r) => r.valor_normalizado));
  let best: { key: string; sample: UiMov; count: number; categorizedSample: UiMov | null } | null = null;
  for (const [key, arr] of Object.entries(groups)) {
    if (arr.length < RECURRENCE_MIN_COUNT) continue;
    if (yaConRegla.has(key)) continue;
    // Necesitamos al menos un sample con categoría real para sugerir regla.
    const categorizedSample = arr.find((m) => m.catId != null && m.cat && m.cat !== 'sin-categoria') ?? null;
    if (!categorizedSample) continue;
    if (!best || arr.length > best.count) {
      best = { key, sample: arr[0], count: arr.length, categorizedSample };
    }
  }
  if (!best || !best.categorizedSample) return null;
  return {
    id: `recurrencia-${best.key}-${best.count}`,
    kind: 'recurrencia',
    title: `Comprás seguido en ${best.sample.t}`,
    body: `Detecté ${best.count} compras este mes. ¿Quieres que aprenda y lo categorice automático?`,
    cta: 'Crear regla',
    mood: 'curioso',
    payload: {
      nombreComercio: best.sample.t,
      nombresNormalizados: [best.key],
      categoriaSlug: best.categorizedSample.cat,
    },
  };
}

export function computeMood(ctx: NudgeContext): MangoMood {
  if (ctx.silencedUntil && ctx.silencedUntil > Date.now()) return 'silencio';
  // Si hay pendientes muchos → alerta
  const pendientes = ctx.movs.filter((m) => !m.forecast && m.catId == null).length;
  if (pendientes >= 5) return 'alerta';
  if (pendientes > 0) return 'curioso';
  if (ctx.movs.length === 0) return 'curioso';
  return 'tranquilo';
}

export function pickNudge(ctx: NudgeContext): NudgeResult {
  if (ctx.silencedUntil && ctx.silencedUntil > Date.now()) {
    return { nudge: null, mood: 'silencio' };
  }
  const candidates: Array<Nudge | null> = [
    detectSinCategoria(ctx.movs),
    detectSpikeCategoria(ctx.movs),
    detectRecurrencia(ctx.movs, ctx.userRules),
  ];
  const dismissed = ctx.dismissedIds ?? {};
  const HOUR = 3600_000;
  const stillDismissed = (id: string) => {
    const at = dismissed[id];
    return at && Date.now() - at < 24 * HOUR;
  };
  const fresh = candidates.find((n) => n != null && !stillDismissed(n.id));
  if (fresh) return { nudge: fresh, mood: fresh.mood };
  return { nudge: null, mood: computeMood(ctx) };
}
