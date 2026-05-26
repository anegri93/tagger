import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaggerClient, type Categoria } from '@mango/tagger-sdk';
import { DEMO_ORIGEN, DEMO_USER, fetchAll, fetchDemoConfig, makeClient, type UiMov } from './api';
import { catStyle } from './cat-style';
import type { ChatMessage } from '@mango/tagger-sdk';
import {
  computeSummary, fmt, forecastEngine, dayLabel, loadLS,
  personalityEngine, saveLS, type Forecast, type Profile,
} from './utils';
import { Alias, Bank, Efectiviza, Envia, Headset, MiCred, MovIcon, QR, Recarga, StatusBar } from './icons';
import { CashflowView, CategoriesView, FutureView, TopView } from './views';
import { RulesView } from './rules-view';
import { BudgetView } from './budget-view';
import { ChatDrawer, DetailSheet, NewMovementSheet, PersonalitySheet, WelcomeSheet, type ChatTurn } from './sheets';
import { Manguito, type ManguitoPosition } from './manguito';
import { pickNudge, type Nudge } from './nudge-engine';
import type { Regla } from '@mango/tagger-sdk';

const LS_FB = 'mango.demo.insightFb';
const LS_DISMISS = 'mango.demo.phantomDismiss';
const LS_CHAT = 'mango.demo.chatHistory';
const LS_WELCOME = 'mango.demo.welcomeMov.v1';
const LS_MANGUITO_DISMISS = 'mango.demo.manguitoDismiss';
const LS_MANGUITO_INSIGHTS_SEEN = 'mango.demo.manguitoInsightsSeen';
const LS_MANGUITO_SILENCE = 'mango.demo.manguitoSilencedUntil';
const LS_MANGUITO_POS = 'mango.demo.manguitoPos';

const VIEWS = [
  { id: 'list', em: '📋', label: 'Movimientos' },
  { id: 'cats', em: '🍩', label: 'Categorías' },
  { id: 'budget', em: '🎯', label: 'Presupuestos' },
  { id: 'reglas', em: '⚙️', label: 'Reglas' },
  { id: 'top', em: '🏆', label: 'Top' },
  { id: 'cf', em: '📊', label: 'Cash flow' },
  { id: 'fut', em: '🔮', label: 'Futuro' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

// Hook: convierte scroll vertical en horizontal sobre un contenedor (para barras de chips).
function useHorizontalWheel<T extends HTMLElement = HTMLDivElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return ref;
}

const CAT_FILTERS = [
  { id: 'sin-categoria', label: 'Sin categoría' },
  { id: 'out', label: 'Gastos' },
  { id: 'in', label: 'Ingresos' },
  { id: 'supermercado', label: 'Supermercado' },
  { id: 'combustible', label: 'Combustible' },
  { id: 'restaurante', label: 'Restaurante' },
  { id: 'transferencia', label: 'Transferencias' },
];

function Summary({ summary, balanceNow }: { summary: ReturnType<typeof computeSummary>; balanceNow: number }) {
  const { gastosCur: gCur, gastosPrev: gPrev, ingresosCur: iCur } = summary;
  const delta = gPrev > 0 ? Math.round((gCur / gPrev - 1) * 100) : 0;
  const balMes = iCur - gCur;
  const now = new Date();
  const monthLabel = now.toLocaleString('es-PY', { month: 'long', year: 'numeric' });
  return (
    <div className="summary">
      <div className="row">
        <span className="lbl">Saldo actual</span>
        <span className="month">{monthLabel}</span>
      </div>
      <div className="big">{fmt(balanceNow)}</div>
      <div className="delta">Balance del mes: {balMes >= 0 ? '+ ' : '- '}{fmt(balMes)}</div>
      <div className="sub">
        <div>
          <small>Gastos mes</small><b>- {fmt(gCur)}</b>
          <span style={{ display: 'block', fontSize: 10, opacity: 0.8, marginTop: 2 }}>
            {delta > 0 ? `▲ ${delta}% vs mes anterior` : delta < 0 ? `▼ ${Math.abs(delta)}% vs mes anterior` : '≈ mes anterior'}
          </span>
        </div>
        <div><small>Ingresos mes</small><b>+ {fmt(iCur)}</b></div>
      </div>
    </div>
  );
}

function AvatarPulse({ profile, onOpen, negativeForecast }: { profile: Profile; onOpen: () => void; negativeForecast: boolean }) {
  const emoji = negativeForecast ? '😰' : profile.dominant.emoji;
  return (
    <div className="avpulse" onClick={onOpen}>
      <div className="face">{emoji}</div>
      <div className="body">
        <div className="trait">Modo {profile.dominant.label}</div>
        <div className="phrase">{negativeForecast ? 'Cuidado, semana ajustada viene' : profile.phrase}</div>
      </div>
      <div className="chev">›</div>
    </div>
  );
}

function ChatFab({ onOpen }: { onOpen: () => void }) {
  return <button className="chatfab" onClick={onOpen} title="Mango IA">✨</button>;
}

function IAChatBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      data-demo-pulse="chat"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        boxShadow: '0 -6px 20px rgba(10,40,90,.08)', padding: '14px 16px 20px',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 20,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          flex: 1, background: '#f1f4f9', border: 0, borderRadius: 22,
          padding: '12px 16px', fontSize: 14, color: '#9aa6b7', userSelect: 'none',
        }}
      >
        Preguntale a tus movimientos...
      </div>
      <div
        style={{
          background: 'linear-gradient(135deg,#1877f2,#7c5cff)', color: '#fff',
          borderRadius: '50%', width: 44, height: 44,
          fontSize: 18, flex: '0 0 44px',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 8px 18px rgba(124,92,255,.35)',
        }}
      >
        ►
      </div>
    </div>
  );
}

function NewMovFab({ onOpen }: { onOpen: () => void }) {
  return <button className="new-mov-fab" onClick={onOpen} title="Nuevo movimiento">+</button>;
}

function TabBar({ active, onOpenMov }: { active: 'qr' | 'mov' | string; onOpenMov: () => void }) {
  const Item = ({ id, label, children, onClick }: { id: string; label: string; children: React.ReactNode; onClick?: () => void }) => (
    <button className={'tab ' + (active === id ? 'active' : '')} onClick={onClick}>
      {children}<span>{label}</span>
    </button>
  );
  return (
    <div className="tabbar">
      <Item id="env" label="Envíos">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 20c1.5-4 12.5-4 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17 4l2 2-2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Item>
      <Item id="chat" label="Chat">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16v10H8l-4 4V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </Item>
      <button className="tab center"><div className="bub"><QR size={28} /></div></button>
      <Item id="av" label="Avisos">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2zM10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Item>
      <Item id="mov" label="Movimientos" onClick={onOpenMov}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 10h8M8 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </Item>
    </div>
  );
}

function Home({ onOpenMov, onReset, onOpenNewMov }: { onOpenMov: () => void; onReset: () => void; onOpenNewMov: () => void }) {
  return (
    <div className="screen">
      <StatusBar />
      <div className="content" style={{ background: 'var(--bg)' }}>
        <div className="header">
          <div className="avatar">DM</div>
          <div className="hello"><h2>Hola, Demo</h2><a>Perfil</a></div>
          <button className="reset-btn" onClick={onReset} title="Reiniciar demo">↻</button>
          <button className="help"><span>Ayuda</span><Headset /></button>
        </div>
        <div className="saldo-card">
          <div className="lbl">SALDO</div>
          <div className="chev">⌄</div>
        </div>
        <div className="actions">
          <div className="action" onClick={onOpenNewMov} style={{ cursor: 'pointer' }}>
            <div className="ic blue"><Recarga /></div><span>Nuevo</span>
          </div>
          <div className="action" onClick={onOpenNewMov} style={{ cursor: 'pointer' }}>
            <div className="ic blue"><Envia /></div><span>Enviá</span>
          </div>
          <div className="action"><div className="ic blue"><Efectiviza /></div><span>Efectivizá</span></div>
          <div className="action"><div className="ic teal"><MiCred /></div><span>Mi crédito</span></div>
        </div>
        <div className="banner">
          <div>
            <h3>Cobrá con<br />QR gratis</h3>
            <span className="vermas">ver más</span>
          </div>
          <div className="qr-card">
            <span className="badge">Nuevo</span>
            <QR size={40} color="#0f56c9" />
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700 }}>QR<br />Bancard</div>
          </div>
        </div>
        <div className="dots"><i /><i className="on" /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="section-title">Cobrá dinero con</div>
        <div className="cards-row">
          <div className="flat-card"><span className="badge">Nuevo</span><QR size={36} color="#0f56c9" /><span>QR<br />Bancard</span></div>
          <div className="flat-card"><Bank /><span>Cuenta<br />bancaria</span></div>
          <div className="flat-card"><Alias /><span>Alias</span></div>
          <div className="flat-card"><QR size={36} color="#0f56c9" /><span>Más</span></div>
        </div>
        <div className="section-title">Pagá tus servicios</div>
        <div className="services">
          <div className="srv" style={{ background: '#1877f2', color: '#fff' }}>📄</div>
          <div className="srv" style={{ color: '#b71c1c' }}>UPAR</div>
          <div className="srv">🥤</div>
          <div className="srv" style={{ color: '#0066cc' }}>tigo</div>
          <div className="srv" style={{ color: '#1877f2' }}>perso</div>
        </div>
      </div>
      <TabBar active="qr" onOpenMov={onOpenMov} />
    </div>
  );
}

function Movimientos({
  allMovs, forecast, profile, categorias, client, onChangeCat,
  feedback, onFeedback, onDismissPhantom, chatHistory, setChatHistory,
  chatOpen, setChatOpen, seedChat, onOpenNewMov, onBack, onRefresh,
  nudge, mood, onNudgeCTA, onNudgeDismiss, onSilence, onUnsilence, silencedUntil,
  position, onPositionChange, userRules, budgetEstado, insightsSeen, onMarkInsightsSeen,
}: {
  onBack: () => void;
  allMovs: UiMov[];
  forecast: Forecast;
  profile: Profile;
  categorias: Categoria[];
  client: TaggerClient | null;
  onRefresh: () => void;
  onChangeCat: (movId: string | number, newCategoriaId: string, scope: 'solo' | 'exacto' | 'prefijo') => Promise<void>;
  feedback: Record<string, string>;
  onFeedback: (id: string, v: 'up' | 'down') => void;
  onDismissPhantom: (key: string) => void;
  chatHistory: ChatTurn[];
  setChatHistory: (h: ChatTurn[]) => void;
  chatOpen: boolean;
  setChatOpen: (b: boolean) => void;
  seedChat: (q: string) => void;
  onOpenNewMov: () => void;
  nudge: Nudge | null;
  mood: import('./nudge-engine').MangoMood;
  onNudgeCTA: (n: Nudge) => void | Promise<void>;
  onNudgeDismiss: (n: Nudge) => void;
  onSilence: (hours: number) => void;
  onUnsilence: () => void;
  silencedUntil?: number;
  position: ManguitoPosition;
  onPositionChange: (p: ManguitoPosition) => void;
  userRules: Regla[];
  budgetEstado: import('@mango/tagger-sdk').PresupuestoEstado | null;
  insightsSeen: Record<string, number>;
  onMarkInsightsSeen: (ids: string[]) => void;
}) {
  const [view, setView] = useState<ViewId>('list');
  const [cat, setCat] = useState<string | null>(null);
  const [focusBudgetCat, setFocusBudgetCat] = useState<string | null>(null);
  const vchipsRef = useHorizontalWheel();
  const chipsRef = useHorizontalWheel();

  useEffect(() => {
    const VIEW_TARGETS: Record<string, ViewId> = {
      'view:list': 'list', 'view:cats': 'cats', 'view:budget': 'budget',
      'view:reglas': 'reglas', 'view:top': 'top', 'view:cf': 'cf', 'view:fut': 'fut',
    };
    const onFocus = (e: Event) => {
      const target = (e as CustomEvent<{ target?: string }>).detail?.target;
      if (!target) return;
      // "tabs" → vista por defecto (Movimientos) para que la barra sea visible
      const nextView = VIEW_TARGETS[target] ?? (target === 'tabs' ? 'list' : null);
      if (nextView) setView(nextView);
      window.setTimeout(() => {
        // Centrar tab activo en la barra horizontal
        if (nextView) {
          const tabBtn = vchipsRef.current?.querySelector<HTMLElement>('.vchip.on');
          tabBtn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        const el = document.querySelector<HTMLElement>(`[data-demo-pulse="${target}"]`);
        if (!el) return;
        el.classList.remove('demo-pulse-on');
        void el.offsetWidth;
        el.classList.add('demo-pulse-on');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => el.classList.remove('demo-pulse-on'), 3200);
      }, 90);
    };
    window.addEventListener('demo-focus', onFocus);
    return () => window.removeEventListener('demo-focus', onFocus);
  }, []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | number | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const realMovs = useMemo(() => allMovs.filter((m) => !m.forecast), [allMovs]);
  const summary = useMemo(() => computeSummary(realMovs), [realMovs]);

  const listFiltered = useMemo(() => {
    return realMovs
      .filter((m) => {
        if (q && !m.t.toLowerCase().includes(q.toLowerCase())) return false;
        if (!cat) return true;
        if (cat === 'out') return m.amt < 0;
        if (cat === 'in') return m.amt > 0;
        if (cat === 'sin-categoria') return m.catId == null;
        return m.cat === cat;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [realMovs, q, cat]);

  const groupedList = useMemo(() => {
    const g: Record<string, UiMov[]> = {};
    listFiltered.forEach((m) => { (g[m.date] = g[m.date] || []).push(m); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [listFiltered]);

  const selected = sel ? allMovs.find((m) => m.id === sel) ?? null : null;
  const negativeFc = forecast.eomBalance < 0;

  const renderMov = (m: UiMov) => {
    const c = catStyle(m.cat);
    return (
      <div className="mov" key={m.id} onClick={() => setSel(m.id)}>
        <MovIcon type={m.ic} />
        <div className="mid">
          <b>{m.t}</b>
          <div className="meta">
            <span className={'cat ' + c.cls}>{c.label}</span>
            {m.recurring && <span className="rec">🔁 Recurrente</span>}
          </div>
        </div>
        <div className={'amt ' + (m.amt < 0 ? 'neg' : 'pos')}>
          {m.amt < 0 ? '- ' : '+ '}{fmt(m.amt)}
        </div>
        <div className="kebab">⋮</div>
      </div>
    );
  };

  return (
    <div className="screen">
      <StatusBar />
      <div className="content">
        <button className="back" onClick={onBack}>‹</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="title" style={{ margin: '4px 0 14px', flex: 1 }}>Movimientos</h1>
          <button
            onClick={onOpenNewMov}
            title="Nuevo movimiento"
            data-demo-pulse="newmov"
            style={{
              background: 'linear-gradient(135deg,#16c6a4,#0fa987)',
              color: '#fff', border: 0, borderRadius: '50%',
              width: 40, height: 40, fontSize: 24, lineHeight: 1,
              cursor: 'pointer', display: 'grid', placeItems: 'center',
              boxShadow: '0 6px 14px rgba(22,198,164,.35)', fontWeight: 700,
              marginBottom: 10, flex: '0 0 40px',
            }}
          >+</button>
        </div>
        {/* Summary + AvatarPulse ocultos por ahora */}
        <div className="vchips" ref={vchipsRef} data-demo-pulse="tabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={'vchip ' + (view === v.id ? 'on' : '')} onClick={() => setView(v.id)}>
              <span className="em">{v.em}</span>{v.label}
            </button>
          ))}
        </div>
        {view === 'list' && (
          <>
            <div className="vscope"><span className="dot" />Historial · {listFiltered.length} movimientos</div>
            <div className="search" data-demo-pulse="search">
              <span style={{ color: '#9aa6b7' }}>🔍</span>
              <input placeholder="Buscar comercio, categoría..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="chips" ref={chipsRef} data-demo-pulse="filters">
              <button className={'chip ' + (cat === null ? 'on' : '')} onClick={() => setCat(null)}>Todas</button>
              {CAT_FILTERS.map((ch) => (
                <button key={ch.id} className={'chip ' + (cat === ch.id ? 'on' : '')} onClick={() => setCat(ch.id)}>{ch.label}</button>
              ))}
            </div>
            <div data-demo-pulse="mov-detail">
              {groupedList.length === 0 ? (
                <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 30 }}>Sin resultados</p>
              ) : (
                groupedList.map(([day, items]) => (
                  <div className="daygroup" key={day}>
                    <div className="dayhdr">{dayLabel(day)}</div>
                    {items.map(renderMov)}
                  </div>
                ))
              )}
            </div>
          </>
        )}
        {view === 'reglas' && (
          <div data-demo-pulse="view:reglas">
            <RulesView client={client} usuario={DEMO_USER} onAfterMutate={onRefresh} />
          </div>
        )}
        {view === 'budget' && (
          <div data-demo-pulse="view:budget">
            <BudgetView
              client={client}
              usuario={DEMO_USER}
              categorias={categorias}
              focusCategoriaId={focusBudgetCat}
              onClearFocus={() => setFocusBudgetCat(null)}
              onSinAsignar={() => { setView('list'); setCat('sin-categoria'); }}
              onViewMovs={(slug) => { setView('list'); setCat(slug); }}
            />
          </div>
        )}
        {view === 'cats' && (
          <div data-demo-pulse="view:cats">
            <CategoriesView movs={realMovs} onPickCat={(c) => { setCat(c); setView('list'); }} />
          </div>
        )}
        {view === 'top' && (
          <div data-demo-pulse="view:top">
            <TopView movs={realMovs} onSel={setSel} />
          </div>
        )}
        {view === 'cf' && (
          <div data-demo-pulse="view:cf">
            <CashflowView movs={realMovs} />
          </div>
        )}
        {view === 'fut' && (
          <div data-demo-pulse="view:fut">
            <FutureView forecast={forecast} onSel={setSel} />
          </div>
        )}
      </div>
      <IAChatBar onOpen={() => setChatOpen(true)} />
      <Manguito
        mood={mood}
        nudge={nudge}
        onCTA={(n) => {
          if (n.kind === 'sin-categoria') {
            setView('list');
            setCat('sin-categoria');
            setQ('');
          }
          if (n.kind === 'spike-categoria' && n.payload?.categoriaSlug) {
            setView('list');
            setCat(n.payload.categoriaSlug);
          }
          void onNudgeCTA(n);
        }}
        onDismiss={onNudgeDismiss}
        onSilence={(hours) => onSilence(hours)}
        onUnsilence={onUnsilence}
        silencedUntil={silencedUntil}
        onOpenChat={() => setChatOpen(true)}
        onAskChat={(q) => { setChatOpen(true); void seedChat(q); }}
        onFilterPending={() => { setView('list'); setCat('sin-categoria'); }}
        onOpenRules={() => { setView('reglas'); setCat(null); }}
        onOpenBudget={(catId) => { setView('budget'); setCat(null); setFocusBudgetCat(catId ?? null); }}
        userRules={userRules}
        budgetEstado={budgetEstado}
        seenInsights={insightsSeen}
        onMarkSeen={onMarkInsightsSeen}
        position={position}
        onPositionChange={onPositionChange}
        movs={allMovs}
        forecast={forecast}
      />
      {selected && (
        <DetailSheet
          m={selected}
          movs={allMovs}
          categorias={categorias}
          client={client}
          onChangeCat={onChangeCat}
          onAfterRuleMutate={onRefresh}
          onClose={() => setSel(null)}
          onDismissPhantom={onDismissPhantom}
          onAskChat={(qq) => { seedChat(qq); setSel(null); }}
        />
      )}
      {showProfile && (
        <PersonalitySheet
          profile={profile}
          onClose={() => setShowProfile(false)}
          onAskChat={(qq) => { seedChat(qq); setShowProfile(false); }}
        />
      )}
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        history={chatHistory}
        setHistory={setChatHistory}
        movs={allMovs}
        client={client}
        usuario={DEMO_USER}
        onOpenMov={(id) => { setSel(id); setChatOpen(false); }}
        feedback={feedback}
        onFeedback={onFeedback}
      />
    </div>
  );
}

function ApiKeyPrompt({ onSave }: { onSave: (k: string) => void }) {
  const [k, setK] = useState(window.tagger?.apiKey ?? '');
  return (
    <div className="stage">
      <div className="phone">
        <div className="notch" />
        <div className="screen">
          <StatusBar />
          <div className="content" style={{ padding: 24, paddingTop: 60 }}>
            <h2 style={{ margin: 0 }}>Configurar demo</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Ingresá la API key del backend tagger. Se guarda en localStorage compartido con las demás UIs.
            </p>
            <div className="nm-field">
              <label>API Key</label>
              <input value={k} onChange={(e) => setK(e.target.value)} placeholder="x-api-key" />
            </div>
            <button className="nm-submit" disabled={!k.trim()} onClick={() => onSave(k.trim())}>Guardar</button>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
              Tip: la API key vive en la variable de entorno <code>API_KEY</code> del server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const cfg = await fetchDemoConfig();
      let k = cfg.apiKey;
      if (!k) {
        try {
          const stored = JSON.parse(localStorage.getItem('tagger:config:v1') ?? '{}');
          k = stored.apiKey ?? '';
        } catch { /* ignore */ }
      }
      if (k) {
        try {
          const stored = JSON.parse(localStorage.getItem('tagger:config:v1') ?? '{}');
          localStorage.setItem('tagger:config:v1', JSON.stringify({ ...stored, apiKey: k }));
        } catch { /* ignore */ }
      }
      setApiKey(k);
      setConfigLoading(false);
    })();
  }, []);
  const [client, setClient] = useState<TaggerClient | null>(null);
  const [screen, setScreen] = useState<'home' | 'mov'>('home');
  const [movs, setMovs] = useState<UiMov[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasBooted, setHasBooted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>(() => loadLS(LS_FB, {}));
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => loadLS(LS_DISMISS, {}));
  const [chatHistory, setChatHistoryState] = useState<ChatTurn[]>(() => loadLS(LS_CHAT, []));
  const [chatOpen, setChatOpen] = useState(false);
  const [welcomeSeen, setWelcomeSeen] = useState<boolean>(() => loadLS(LS_WELCOME, false));
  const [showWelcome, setShowWelcome] = useState(false);
  const [showNewMov, setShowNewMov] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    if (!window.tagger) {
      (window as unknown as { tagger: { apiKey: string; baseUrl: string } }).tagger = {
        apiKey,
        baseUrl: window.location.origin,
      };
    } else {
      window.tagger.apiKey = apiKey;
    }
    setClient(makeClient());
  }, [apiKey]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAll(client);
      setMovs(data.movs);
      setCategorias(data.categorias);
      // Budget estado depende de movs — refrescar en paralelo (best-effort).
      try {
        const e = await client.presupuestos.estado({ usuario: DEMO_USER });
        setBudgetEstado(e);
      } catch { /* ignore */ }
    } catch (e) {
      setError((e as Error).message || 'Error al cargar datos');
    } finally {
      setLoading(false);
      setHasBooted(true);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (hasBooted) return;
    const t = setTimeout(() => {
      if (!hasBooted) {
        setError('Carga inicial tomó >5s. Revisá conexión al backend o API key.');
        setLoading(false);
        setHasBooted(true);
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [hasBooted]);

  const [userRules, setUserRules] = useState<Regla[]>([]);
  const [manguitoDismissed, setManguitoDismissed] = useState<Record<string, number>>(() => loadLS(LS_MANGUITO_DISMISS, {}));
  const [insightsSeen, setInsightsSeen] = useState<Record<string, number>>(() => loadLS(LS_MANGUITO_INSIGHTS_SEEN, {}));
  const markInsightsSeen = useCallback((ids: string[]) => {
    setInsightsSeen((prev) => {
      const ts = Date.now();
      const next = { ...prev };
      for (const id of ids) next[id] = ts;
      // GC: dropea entradas con >7d.
      const cutoff = ts - 7 * 86_400_000;
      for (const k of Object.keys(next)) {
        if ((next[k] ?? 0) < cutoff) delete next[k];
      }
      saveLS(LS_MANGUITO_INSIGHTS_SEEN, next);
      return next;
    });
  }, []);
  const [silencedUntil, setSilencedUntil] = useState<number | undefined>(() => {
    const raw = loadLS<number | null>(LS_MANGUITO_SILENCE, null);
    return raw && raw > Date.now() ? raw : undefined;
  });

  useEffect(() => {
    if (!client) return;
    let cancel = false;
    (async () => {
      try {
        const rs = await client.reglas.listar({ scope: `usuario:${DEMO_USER}` });
        if (!cancel) setUserRules(rs);
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [client, movs]);

  const [budgetEstado, setBudgetEstado] = useState<import('@mango/tagger-sdk').PresupuestoEstado | null>(null);
  useEffect(() => {
    if (!client) return;
    let cancel = false;
    (async () => {
      try {
        const e = await client.presupuestos.estado({ usuario: DEMO_USER });
        if (!cancel) setBudgetEstado(e);
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [client, movs]);

  const realMovs = movs;
  const forecast = useMemo(() => forecastEngine(realMovs, dismissed), [realMovs, dismissed]);
  const allMovs = useMemo(() => [...realMovs, ...forecast.phantoms], [realMovs, forecast]);
  const profile = useMemo(() => personalityEngine(realMovs), [realMovs]);

  const nudgeResult = useMemo(
    () => pickNudge({
      movs: allMovs,
      userRules,
      dismissedIds: manguitoDismissed,
      silencedUntil,
    }),
    [allMovs, userRules, manguitoDismissed, silencedUntil],
  );

  const dismissNudge = useCallback((n: Nudge) => {
    const next = { ...manguitoDismissed, [n.id]: Date.now() };
    setManguitoDismissed(next);
    saveLS(LS_MANGUITO_DISMISS, next);
  }, [manguitoDismissed]);

  const silenceManguito = useCallback((hours: number = 24) => {
    const until = Date.now() + hours * 3_600_000;
    setSilencedUntil(until);
    saveLS(LS_MANGUITO_SILENCE, until);
  }, []);

  const unsilenceManguito = useCallback(() => {
    setSilencedUntil(undefined);
    try { localStorage.removeItem(LS_MANGUITO_SILENCE); } catch { /* ignore */ }
  }, []);

  const [manguitoPos, setManguitoPos] = useState<ManguitoPosition>(() => loadLS(LS_MANGUITO_POS, { corner: 'bl' }));
  const updateManguitoPos = useCallback((p: ManguitoPosition) => {
    setManguitoPos(p);
    saveLS(LS_MANGUITO_POS, p);
  }, []);

  const onChangeCat = useCallback(async (movId: string | number, newCategoriaId: string, scope: 'solo' | 'exacto' | 'prefijo') => {
    if (!client) return;
    // 'solo': solo este. 'exacto': aprende literal. 'prefijo': crea regla regex + reprocesa sin-cat coincidentes.
    if (scope === 'prefijo') {
      // 1) Aplicar corrección al mov actual sin aprender (la regla la creamos a mano).
      await client.movimientos.corregir({
        movimientoId: String(movId),
        categoriaIdNueva: newCategoriaId,
        usuario: DEMO_USER,
        aprender: false,
      });
      // 2) Crear regla regex 'comienza con primera palabra'.
      const target = movs.find((m) => String(m.id) === String(movId));
      const firstWord = (target?.t ?? '').trim().split(/\s+/)[0]?.toUpperCase() ?? '';
      const cat = categorias.find((c) => c.id === newCategoriaId);
      if (firstWord && firstWord.length >= 3 && cat) {
        try {
          await client.reglas.crear({
            scope: `usuario:${DEMO_USER}`,
            tipo: 'regex',
            valor: `^${firstWord}\\b`,
            categoriaSlug: cat.slug,
            descripcion: `Auto: empieza por ${firstWord}`,
          });
        } catch (e) { console.warn('crear regla prefijo falló', e); }
        // 3) Aplicar corrección directa a movs sin-cat cuyo nombre empiece por la misma palabra.
        //    (Reprocesar no pasa `usuario` al pipeline, así que la regla user-scope no se aplicaría
        //     al re-categorizar — corregir directo es más rápido y confiable.)
        const coinciden = movs.filter((m) =>
          m.catId == null
          && !m.forecast
          && String(m.id) !== String(movId)
          && (m.t ?? '').toUpperCase().startsWith(firstWord),
        );
        await Promise.allSettled(coinciden.map((m) =>
          client.movimientos.corregir({
            movimientoId: String(m.id),
            categoriaIdNueva: newCategoriaId,
            usuario: DEMO_USER,
            aprender: false,
          }),
        ));
      }
    } else {
      await client.movimientos.corregir({
        movimientoId: String(movId),
        categoriaIdNueva: newCategoriaId,
        usuario: DEMO_USER,
        aprender: scope === 'exacto',
      });
    }
    await refresh();
  }, [client, refresh, movs, categorias]);

  const onCreate = useCallback(async (input: { nombreComercio: string; monto: number; descripcion: string; categoriaId?: string }) => {
    if (!client) return null;
    const r = await client.movimientos.categorizar({
      nombreComercio: input.nombreComercio,
      descripcion: input.descripcion,
      monto: input.monto,
      origen: DEMO_ORIGEN,
      ...(input.categoriaId ? { categoriaId: input.categoriaId, aprender: true } : {}),
    });
    await refresh();
    return {
      categoria: r.categoria?.nombre ?? null,
      fuente: r.fuente,
    };
  }, [client, refresh]);

  const onFeedback = (id: string, v: 'up' | 'down') => {
    const next = { ...feedback, [id]: v };
    setFeedback(next);
    saveLS(LS_FB, next);
  };
  const onDismissPhantom = (key: string) => {
    const next = { ...dismissed, [key]: true };
    setDismissed(next);
    saveLS(LS_DISMISS, next);
  };
  const persistChat = (h: ChatTurn[]) => {
    setChatHistoryState(h);
    saveLS(LS_CHAT, h);
  };
  const dismissWelcome = () => {
    setWelcomeSeen(true);
    saveLS(LS_WELCOME, true);
  };
  const resetWelcome = () => {
    try { localStorage.removeItem(LS_WELCOME); } catch { /* ignore */ }
    setWelcomeSeen(false);
  };
  const goToMov = () => {
    if (!welcomeSeen) setShowWelcome(true);
    else setScreen('mov');
  };
  const seedChat = async (q: string) => {
    setChatOpen(true);
    const userTurn: ChatTurn = { role: 'user', text: q, id: 'u-' + Date.now() };
    const baseNext = [...chatHistory, userTurn].slice(-40);
    persistChat(baseNext);
    if (!client) return;
    try {
      const messages: ChatMessage[] = baseNext
        .slice(-10)
        .map((t) => ({ role: t.role === 'ai' ? ('assistant' as const) : ('user' as const), content: t.text }));
      const movContext = allMovs
        .filter((m) => !m.forecast)
        .slice(0, 60)
        .map((m) => ({ id: String(m.id), nombre: m.t, monto: m.amt, fecha: m.date, categoria: m.cat ?? null }));
      const r = await client.chat.preguntar({ messages, movs: movContext, usuario: DEMO_USER });
      persistChat([...baseNext, { role: 'ai', id: 'a-' + Date.now(), text: r.text }]);
    } catch (e) {
      persistChat([...baseNext, { role: 'ai', id: 'a-' + Date.now(), text: `⚠️ ${(e as Error).message}` }]);
    }
  };

  if (configLoading) {
    return (
      <div className="stage">
        <div className="phone">
          <div className="notch" />
          <div className="screen">
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
              Cargando config…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <ApiKeyPrompt
        onSave={(k) => {
          try {
            const stored = JSON.parse(localStorage.getItem('tagger:config:v1') ?? '{}');
            localStorage.setItem('tagger:config:v1', JSON.stringify({ ...stored, apiKey: k }));
          } catch { /* ignore */ }
          setApiKey(k);
        }}
      />
    );
  }

  return (
    <div className="stage">
      <div className="phone">
        <div className="notch" />
        {error && (
          <div className="demo-banner" style={{ position: 'absolute', top: 50, left: 16, right: 16, zIndex: 60 }}>
            ⚠️ {error}
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button
                onClick={() => { setError(null); setHasBooted(false); void refresh(); }}
                style={{ background: 'var(--blue3)', color: '#fff', border: 0, padding: '5px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >Reintentar</button>
              <button
                onClick={() => {
                  try { localStorage.removeItem('tagger:config:v1'); } catch { /* ignore */ }
                  setApiKey('');
                  setError(null);
                  setHasBooted(false);
                }}
                style={{ background: 'transparent', color: 'var(--pink)', border: '1px solid var(--pink)', padding: '5px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >Cambiar API key</button>
            </div>
          </div>
        )}
        {!hasBooted && loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 50, background: '#fff' }}>
            <span style={{ color: 'var(--muted)' }}>Cargando…</span>
          </div>
        )}
        {hasBooted && loading && (
          <div style={{ position: 'absolute', top: 50, right: 16, zIndex: 60, background: '#eaf3ff', color: 'var(--blue3)', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
            Actualizando…
          </div>
        )}
        {screen === 'home' && (
          <Home
            onOpenMov={goToMov}
            onReset={resetWelcome}
            onOpenNewMov={() => setShowNewMov(true)}
          />
        )}
        {screen === 'mov' && (
          <Movimientos
            onBack={() => setScreen('home')}
            allMovs={allMovs}
            forecast={forecast}
            profile={profile}
            categorias={categorias}
            client={client}
            onRefresh={() => void refresh()}
            onChangeCat={onChangeCat}
            feedback={feedback}
            onFeedback={onFeedback}
            onDismissPhantom={onDismissPhantom}
            chatHistory={chatHistory}
            setChatHistory={persistChat}
            chatOpen={chatOpen}
            setChatOpen={setChatOpen}
            seedChat={seedChat}
            userRules={userRules}
            budgetEstado={budgetEstado}
            insightsSeen={insightsSeen}
            onMarkInsightsSeen={markInsightsSeen}
            onOpenNewMov={() => setShowNewMov(true)}
            nudge={nudgeResult.nudge}
            mood={nudgeResult.mood}
            onNudgeCTA={async (n) => {
              if (n.kind === 'sin-categoria') {
                // Filtra movs sin categoria — el componente Movimientos lo recibe via prop
                dismissNudge(n);
              } else if (n.kind === 'spike-categoria') {
                dismissNudge(n);
              } else if (n.kind === 'recurrencia' && client && n.payload?.nombreComercio) {
                const slug = n.payload.categoriaSlug && n.payload.categoriaSlug !== 'sin-categoria'
                  ? n.payload.categoriaSlug
                  : null;
                if (!slug) {
                  setError('No puedo aprender: ningún movimiento con este nombre tiene categoría asignada todavía. Categorizá uno primero.');
                  dismissNudge(n);
                  return;
                }
                try {
                  const r = await client.reglas.crear({
                    scope: `usuario:${DEMO_USER}`,
                    tipo: 'literal',
                    valor: n.payload.nombreComercio,
                    categoriaSlug: slug,
                    descripcion: 'Sugerencia Manguito',
                  });
                  console.log('regla creada', r);
                  void refresh();
                } catch (e) {
                  console.warn('crear regla falló', e);
                  setError('No pude crear la regla: ' + ((e as Error).message ?? 'error desconocido'));
                }
                dismissNudge(n);
              }
            }}
            onNudgeDismiss={dismissNudge}
            onSilence={silenceManguito}
            onUnsilence={unsilenceManguito}
            silencedUntil={silencedUntil}
            position={manguitoPos}
            onPositionChange={updateManguitoPos}
          />
        )}
        {showWelcome && (
          <WelcomeSheet
            onClose={() => { dismissWelcome(); setShowWelcome(false); setScreen('mov'); }}
          />
        )}
        {showNewMov && (
          <NewMovementSheet
            onClose={() => setShowNewMov(false)}
            onCreate={onCreate}
            categorias={categorias}
          />
        )}
      </div>
    </div>
  );
}
