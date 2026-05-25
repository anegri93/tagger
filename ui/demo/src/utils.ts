import type { UiMov } from './api';
import { catStyle } from './cat-style';

export const fmt = (n: number) => 'Gs. ' + Math.abs(n).toLocaleString('es-PY');
export const monthOf = (d: string) => d.slice(0, 7);

const today = new Date();
export const TODAY_YMD = today.toISOString().slice(0, 10);
export const CUR_M = TODAY_YMD.slice(0, 7);
const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
export const PREV_M = prev.toISOString().slice(0, 7);

export function dayLabel(d: string): string {
  if (d === TODAY_YMD) return 'Hoy';
  const [, mo, da] = d.split('-');
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${parseInt(da, 10)} ${months[parseInt(mo, 10) - 1]}`;
}

export const fmtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + 'M';
  if (a >= 1_000) return Math.round(n / 1_000) + 'k';
  return n + '';
};

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const TODAY_DT = today;
export const HORIZON_DAYS = 45;

export interface Summary {
  gastosCur: number;
  ingresosCur: number;
  gastosPrev: number;
}

export function computeSummary(movs: UiMov[]): Summary {
  const sum = (mm: string, sign: 'neg' | 'pos') =>
    movs
      .filter((m) => monthOf(m.date) === mm)
      .reduce((s, m) => s + (sign === 'neg' ? (m.amt < 0 ? -m.amt : 0) : m.amt > 0 ? m.amt : 0), 0);
  return {
    gastosCur: sum(CUR_M, 'neg'),
    ingresosCur: sum(CUR_M, 'pos'),
    gastosPrev: sum(PREV_M, 'neg'),
  };
}

export interface InsightItem {
  id: string;
  icon: string;
  tag: string;
  title: string;
  body: string;
  cta: string;
}

export function generateInsights(movs: UiMov[]): InsightItem[] {
  const out: InsightItem[] = [];
  const byMerchCur: Record<string, number> = {};
  const byMerchPrev: Record<string, number> = {};
  movs.forEach((m) => {
    if (m.amt >= 0) return;
    const b =
      monthOf(m.date) === CUR_M ? byMerchCur : monthOf(m.date) === PREV_M ? byMerchPrev : null;
    if (b) b[m.t] = (b[m.t] || 0) + -m.amt;
  });
  for (const [name, cur] of Object.entries(byMerchCur)) {
    const prevV = byMerchPrev[name] || 0;
    if (prevV > 0 && cur > prevV * 1.1) {
      const pct = Math.round((cur / prevV - 1) * 100);
      out.push({
        id: 'm-' + name,
        icon: '📈',
        tag: 'Variación merchant',
        title: `Tus gastos en ${name.split('-')[0].trim()} subieron ${pct}% este mes`,
        body: `Gastaste ${fmt(cur)} vs ${fmt(prevV)} el mes pasado.`,
        cta: 'Ver detalle',
      });
    }
  }
  const catCur: Record<string, number> = {};
  const catPrev: Record<string, number> = {};
  movs.forEach((m) => {
    if (m.amt >= 0) return;
    const b = monthOf(m.date) === CUR_M ? catCur : monthOf(m.date) === PREV_M ? catPrev : null;
    if (b) b[m.cat] = (b[m.cat] || 0) + -m.amt;
  });
  for (const [cat, cur] of Object.entries(catCur)) {
    const prevV = catPrev[cat] || 0;
    if (prevV > 0 && cur > prevV * 1.2) {
      const pct = Math.round((cur / prevV - 1) * 100);
      out.push({
        id: 'c-' + cat,
        icon: '🗂️',
        tag: 'Gasto por categoría',
        title: `Gastás ${pct}% más en ${catStyle(cat).label} este mes`,
        body: `Llevás ${fmt(cur)} vs ${fmt(prevV)} el mes pasado.`,
        cta: 'Ver movimientos',
      });
    }
  }
  return out;
}

export interface Phantom extends UiMov {
  forecast: true;
  confidence: 'alta' | 'media' | 'baja';
}

export interface Forecast {
  phantoms: Phantom[];
  projectedByDate: Record<string, number>;
  eomBalance: number;
  balanceNow: number;
}

function detectRecurrence(movs: UiMov[]) {
  const groups: Record<string, UiMov[]> = {};
  movs.forEach((m) => {
    (groups[m.t] = groups[m.t] || []).push(m);
  });
  const recs: Array<{
    name: string;
    avgGap: number;
    last: UiMov;
    amt: number;
    conf: 'alta' | 'media' | 'baja';
    ic: UiMov['ic'];
    s: string;
  }> = [];
  for (const [name, arr] of Object.entries(groups)) {
    if (arr.length < 2) continue;
    const sorted = arr.slice().sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(
        (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86_400_000,
      );
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    // Guard: avgGap < 1 día (mismo día o backwards) → no es recurrente real, evita loop infinito en forecastEngine.
    if (!Number.isFinite(avgGap) || avgGap < 1) continue;
    const variance = gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length;
    const last = sorted[sorted.length - 1];
    const conf = variance < 10 ? 'alta' : variance < 50 ? 'media' : 'baja';
    if (arr.length >= 2 && avgGap >= 20 && avgGap <= 40) {
      recs.push({ name, avgGap: 30, last, amt: last.amt, conf, ic: last.ic, s: last.s });
    } else if (arr.length >= 3) {
      recs.push({ name, avgGap, last, amt: last.amt, conf, ic: last.ic, s: last.s });
    }
  }
  return recs;
}

export function forecastEngine(movs: UiMov[], dismissed: Record<string, boolean>): Forecast {
  const recs = detectRecurrence(movs);
  const phantoms: Phantom[] = [];
  let pid = 1000;
  recs.forEach((r) => {
    const step = Math.max(1, Math.round(r.avgGap));
    let next = addDays(new Date(r.last.date), step);
    let iter = 0;
    while (next <= addDays(TODAY_DT, HORIZON_DAYS) && iter++ < 200) {
      if (next > TODAY_DT) {
        const id = 'p-' + pid++;
        if (!dismissed[id] && !dismissed['pname-' + r.name]) {
          phantoms.push({
            id,
            date: ymd(next),
            t: r.name,
            s: r.s || 'Estimado',
            amt: r.amt,
            ic: r.ic,
            cat: r.last.cat,
            catId: r.last.catId,
            forecast: true,
            confidence: r.conf,
            recurring: true,
          });
        }
      }
      next = addDays(next, step);
    }
  });
  const balanceNow = movs.reduce((s, m) => s + m.amt, 0);
  const projectedByDate: Record<string, number> = {};
  let running = balanceNow;
  const sortedPhantoms = phantoms.slice().sort((a, b) => a.date.localeCompare(b.date));
  sortedPhantoms.forEach((p) => {
    running += p.amt;
    projectedByDate[p.date] = running;
  });
  const eom = new Date(TODAY_DT.getFullYear(), TODAY_DT.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const eomBalance = sortedPhantoms.filter((p) => p.date <= eom).reduce((s, p) => s + p.amt, balanceNow);
  return { phantoms: sortedPhantoms, projectedByDate, eomBalance, balanceNow };
}

const PERSON_NAMES = /^(bianca|juan|mar.a|pedro|ana|carlos)$/i;

export interface Trait {
  id: string;
  label: string;
  emoji: string;
  score: number;
}

export interface Profile {
  traits: Trait[];
  dominant: Trait;
  phrase: string;
  cohortDelta: number;
  sparkline: number[];
}

export function personalityEngine(movs: UiMov[]): Profile {
  const cur = movs.filter((m) => monthOf(m.date) === CUR_M);
  const totalGasto = cur.filter((m) => m.amt < 0).reduce((s, m) => s - m.amt, 0) || 1;
  const totalIngreso = cur.filter((m) => m.amt > 0).reduce((s, m) => s + m.amt, 0);
  const restGasto = cur
    .filter((m) => m.amt < 0 && (m.cat === 'restaurante' || m.cat === 'cafeteria' || /pedidosya|uber/i.test(m.t)))
    .reduce((s, m) => s - m.amt, 0);
  const combGasto = cur.filter((m) => m.amt < 0 && m.cat === 'combustible').reduce((s, m) => s - m.amt, 0);
  const sentToPeople = cur
    .filter((m) => m.amt < 0 && PERSON_NAMES.test(m.t))
    .reduce((s, m) => s - m.amt, 0);
  const byDay: Record<string, number> = {};
  cur.forEach((m) => {
    if (m.amt < 0) byDay[m.date] = (byDay[m.date] || 0) + 1;
  });
  const burstDays = Object.values(byDay).filter((n) => n >= 3).length;
  const traits: Trait[] = [
    { id: 'foodie', label: 'Foodie', emoji: '🍔', score: Math.min(100, Math.round((restGasto / totalGasto) * 100 * 2.5)) },
    { id: 'social', label: 'Social', emoji: '😎', score: Math.min(100, Math.round((sentToPeople / totalGasto) * 100 * 4)) },
    { id: 'viajero', label: 'En movimiento', emoji: '✈️', score: Math.min(100, Math.round((combGasto / totalGasto) * 100 * 3)) },
    {
      id: 'ahorrador',
      label: 'Ahorrador',
      emoji: '🐜',
      score: Math.min(100, Math.max(0, Math.round(((totalIngreso - totalGasto) / Math.max(totalIngreso, 1)) * 100))),
    },
    { id: 'impulsivo', label: 'Impulsivo', emoji: '😰', score: Math.min(100, burstDays * 20) },
  ].sort((a, b) => b.score - a.score);
  const dominant = traits[0];
  const phrases: Record<string, string> = {
    foodie: `${Math.round((restGasto / totalGasto) * 100)}% de tu gasto fue comida fuera`,
    social: `Mandaste ${fmt(sentToPeople)} a personas este mes`,
    viajero: `Combustible: ${fmt(combGasto)} este mes`,
    ahorrador: `Llevás ${fmt(totalIngreso - totalGasto)} de balance positivo`,
    impulsivo: `${burstDays} días con muchos gastos seguidos`,
  };
  return {
    traits,
    dominant,
    phrase: phrases[dominant.id] ?? '',
    cohortDelta: 23,
    sparkline: [42, 55, 48, 67, 72, 65, 80],
  };
}

export interface ChatReply {
  text: string;
  evidence?: Array<string | number>;
  suggestions?: string[];
  action?: { type: 'dismissPhantom'; name: string };
}

export function chatEngine(
  movs: UiMov[],
  profile: Profile,
  forecast: Forecast,
  question: string,
): ChatReply {
  const q = question.toLowerCase().trim();
  if (!q) return { text: 'Contame qué querés saber sobre tu plata.' };
  if (/finde|fin de semana|weekend|sabado|domingo/.test(q)) {
    const we = movs.filter((m) => {
      const d = new Date(m.date).getDay();
      return m.amt < 0 && (d === 0 || d === 6);
    });
    const tot = we.reduce((s, m) => s - m.amt, 0);
    const top = we.slice(0, 3).map((m) => m.id);
    return {
      text: `El último finde gastaste ${fmt(tot)} en ${we.length} movimientos. Top:`,
      evidence: top,
      suggestions: ['¿Y el finde anterior?', '¿Cuánto en delivery?'],
    };
  }
  if (/llego.*mes|alcanza|fin.*mes|saldo.*proyect|saldo.*futuro/.test(q)) {
    const eom = forecast.eomBalance;
    const tone = eom > 500_000 ? 'Vas bien' : eom > 0 ? 'Vas justo' : 'Saldo ajustado';
    return {
      text: `${tone}. Saldo estimado fin de mes: ${fmt(eom)}. Considera ${forecast.phantoms.length} movimientos esperados.`,
      evidence: forecast.phantoms.slice(0, 5).map((p) => p.id),
      suggestions: ['Cancelar Netflix', '¿Qué gastos vienen?'],
    };
  }
  if (/qu. (viene|gastos vienen)|pr.ximos|futuro/.test(q)) {
    return {
      text: `Vienen ${forecast.phantoms.length} movimientos estimados en los próximos 30 días.`,
      evidence: forecast.phantoms.slice(0, 6).map((p) => p.id),
      suggestions: ['Cancelar Netflix', 'Cancelar Spotify'],
    };
  }
  const mCancel = q.match(/cancelar?\s+(.+)/);
  if (mCancel) {
    const target = mCancel[1].trim();
    const found = forecast.phantoms.find((p) => p.t.toLowerCase().includes(target));
    if (found) {
      return {
        text: `Listo. Marqué "${found.t}" como cancelado. Recalculo tu saldo proyectado.`,
        action: { type: 'dismissPhantom', name: found.t },
        suggestions: ['¿Cuánto ahorré?', '¿Llego a fin de mes?'],
      };
    }
    return { text: `No encontré "${target}" entre tus recurrentes.` };
  }
  if (/personalidad|perfil|qui.n soy|c.mo gasto/.test(q)) {
    const top3 = profile.traits.slice(0, 3).map((t) => `${t.emoji} ${t.label} (${t.score})`).join(' · ');
    return {
      text: `Tu perfil este mes: ${top3}. Trait dominante: ${profile.dominant.label}. ${profile.phrase}.`,
      suggestions: ['¿Cómo bajo delivery?', '¿Llego a fin de mes?'],
    };
  }
  return {
    text: 'No entendí del todo. Probá alguna de estas:',
    suggestions: ['¿En qué gasté el finde?', '¿Llego a fin de mes?', '¿Quién soy gastando?'],
  };
}

export function loadLS<T>(k: string, d: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : d;
  } catch {
    return d;
  }
}

export function saveLS(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // ignore
  }
}
