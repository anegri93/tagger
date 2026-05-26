import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PresupuestoEstado, Regla } from '@mango/tagger-sdk';
import type { UiMov } from './api';
import { catStyle } from './cat-style';
import { CUR_M, PREV_M, fmt, monthOf, type Forecast } from './utils';
import type { MangoMood, Nudge } from './nudge-engine';

const MOOD_EMOJI: Record<MangoMood, string> = {
  tranquilo: '😎',
  curioso: '🤔',
  alerta: '😰',
  silencio: '💤',
  celebrando: '🎉',
};

const MOOD_LABEL: Record<MangoMood, string> = {
  tranquilo: 'Tranquilo',
  curioso: 'Curioso',
  alerta: 'Alerta',
  silencio: 'Silenciado',
  celebrando: 'Celebrando',
};

const MOOD_DESC: Record<MangoMood, string> = {
  tranquilo: 'Tu balance va bien. Sin alertas pendientes.',
  curioso: 'Detecté algo que vale la pena revisar.',
  alerta: 'Algo importante está pasando con tus gastos.',
  silencio: 'En pausa. Volveré cuando termine el silencio.',
  celebrando: 'Algo bueno pasó. Festejá un poco.',
};

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface ManguitoPosition {
  corner: Corner;
}

interface SilenceOption {
  label: string;
  hours: number;
}

const SILENCE_OPTIONS: SilenceOption[] = [
  { label: '1 hora', hours: 1 },
  { label: '24 horas', hours: 24 },
  { label: '7 días', hours: 24 * 7 },
];

const AVATAR = 56;
const MARGIN = 14;
const TAB_BAR_RESERVED = 96;
const TOP_RESERVED = 70;
const LONG_PRESS_MS = 550;
const DRAG_THRESHOLD = 5;

function cornerToStyle(corner: Corner): React.CSSProperties {
  switch (corner) {
    case 'tl': return { left: MARGIN, top: TOP_RESERVED, right: 'auto', bottom: 'auto' };
    case 'tr': return { right: MARGIN, top: TOP_RESERVED, left: 'auto', bottom: 'auto' };
    case 'bl': return { left: MARGIN, bottom: TAB_BAR_RESERVED, right: 'auto', top: 'auto' };
    case 'br': return { right: MARGIN, bottom: TAB_BAR_RESERVED, left: 'auto', top: 'auto' };
  }
}

function nearestCorner(x: number, y: number, w: number, h: number): Corner {
  const left = x < w / 2;
  const top = y < h / 2;
  if (top && left) return 'tl';
  if (top && !left) return 'tr';
  if (!top && left) return 'bl';
  return 'br';
}

type InsightAction =
  | { kind: 'chat'; prompt: string }
  | { kind: 'filter-pending' }
  | { kind: 'open-rules' }
  | { kind: 'open-budget'; categoriaId?: string };

interface InsightItem {
  id: string;
  icon: string;
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'info';
  action: InsightAction;
  /** true = se silencia 12h al verlo. false = sólo desaparece cuando el problema se resuelve. */
  dismissible: boolean;
}

function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

function shortAmount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + 'M';
  if (a >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

function computeInsights(
  movs: UiMov[],
  forecast: Forecast | null,
  userRules: Regla[],
  budgetEstado: PresupuestoEstado | null,
): InsightItem[] {
  const priority: InsightItem[] = [];
  const fillers: InsightItem[] = [];

  // PRIORIDAD 0: presupuesto excedido (>100%) — alta urgencia.
  if (budgetEstado && budgetEstado.items.length > 0) {
    const excedido = budgetEstado.items.find((b) => b.pct > 100);
    if (excedido) {
      priority.push({
        // Pct redondeado en el id: si sigue subiendo, nuevo insight = nuevo badge.
        id: `budget-over-${excedido.categoria_id}-${Math.floor(excedido.pct / 5) * 5}`,
        icon: '🚨', label: `Presupuesto excedido`,
        value: excedido.categoria_nombre,
        hint: `${excedido.pct}% · sobrepasaste por ${fmt(Math.abs(excedido.restante))}`,
        tone: 'warn',
        action: { kind: 'open-budget', categoriaId: excedido.categoria_id },
        dismissible: false,
      });
    } else {
      const cerca = budgetEstado.items.find((b) => b.pct >= 80);
      if (cerca) {
        priority.push({
          // Bucket de 5% en el id: pasando de 80→85→90 re-notifica.
          id: `budget-warn-${cerca.categoria_id}-${Math.floor(cerca.pct / 5) * 5}`,
          icon: '⚠️', label: 'Cerca del límite',
          value: cerca.categoria_nombre,
          hint: `${cerca.pct}% usado · restan ${fmt(cerca.restante)}`,
          tone: 'warn',
          action: { kind: 'open-budget', categoriaId: cerca.categoria_id },
          dismissible: false,
        });
      }
    }
  }

  const real = movs.filter((m) => !m.forecast);
  const cur = real.filter((m) => monthOf(m.date) === CUR_M);
  const prev = real.filter((m) => monthOf(m.date) === PREV_M);
  const gastosCur = cur.filter((m) => m.amt < 0).reduce((s, m) => s - m.amt, 0);
  const gastosPrev = prev.filter((m) => m.amt < 0).reduce((s, m) => s - m.amt, 0);
  const ingresosCur = cur.filter((m) => m.amt > 0).reduce((s, m) => s + m.amt, 0);
  const pendientes = real.filter((m) => m.catId == null);
  const sinCat = pendientes.length;

  // Cats ya cubiertos por presupuesto warn/over — para no duplicar.
  const catsEnAlerta = new Set<string>();
  if (budgetEstado) {
    budgetEstado.items.forEach((b) => {
      if (b.pct >= 80) catsEnAlerta.add(b.categoria_slug);
    });
  }

  // PRIORIDAD 1: pendientes sin categoría — acción concreta: filtrar lista.
  if (sinCat > 0) {
    priority.push({
      // Id incluye cantidad: si crece, se considera nuevo insight y rompe el silencio.
      id: `sin-categoria-${sinCat}`,
      icon: '❔', label: 'Sin categorizar',
      value: sinCat === 1 ? '1 movimiento' : `${sinCat} movimientos`,
      hint: 'Tocá para revisarlos',
      tone: 'warn',
      action: { kind: 'filter-pending' },
      dismissible: false,
    });
  }

  // PRIORIDAD 2: comercios recurrentes sin regla — sugerir crear regla.
  const yaConRegla = new Set(userRules.map((r) => r.valor_normalizado));
  const groups: Record<string, UiMov[]> = {};
  real.forEach((m) => {
    if (m.amt >= 0) return;
    const k = normalizeName(m.t);
    if (!k) return;
    (groups[k] = groups[k] ?? []).push(m);
  });
  const recurrentesSinRegla: Array<{ key: string; sample: UiMov; count: number }> = [];
  for (const [key, arr] of Object.entries(groups)) {
    if (arr.length < 3) continue;
    if (yaConRegla.has(key)) continue;
    if (!arr.some((m) => m.catId != null && m.cat && m.cat !== 'sin-categoria')) continue;
    recurrentesSinRegla.push({ key, sample: arr[0], count: arr.length });
  }
  recurrentesSinRegla.sort((a, b) => b.count - a.count);
  if (recurrentesSinRegla.length > 0) {
    const r = recurrentesSinRegla[0];
    priority.push({
      id: `rule-${r.key}-${r.count}`,
      icon: '⚙️',
      label: 'Sugerencia de regla',
      value: r.sample.t,
      hint: `${r.count} compras sin regla activa`,
      tone: 'info',
      action: { kind: 'open-rules' },
      dismissible: false,
    });
  }

  // === FILLERS (informativos, dedup vs prioridad) ===

  // Spike por categoría: gasto mes >50% sobre mes anterior (solo si ambos > 0
  // y la cat no está ya en alerta de presupuesto).
  const porCatCur: Record<string, number> = {};
  cur.forEach((m) => {
    if (m.amt >= 0 || m.catId == null) return;
    const k = m.cat ?? 'sin-categoria';
    porCatCur[k] = (porCatCur[k] ?? 0) + -m.amt;
  });
  const porCatPrev: Record<string, number> = {};
  prev.forEach((m) => {
    if (m.amt >= 0 || m.catId == null) return;
    const k = m.cat ?? 'sin-categoria';
    porCatPrev[k] = (porCatPrev[k] ?? 0) + -m.amt;
  });
  let spike: { slug: string; pct: number; cur: number; prev: number } | null = null;
  for (const [slug, curAmt] of Object.entries(porCatCur)) {
    if (slug === 'sin-categoria') continue;
    if (catsEnAlerta.has(slug)) continue;
    const prevAmt = porCatPrev[slug] ?? 0;
    if (prevAmt < 50_000 || curAmt < prevAmt * 1.5) continue;
    const pct = Math.round((curAmt / prevAmt - 1) * 100);
    if (!spike || pct > spike.pct) spike = { slug, pct, cur: curAmt, prev: prevAmt };
  }
  if (spike) {
    const st = catStyle(spike.slug);
    fillers.push({
      id: `spike-${CUR_M}-${spike.slug}`,
      icon: '📈', label: 'Subió fuerte',
      value: st.label,
      hint: `+${spike.pct}% vs mes anterior · ${fmt(spike.cur)}`,
      tone: 'warn',
      action: { kind: 'chat', prompt: `Mi gasto en ${st.label} subió ${spike.pct}% este mes. ¿Qué movimientos lo explican?` },
      dismissible: true,
    });
  }

  // Comparativa total: solo si hay delta significativo Y nadie más cubrió esto.
  if (gastosCur > 0 && gastosPrev > 0 && !spike) {
    const pct = Math.round((gastosCur / gastosPrev - 1) * 100);
    if (Math.abs(pct) >= 15) {
      fillers.push({
        id: `gastos-${CUR_M}`,
        icon: '💸', label: 'Gastos del mes',
        value: fmt(gastosCur),
        hint: pct > 0 ? `▲ ${pct}% vs mes anterior` : `▼ ${Math.abs(pct)}% vs mes anterior`,
        tone: pct > 20 ? 'warn' : pct < -10 ? 'ok' : 'info',
        action: { kind: 'chat', prompt: '¿En qué se me fueron los gastos este mes? Desglose por categoría.' },
        dismissible: true,
      });
    }
  }

  // Forecast crítico: solo si saldo proyectado < 0.
  if (forecast && forecast.phantoms.length > 0 && forecast.eomBalance < 0) {
    fillers.push({
      id: `forecast-neg-${CUR_M}`,
      icon: '⚠️', label: 'Saldo proyectado negativo',
      value: fmt(forecast.eomBalance),
      hint: `${forecast.phantoms.length} movs esperados próximos 45d`,
      tone: 'warn',
      action: { kind: 'chat', prompt: '¿Por qué mi saldo proyectado es negativo? ¿Qué movimientos esperados lo causan?' },
      dismissible: true,
    });
  }

  // Top categoría: solo si hay diversidad (no es >90% del total) Y no está cubierta por otros insights.
  const top = Object.entries(porCatCur).sort((a, b) => b[1] - a[1])[0];
  if (top && gastosCur > 0) {
    const [slug, amt] = top;
    const share = amt / gastosCur;
    const otrasCats = Object.keys(porCatCur).length >= 2;
    const yaCubierta = catsEnAlerta.has(slug) || (spike && spike.slug === slug);
    if (otrasCats && share < 0.9 && !yaCubierta) {
      const st = catStyle(slug);
      fillers.push({
        id: `topcat-${CUR_M}-${slug}`,
        icon: st.emoji, label: 'Top categoría',
        value: st.label,
        hint: `${fmt(amt)} · ${Math.round(share * 100)}% del gasto`,
        tone: 'info',
        action: { kind: 'chat', prompt: `¿Cuánto gasté en ${st.label} este mes y en qué se fue?` },
        dismissible: true,
      });
    }
  }

  // Balance: solo si negativo (positivo es no-noticia salvo celebración futura).
  const balance = ingresosCur - gastosCur;
  if (gastosCur > 0 && ingresosCur > 0 && balance < 0) {
    fillers.push({
      id: `balance-neg-${CUR_M}`,
      icon: '📉', label: 'Balance negativo',
      value: '- ' + fmt(Math.abs(balance)),
      hint: `Gastaste más de lo que ingresó`,
      tone: 'warn',
      action: { kind: 'chat', prompt: 'Mi balance del mes es negativo. ¿Dónde está el problema?' },
      dismissible: true,
    });
  }

  const out = [...priority, ...fillers].slice(0, 3);
  if (out.length === 0) {
    out.push({
      id: 'empty',
      icon: '✨', label: 'Sin datos',
      value: 'Cargá algunos movimientos',
      tone: 'info',
      action: { kind: 'chat', prompt: '¿Qué puedo hacer con Manguito?' },
      dismissible: true,
    });
  }
  return out;
}

function InsightsStack({
  insights, style, isLeft, isTop, onAction, header, variant,
}: {
  insights: InsightItem[];
  style: React.CSSProperties;
  isLeft: boolean;
  isTop: boolean;
  onAction: (it: InsightItem) => void;
  header?: string;
  /** 'insights' = jerarquía (primero grande, resto compactos). 'suggestions' = chips uniformes. */
  variant?: 'insights' | 'suggestions';
}) {
  const items = insights.slice(0, 3);
  if (items.length === 0) return null;
  const isSugg = variant === 'suggestions';
  return (
    <div
      className={'manguito-stack ' + (isLeft ? 'side-left' : 'side-right') + ' ' + (isTop ? 'side-top' : 'side-bottom')}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {header && <div className="manguito-stack-header">{header}</div>}
      {items.map((it, i) => {
        const isPrimary = !isSugg && i === 0;
        const cls = isSugg
          ? 'manguito-stack-card sugg'
          : `manguito-stack-card tone-${it.tone ?? 'info'} ${isPrimary ? 'primary' : 'compact'}`;
        return (
          <button
            type="button"
            key={i}
            className={cls}
            style={{ animationDelay: (i * 60) + 'ms' } as React.CSSProperties}
            onClick={(e) => { e.stopPropagation(); onAction(it); }}
          >
            {isSugg ? (
              <div className="manguito-stack-sugg">{it.value}</div>
            ) : isPrimary ? (
              <>
                <div className="manguito-stack-label">{it.label}</div>
                <div className="manguito-stack-value">{it.value}</div>
                {it.hint && <div className="manguito-stack-hint">{it.hint}</div>}
              </>
            ) : (
              <div className="manguito-stack-compact">
                <span className="manguito-stack-compact-label">{it.label}</span>
                <span className="manguito-stack-compact-value">{it.value}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Manguito({
  mood, nudge, onCTA, onDismiss, onSilence, onUnsilence,
  silencedUntil, onOpenChat, onAskChat, onFilterPending, onOpenRules, onOpenBudget, userRules, budgetEstado,
  seenInsights, onMarkSeen,
  position, onPositionChange,
  movs, forecast,
}: {
  mood: MangoMood;
  nudge: Nudge | null;
  onCTA: (n: Nudge) => void;
  onDismiss: (n: Nudge) => void;
  onSilence: (hours: number) => void;
  onUnsilence: () => void;
  silencedUntil?: number;
  onOpenChat: () => void;
  onAskChat: (q: string) => void;
  onFilterPending: () => void;
  onOpenRules: () => void;
  onOpenBudget: (categoriaId?: string) => void;
  userRules: Regla[];
  budgetEstado: PresupuestoEstado | null;
  /** Map id→timestamp ms de insights ya vistos (para silenciar dismissibles 12h). */
  seenInsights: Record<string, number>;
  /** Marca un set de ids como vistos ahora. */
  onMarkSeen: (ids: string[]) => void;
  position: ManguitoPosition;
  onPositionChange: (p: ManguitoPosition) => void;
  movs: UiMov[];
  forecast: Forecast | null;
}) {
  type PanelKind = null | 'insights' | 'menu';
  const [panel, setPanel] = useState<PanelKind>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const phoneRef = useRef<HTMLElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const emoji = MOOD_EMOJI[mood] ?? '🤔';
  const insights = useMemo(() => computeInsights(movs, forecast, userRules, budgetEstado), [movs, forecast, userRules, budgetEstado]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    movedRef.current = false;
    longPressFiredRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    const phone = (e.currentTarget.closest('.phone') as HTMLElement) ?? null;
    phoneRef.current = phone;
    if (!phone) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    e.currentTarget.setPointerCapture(e.pointerId);
    // Arrancar timer de long-press.
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      if (!movedRef.current) {
        longPressFiredRef.current = true;
        setPanel('menu');
        try { navigator.vibrate?.(15); } catch { /* ignore */ }
      }
    }, LONG_PRESS_MS);
  }, [clearLongPress]);

  const finishDrag = useCallback(() => {
    clearLongPress();
    if (movedRef.current && phoneRef.current && dragPos) {
      const rect = phoneRef.current.getBoundingClientRect();
      const corner = nearestCorner(dragPos.x + AVATAR / 2, dragPos.y + AVATAR / 2, rect.width, rect.height);
      onPositionChange({ corner });
    } else if (!movedRef.current && !longPressFiredRef.current) {
      // Tap rápido → insights.
      setPanel((p) => (p === 'insights' ? null : 'insights'));
    }
    setDragOffset(null);
    setDragPos(null);
    movedRef.current = false;
    startRef.current = null;
  }, [clearLongPress, dragPos, onPositionChange]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragOffset || !startRef.current || !phoneRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      movedRef.current = true;
      clearLongPress();
    }
    const phoneRect = phoneRef.current.getBoundingClientRect();
    const x = e.clientX - phoneRect.left - dragOffset.x;
    const y = e.clientY - phoneRect.top - dragOffset.y;
    setDragPos({
      x: Math.max(MARGIN, Math.min(phoneRect.width - AVATAR - MARGIN, x)),
      y: Math.max(MARGIN, Math.min(phoneRect.height - AVATAR - MARGIN, y)),
    });
  }, [clearLongPress, dragOffset]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    finishDrag();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, [finishDrag]);

  useEffect(() => {
    if (!dragOffset) return;
    const onWinUp = () => finishDrag();
    const onWinMove = (e: PointerEvent) => {
      if (!dragOffset || !startRef.current || !phoneRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        movedRef.current = true;
        clearLongPress();
      }
      const phoneRect = phoneRef.current.getBoundingClientRect();
      const x = e.clientX - phoneRect.left - dragOffset.x;
      const y = e.clientY - phoneRect.top - dragOffset.y;
      setDragPos({
        x: Math.max(MARGIN, Math.min(phoneRect.width - AVATAR - MARGIN, x)),
        y: Math.max(MARGIN, Math.min(phoneRect.height - AVATAR - MARGIN, y)),
      });
    };
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
    window.addEventListener('pointermove', onWinMove);
    return () => {
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
      window.removeEventListener('pointermove', onWinMove);
    };
  }, [dragOffset, finishDrag, clearLongPress]);

  // Cuando se abre el stack, marcar como vistos los insights dismissibles actuales.
  useEffect(() => {
    if (panel !== 'insights') return;
    // Solo marcar como vistos los insights REALES (no las sugerencias de chat).
    if (insightsFrescos.length === 0) return;
    const ids = insightsFrescos.filter((it) => it.dismissible).map((it) => it.id);
    if (ids.length > 0) onMarkSeen(ids);
  }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar panel al tocar fuera de manguito (avatar / stack / menu).
  useEffect(() => {
    if (!panel) return;
    const onOutside = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('.manguito-avatar, .manguito-stack, .manguito-menu, .manguito-bubble')) return;
      setPanel(null);
    };
    window.addEventListener('pointerdown', onOutside, true);
    return () => window.removeEventListener('pointerdown', onOutside, true);
  }, [panel]);

  const cornerStyle = cornerToStyle(position.corner);
  const liveStyle: React.CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto', cursor: 'grabbing' }
    : { ...cornerStyle, cursor: 'grab' };

  const isLeft = position.corner === 'tl' || position.corner === 'bl';
  const isTop = position.corner === 'tl' || position.corner === 'tr';

  const panelStyle: React.CSSProperties = {
    [isLeft ? 'left' : 'right']: (AVATAR + 22) + 'px',
    [isTop ? 'top' : 'bottom']: '0px',
  };
  // Stack de 3 burbujas: ancla horizontal alineada con avatar (sale "desde" él),
  // vertical: arriba del avatar si esquina inferior, abajo si esquina superior.
  const stackStyle: React.CSSProperties = {
    [isLeft ? 'left' : 'right']: MARGIN + 'px',
    [isTop ? 'top' : 'bottom']: (isTop ? TOP_RESERVED + AVATAR + 14 : TAB_BAR_RESERVED + AVATAR + 14) + 'px',
  };
  const silencioMinutes = silencedUntil && silencedUntil > Date.now()
    ? Math.ceil((silencedUntil - Date.now()) / 60_000)
    : 0;

  // Insights frescos:
  // - Si data ya no sostiene el insight, computeInsights ni lo emite (resuelto).
  // - Si data sigue sosteniéndolo pero user ya lo atendió, silenciar por TTL.
  //   Dismissible (info): 12h. Actionable (acción): 24h.
  const TTL_INFO = 12 * 3600_000;
  const TTL_ACTION = 24 * 3600_000;
  const now = Date.now();
  const insightsFrescos = insights.filter((it) => {
    const seenAt = seenInsights[it.id];
    if (!seenAt) return true;
    const ttl = it.dismissible ? TTL_INFO : TTL_ACTION;
    return (now - seenAt) > ttl;
  });
  const actionablesFrescos = insightsFrescos.filter((it) => !it.dismissible);
  const accionCount = actionablesFrescos.length;

  // Hint: badge rojo con número si hay accionables, "..." azul sutil si solo informativos.
  const showHint = !panel && !dragPos && insightsFrescos.length > 0 && silencioMinutes === 0;
  const hintKind: 'count' | 'dots' = accionCount > 0 ? 'count' : 'dots';

  // Si no hay insights frescos pero usuario tapea Manguito → mostrar sugerencias de chat.
  const chatSuggestions: InsightItem[] = useMemo(() => [
    {
      id: 'sug-semana', icon: '📅', label: 'Hablá con Manguito',
      value: '¿Cuánto gasté esta semana?',
      tone: 'info', dismissible: true,
      action: { kind: 'chat', prompt: '¿Cuánto gasté esta semana? Mostrame el detalle.' },
    },
    {
      id: 'sug-topcat', icon: '🍩', label: 'Hablá con Manguito',
      value: '¿En qué categorías gasto más?',
      tone: 'info', dismissible: true,
      action: { kind: 'chat', prompt: '¿En qué categorías gasto más este mes? Rankeámelas.' },
    },
    {
      id: 'sug-balance', icon: '📊', label: 'Hablá con Manguito',
      value: '¿Cómo va mi balance?',
      tone: 'info', dismissible: true,
      action: { kind: 'chat', prompt: 'Resumime cómo va mi balance del mes: ingresos vs gastos.' },
    },
  ], []);
  const displayInsights = insightsFrescos.length > 0 ? insightsFrescos : chatSuggestions;
  const hintStyle: React.CSSProperties = {
    [isLeft ? 'left' : 'right']: (MARGIN + AVATAR + 6) + 'px',
    [isTop ? 'top' : 'bottom']: (isTop ? TOP_RESERVED + 18 : TAB_BAR_RESERVED + 18) + 'px',
  };

  return (
    <>
      {showHint && (
        <button
          className={'manguito-hint manguito-hint-' + hintKind}
          style={hintStyle}
          data-side={isLeft ? 'left' : 'right'}
          onClick={(e) => { e.stopPropagation(); setPanel('insights'); }}
          aria-label={hintKind === 'count' ? `${accionCount} alerta(s) de Manguito` : 'Ver insights de Manguito'}
        >
          {hintKind === 'count' ? (
            <span className="manguito-hint-count">{accionCount}</span>
          ) : (
            <>
              <span className="manguito-hint-dot" />
              <span className="manguito-hint-dot" />
              <span className="manguito-hint-dot" />
            </>
          )}
        </button>
      )}

      {panel && !dragPos && (
        <div className="manguito-backdrop" onClick={() => setPanel(null)} />
      )}

      {panel === 'insights' && !dragPos && (
        <InsightsStack
          insights={displayInsights}
          style={stackStyle}
          isLeft={isLeft}
          isTop={isTop}
          variant={insightsFrescos.length === 0 ? 'suggestions' : 'insights'}
          header={insightsFrescos.length === 0 ? '💬 Preguntale a Manguito' : undefined}
          onAction={(it) => {
            setPanel(null);
            // Marcar como atendido — silencia el badge según TTL (info 12h, acción 24h).
            onMarkSeen([it.id]);
            switch (it.action.kind) {
              case 'chat': onAskChat(it.action.prompt); break;
              case 'filter-pending': onFilterPending(); break;
              case 'open-rules': onOpenRules(); break;
              case 'open-budget': onOpenBudget(it.action.categoriaId); break;
            }
          }}
        />
      )}

      {panel === 'menu' && (
        <div
          className="manguito-menu compact"
          style={{
            [isLeft ? 'left' : 'right']: (MARGIN + AVATAR / 2) + 'px',
            [isTop ? 'top' : 'bottom']: (isTop ? TOP_RESERVED + AVATAR + 14 : TAB_BAR_RESERVED + AVATAR + 14) + 'px',
          } as React.CSSProperties}
          data-side={isLeft ? 'left' : 'right'}
        >
          <button className="manguito-menu-item primary" onClick={() => { setPanel(null); onOpenChat(); }}>
            💬 Hablar
          </button>
          {silencioMinutes > 0 ? (
            <button className="manguito-menu-item" onClick={() => { onUnsilence(); setPanel(null); }}>
              🔔 Reactivar ({silencioMinutes < 60 ? silencioMinutes + 'min' : Math.round(silencioMinutes / 60) + 'h'})
            </button>
          ) : (
            <div className="manguito-menu-silence-options">
              {SILENCE_OPTIONS.map((o) => (
                <button key={o.hours} className="manguito-menu-chip" onClick={() => { onSilence(o.hours); setPanel(null); }}>
                  🔕 {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        className={'manguito-avatar manguito-mood-' + mood}
        style={liveStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Manguito (tap: insights · hold: opciones)"
        aria-label="Manguito"
        data-demo-pulse="manguito"
      >
        <span className="manguito-face">{emoji}</span>
      </button>
    </>
  );
}
