import React, { useMemo, useState } from 'react';
import type { UiMov } from './api';
import { catStyle } from './cat-style';
import {
  CUR_M, TODAY_DT, addDays, dayLabel, fmt, fmtShort, monthOf, type Forecast, type InsightItem,
} from './utils';
import { MovIcon } from './icons';

interface CatAgg {
  cat: string;
  amt: number;
  pct: number;
  color: string;
  emoji: string;
  label: string;
}

function aggregateByCat(movs: UiMov[]): CatAgg[] {
  const map: Record<string, number> = {};
  movs.forEach((m) => {
    if (m.amt >= 0 || m.forecast) return;
    if (monthOf(m.date) !== CUR_M) return;
    map[m.cat] = (map[m.cat] || 0) + -m.amt;
  });
  const total = Object.values(map).reduce((s, n) => s + n, 0) || 1;
  return Object.entries(map)
    .map(([cat, amt]) => {
      const st = catStyle(cat);
      return { cat, amt, pct: Math.round((amt / total) * 100), color: st.color, emoji: st.emoji, label: st.label };
    })
    .sort((a, b) => b.amt - a.amt);
}

function Donut({ data, total }: { data: CatAgg[]; total: number }) {
  const R = 50;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut-svg">
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f4f9" strokeWidth="16" />
        {data.map((d) => {
          const len = (d.amt / (total || 1)) * C;
          const seg = (
            <circle
              key={d.cat}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="donut-center">
        <div>
          <div className="lbl">Gasto mes</div>
          <div className="val">{fmt(total)}</div>
        </div>
      </div>
    </div>
  );
}

export function CategoriesView({ movs, onPickCat }: { movs: UiMov[]; onPickCat: (c: string) => void }) {
  const data = useMemo(() => aggregateByCat(movs), [movs]);
  const total = data.reduce((s, d) => s + d.amt, 0);
  if (data.length === 0) {
    return <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 30 }}>Sin gastos este mes</p>;
  }
  return (
    <>
      <div className="vscope">
        <span className="dot" />Este mes · {fmt(total)} en gastos
      </div>
      <div className="donut-wrap">
        <Donut data={data} total={total} />
        <div className="donut-legend">
          {data.slice(0, 5).map((d) => (
            <div className="it" key={d.cat}>
              <span className="sw" style={{ background: d.color }} />
              <b>{d.label}</b>
              <span className="pct">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cat-list">
        {data.map((d) => (
          <div className="cat-row" key={d.cat} onClick={() => onPickCat(d.cat)}>
            <div className="ic" style={{ background: d.color + '22', color: d.color }}>{d.emoji}</div>
            <div className="mid">
              <b>{d.label}</b>
              <div className="bar2"><i style={{ width: d.pct + '%', background: d.color }} /></div>
            </div>
            <div className="amt">{fmt(d.amt)}<small>{d.pct}%</small></div>
          </div>
        ))}
      </div>
    </>
  );
}

export function TopView({ movs, onSel }: { movs: UiMov[]; onSel: (id: string | number) => void }) {
  const top = useMemo(
    () =>
      movs
        .filter((m) => m.amt < 0 && !m.forecast && monthOf(m.date) === CUR_M)
        .sort((a, b) => a.amt - b.amt)
        .slice(0, 10),
    [movs],
  );
  if (top.length === 0) {
    return <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 30 }}>Sin gastos este mes</p>;
  }
  const sumTop = top.reduce((s, m) => s - m.amt, 0);
  return (
    <div>
      <div className="vscope">
        <span className="dot" />Este mes · top {top.length} gastos · {fmt(sumTop)}
      </div>
      {top.map((m, i) => {
        const c = catStyle(m.cat);
        const numCls = i === 0 ? 'num gold' : i === 1 ? 'num silver' : i === 2 ? 'num bronze' : 'num';
        return (
          <div className="rank-row" key={m.id} onClick={() => onSel(m.id)}>
            <div className={numCls}>{i + 1}</div>
            <MovIcon type={m.ic} />
            <div className="mid" style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.t}</b>
              <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                <small style={{ color: 'var(--muted)', fontSize: 12 }}>{dayLabel(m.date)}</small>
                <span className={'cat ' + c.cls}>{c.label}</span>
              </div>
            </div>
            <div className="amt neg">- {fmt(m.amt)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CashflowView({ movs }: { movs: UiMov[] }) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const periods = useMemo(() => {
    const out: Array<{ label: string; longLabel: string; ingresos: number; gastos: number }> = [];
    if (mode === 'week') {
      for (let w = 5; w >= 0; w--) {
        const end = addDays(TODAY_DT, -w * 7);
        const start = addDays(end, -6);
        const items = movs.filter((m) => {
          if (m.forecast) return false;
          const d = new Date(m.date);
          return d >= start && d <= end;
        });
        const ingresos = items.filter((m) => m.amt > 0).reduce((s, m) => s + m.amt, 0);
        const gastos = items.filter((m) => m.amt < 0).reduce((s, m) => s - m.amt, 0);
        out.push({
          label: `${start.getDate()}/${start.getMonth() + 1}`,
          longLabel: `Sem ${start.getDate()}/${start.getMonth() + 1}`,
          ingresos,
          gastos,
        });
      }
    } else {
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      for (let m = 5; m >= 0; m--) {
        const ref = new Date(TODAY_DT.getFullYear(), TODAY_DT.getMonth() - m, 1);
        const ym = ref.toISOString().slice(0, 7);
        const items = movs.filter((x) => !x.forecast && monthOf(x.date) === ym);
        const ingresos = items.filter((x) => x.amt > 0).reduce((s, x) => s + x.amt, 0);
        const gastos = items.filter((x) => x.amt < 0).reduce((s, x) => s - x.amt, 0);
        out.push({
          label: months[ref.getMonth()],
          longLabel: `${months[ref.getMonth()]} ${ref.getFullYear()}`,
          ingresos,
          gastos,
        });
      }
    }
    return out;
  }, [movs, mode]);

  const totIn = periods.reduce((s, p) => s + p.ingresos, 0);
  const totOut = periods.reduce((s, p) => s + p.gastos, 0);
  const net = totIn - totOut;
  const max = Math.max(...periods.flatMap((p) => [p.ingresos, p.gastos]), 1);
  const withNet = periods.map((p) => ({ ...p, n: p.ingresos - p.gastos }));
  const onlyActive = withNet.filter((p) => p.ingresos + p.gastos > 0);
  const best = onlyActive.length ? onlyActive.reduce((b, p) => (p.n > b.n ? p : b)) : null;
  const worst = onlyActive.length ? onlyActive.reduce((b, p) => (p.n < b.n ? p : b)) : null;
  const avgGastos = periods.length ? totOut / periods.length : 0;
  const scopeLabel = mode === 'week' ? 'Últimas 6 semanas' : 'Últimos 6 meses';
  const periodWord = mode === 'week' ? 'semana' : 'mes';

  return (
    <>
      <div className="vscope"><span className="dot" />{scopeLabel} · ingresos vs gastos</div>
      <div className="cf-toggle">
        <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Semanas</button>
        <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Meses</button>
      </div>
      <div className="cf-kpis">
        <div className="cf-kpi"><small>Ingresos</small><b className="pos">+ {fmt(totIn)}</b></div>
        <div className="cf-kpi"><small>Gastos</small><b className="neg">- {fmt(totOut)}</b></div>
        <div className="cf-kpi"><small>Neto</small><b className={'net ' + (net >= 0 ? 'pos' : 'neg')}>{net >= 0 ? '+ ' : '- '}{fmt(net)}</b></div>
      </div>
      <div className="cf-card">
        <div className="cf-legend">
          <span><span className="dot" style={{ background: 'var(--teal)' }} />Ingresos</span>
          <span><span className="dot" style={{ background: 'var(--pink)' }} />Gastos</span>
        </div>
        <div className="cf-bars">
          {periods.map((p, i) => {
            const isBest = best && p.label === best.label && best.n > 0;
            const isWorst = worst && p.label === worst.label && worst.n < 0;
            const cls = 'cf-week' + (isBest ? ' best' : isWorst ? ' worst' : '');
            const n = p.ingresos - p.gastos;
            return (
              <div className={cls} key={i} title={`${p.longLabel}\n+ ${fmt(p.ingresos)}\n- ${fmt(p.gastos)}\nNeto ${n >= 0 ? '+ ' : '- '}${fmt(n)}`}>
                {p.ingresos + p.gastos > 0 && (
                  <span className={'cf-net ' + (n < 0 ? 'neg' : '')}>{n >= 0 ? '+' : '-'}{fmtShort(Math.abs(n))}</span>
                )}
                <div className="cf-pair">
                  <div className="cf-bar in" style={{ height: (p.ingresos / max) * 100 + '%' }} />
                  <div className="cf-bar out" style={{ height: (p.gastos / max) * 100 + '%' }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="cf-labels">
          {periods.map((p, i) => <span key={i}>{p.label}</span>)}
        </div>
      </div>
      {(best || worst) && (
        <div className="cf-highlights">
          {best && <div className="cf-hl best"><b>🏆 Mejor {periodWord}</b>{best.longLabel} · {best.n >= 0 ? '+' : '-'} {fmt(Math.abs(best.n))}</div>}
          {worst && <div className="cf-hl worst"><b>⚠️ Peor {periodWord}</b>{worst.longLabel} · {worst.n >= 0 ? '+' : '-'} {fmt(Math.abs(worst.n))}</div>}
        </div>
      )}
      <div className="cf-avg">
        <span>Gasto promedio por {periodWord}</span>
        <b>{fmt(avgGastos)}</b>
      </div>
    </>
  );
}

export function FutureView({ forecast, onSel }: { forecast: Forecast; onSel: (id: string | number) => void }) {
  const cls = forecast.eomBalance < 0 ? 'bad' : forecast.eomBalance < forecast.balanceNow * 0.2 ? 'warn' : '';
  const phantoms = forecast.phantoms;
  return (
    <>
      <div className="vscope"><span className="dot" />Próximo mes · estimación inteligente</div>
      <div className={'fc-hero ' + cls}>
        <div className="lbl">Saldo proyectado fin de mes</div>
        <div className="big">{forecast.eomBalance < 0 ? '- ' : ''}{fmt(forecast.eomBalance)}</div>
        <div className="sub">Hoy: {fmt(forecast.balanceNow)} · Considera {phantoms.length} movimientos esperados</div>
      </div>
      {phantoms.length === 0 ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 30 }}>Sin gastos recurrentes detectados</p>
      ) : (
        phantoms.map((m) => {
          const c = catStyle(m.cat);
          return (
            <div className="mov phantom" key={m.id} onClick={() => onSel(m.id)}>
              <MovIcon type={m.ic} />
              <div className="mid">
                <b>{m.t} <span className="ghost-tag">👻</span></b>
                <div className="meta">
                  <small>{dayLabel(m.date)}</small>
                  <span className={'cat ' + c.cls}>{c.label}</span>
                  <span className="conf-pill">Conf. {m.confidence}</span>
                </div>
              </div>
              <div className={'amt ' + (m.amt < 0 ? 'neg' : 'pos')}>{m.amt < 0 ? '- ' : '+ '}{fmt(m.amt)}</div>
            </div>
          );
        })
      )}
    </>
  );
}

export function InsightCard({
  items,
  feedback,
  onFeedback,
}: {
  items: InsightItem[];
  feedback: Record<string, string>;
  onFeedback: (id: string, v: 'up' | 'down') => void;
}) {
  const [i, setI] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || items.length === 0) return null;
  const it = items[i % items.length];
  const fb = feedback[it.id];
  return (
    <div className="insight">
      <div className="icwrap">{it.icon}</div>
      <div className="body">
        <div className="tag">{it.tag}</div>
        <h4>{it.title}</h4>
        <p>{it.body}</p>
        <div className="actions-row">
          <button className="primary">{it.cta}</button>
          <button className={'ghost' + (fb === 'up' ? ' sel' : '')} onClick={() => onFeedback(it.id, 'up')}>👍</button>
          <button className={'ghost' + (fb === 'down' ? ' sel' : '')} onClick={() => onFeedback(it.id, 'down')}>👎</button>
          {items.length > 1 && <button className="ghost" onClick={() => setI(i + 1)}>Siguiente</button>}
        </div>
        {fb && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Gracias por tu feedback.</div>}
      </div>
      <button className="close" onClick={() => setDismissed(true)}>×</button>
    </div>
  );
}
