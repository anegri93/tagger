import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Categoria, ChatMessage, TaggerClient, Movimiento } from '@mango/tagger-sdk';
import type { UiMov } from './api';
import { catStyle } from './cat-style';
import { friendlyRule } from './rule-friendly';
import { CUR_M, PREV_M, dayLabel, fmt, monthOf, type Forecast, type Profile } from './utils';

export function WelcomeSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="wel-hero">
          <span className="badge2">✨ Nuevo</span>
          <h2>Tus movimientos, ahora con IA</h2>
          <p>Rediseñamos esta sección para que entiendas tu plata más rápido y sin esfuerzo.</p>
        </div>
        <div className="wel-feats">
          <div className="wel-feat"><div className="em">🍩</div><div className="body"><b>Categorías visuales</b><small>Donut + ranking de gastos por tipo</small></div></div>
          <div className="wel-feat"><div className="em">📊</div><div className="body"><b>Cash flow semanal</b><small>Ingresos vs gastos en un vistazo</small></div></div>
          <div className="wel-feat"><div className="em">🔮</div><div className="body"><b>Saldo proyectado</b><small>Predecimos cuánto te queda al fin de mes</small></div></div>
          <div className="wel-feat"><div className="em">✨</div><div className="body"><b>Mango IA</b><small>Pregúntale a tu plata cualquier cosa</small></div></div>
        </div>
        <button className="wel-cta" onClick={onClose}>Explorar</button>
      </div>
    </div>
  );
}

export function PersonalitySheet({
  profile, onClose, onAskChat,
}: {
  profile: Profile;
  onClose: () => void;
  onAskChat: (q: string) => void;
}) {
  const max = Math.max(...profile.sparkline, 1);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Tu personalidad financiera</h3>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Calculado sobre tus últimos 60 días</div>
        {profile.traits.slice(0, 3).map((t) => (
          <div className="psh-trait" key={t.id}>
            <div className="lbl"><span>{t.emoji} {t.label}</span><span>{t.score}</span></div>
            <div className="psh-bar"><i style={{ width: t.score + '%' }} /></div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Evolución 7 semanas</div>
        <div className="psh-spark">
          {profile.sparkline.map((v, i) => (<i key={i} style={{ height: (v / max) * 100 + '%' }} />))}
        </div>
        <div className="psh-cohort">
          Gastás <b>{profile.cohortDelta}% más</b> en delivery que usuarios similares a vos.
        </div>
        <button className="psh-share" onClick={() => onAskChat('¿Por qué soy modo ' + profile.dominant.label.toLowerCase() + '?')}>Preguntar a Mango IA</button>
      </div>
    </div>
  );
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'ai';
  text: string;
  evidence?: Array<string | number>;
  suggestions?: string[];
}

function ChatBubbleAi({
  turn, movs, onOpenMov, feedback, onFeedback,
}: {
  turn: ChatTurn;
  movs: UiMov[];
  onOpenMov: (id: string | number) => void;
  feedback: Record<string, string>;
  onFeedback: (id: string, v: 'up' | 'down') => void;
}) {
  const [showEv, setShowEv] = useState(false);
  const fb = feedback[turn.id];
  const evMovs = (turn.evidence || []).map((id) => movs.find((m) => m.id === id)).filter(Boolean) as UiMov[];
  return (
    <div className="bub ai">
      {turn.text}
      {evMovs.length > 0 && (
        <>
          <button className="ev-toggle" onClick={() => setShowEv(!showEv)}>
            {showEv ? 'Ocultar' : 'Ver'} {evMovs.length} movimiento{evMovs.length > 1 ? 's' : ''} {showEv ? '▴' : '▾'}
          </button>
          {showEv && (
            <div className="ev-list">
              {evMovs.map((m) => (
                <div className="ev-item" key={m.id} onClick={() => onOpenMov(m.id)}>
                  <span>{m.t}</span>
                  <span style={{ color: m.amt < 0 ? 'var(--pink)' : 'var(--teal)', fontWeight: 700 }}>
                    {m.amt < 0 ? '- ' : '+ '}{fmt(m.amt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="fb-row">
        <button className={fb === 'up' ? 'sel' : ''} onClick={() => onFeedback(turn.id, 'up')}>👍</button>
        <button className={fb === 'down' ? 'sel' : ''} onClick={() => onFeedback(turn.id, 'down')}>👎</button>
      </div>
    </div>
  );
}

const SUGERENCIAS_DEFAULT = [
  '¿En qué gasté el finde?',
  '¿Cuánto en supermercado este mes?',
  '¿Cuánto en delivery?',
  '¿Qué movimiento más caro tuve?',
];

export function ChatDrawer({
  open, onClose, history, setHistory, movs, client, usuario, onOpenMov, feedback, onFeedback,
}: {
  open: boolean;
  onClose: () => void;
  history: ChatTurn[];
  setHistory: (h: ChatTurn[]) => void;
  movs: UiMov[];
  client: TaggerClient | null;
  usuario: string;
  onOpenMov: (id: string | number) => void;
  feedback: Record<string, string>;
  onFeedback: (id: string, v: 'up' | 'down') => void;
}) {
  const [q, setQ] = useState('');
  const [pending, setPending] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // Scroll al final al abrir y cuando llega un nuevo mensaje.
    const el = bodyRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [open, history.length, pending]);
  if (!open) return null;

  const send = async (text: string) => {
    if (pending) return;
    const userTurn: ChatTurn = { role: 'user', text, id: 'u-' + Date.now() };
    const next = [...history, userTurn].slice(-40);
    setHistory(next);
    setQ('');
    if (!client) {
      setHistory([...next, { role: 'ai', id: 'a-' + Date.now(), text: 'Servicio no disponible (sin cliente).' }]);
      return;
    }
    setPending(true);
    try {
      const messages: ChatMessage[] = next
        .slice(-10)
        .map((t) => ({ role: t.role === 'ai' ? ('assistant' as const) : ('user' as const), content: t.text }));
      const movContext = movs
        .filter((m) => !m.forecast)
        .slice(0, 60)
        .map((m) => ({
          id: String(m.id),
          nombre: m.t,
          monto: m.amt,
          fecha: m.date,
          categoria: m.cat ?? null,
        }));
      const r = await client.chat.preguntar({ messages, movs: movContext, usuario });
      setHistory([...next, { role: 'ai', id: 'a-' + Date.now(), text: r.text }]);
    } catch (e) {
      setHistory([...next, { role: 'ai', id: 'a-' + Date.now(), text: `⚠️ Error: ${(e as Error).message}` }]);
    } finally {
      setPending(false);
    }
  };
  const lastSuggestions = SUGERENCIAS_DEFAULT;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="chat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="chat-hdr">
          <span className="spark">✨</span>
          <h3>Mango IA<small>Preguntale a tu plata</small></h3>
          <button className="clear" onClick={() => setHistory([])}>Limpiar</button>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="chat-body" ref={bodyRef}>
          {history.length === 0 && (
            <div className="bub ai">
              Hola. Puedo ayudarte a entender tus gastos, predecir tu saldo y resumir tu mes. Probá una pregunta abajo 👇
            </div>
          )}
          {history.map((t) =>
            t.role === 'user'
              ? <div className="bub user" key={t.id}>{t.text}</div>
              : <ChatBubbleAi key={t.id} turn={t} movs={movs} onOpenMov={onOpenMov} feedback={feedback} onFeedback={onFeedback} />,
          )}
          {pending && <div className="bub ai" style={{ fontStyle: 'italic', opacity: 0.7 }}>Pensando…</div>}
        </div>
        <div className="chat-chips">
          {lastSuggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
        </div>
        <div className="chat-input">
          <input
            placeholder="Escribí tu pregunta..."
            value={q}
            disabled={pending}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && q.trim() && !pending) void send(q.trim()); }}
          />
          <button disabled={pending} onClick={() => q.trim() && !pending && void send(q.trim())}>
            {pending ? '…' : '►'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeOption({ active, emoji, title, desc, onClick }: {
  active: boolean; emoji: string; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={'scope-opt' + (active ? ' on' : '')}
      type="button"
    >
      <span className="scope-opt-emoji">{emoji}</span>
      <div className="scope-opt-text">
        <div className="scope-opt-title">{title}</div>
        <div className="scope-opt-desc">{desc}</div>
      </div>
      <span className={'scope-opt-radio' + (active ? ' on' : '')}>{active ? '●' : ''}</span>
    </button>
  );
}

export function CategoryEditSheet({
  current, categorias, nombreComercio, onClose, onSave,
}: {
  current: string | null;
  categorias: Categoria[];
  nombreComercio: string;
  onClose: () => void;
  onSave: (newCategoriaId: string, scope: 'solo' | 'exacto' | 'prefijo') => Promise<void>;
}) {
  const [pickedId, setPickedId] = useState<string | null>(current);
  const [scope, setScope] = useState<'solo' | 'exacto' | 'prefijo'>('exacto');
  const [step, setStep] = useState<'cat' | 'scope'>('cat');
  const firstWord = useMemo(() => {
    const w = nombreComercio.trim().split(/\s+/)[0] ?? '';
    return w.toUpperCase();
  }, [nombreComercio]);
  const hasPrefijo = firstWord.length >= 3;
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return categorias;
    return categorias.filter((c) => c.nombre.toLowerCase().includes(t) || c.slug.includes(t));
  }, [categorias, q]);

  const submit = async () => {
    if (!pickedId || pickedId === current) { onClose(); return; }
    setSaving(true);
    try {
      await onSave(pickedId, scope);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const pickedCat = pickedId ? categorias.find((c) => c.id === pickedId) : null;

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85%' }}>
        <div className="grab" />
        {step === 'cat' ? (
          <>
            <h3>Categorizar</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              <b style={{ color: 'var(--ink)' }}>{nombreComercio}</b>
            </div>
            <input
              placeholder="Buscar categoría..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 12, fontSize: 14, outline: 0, marginBottom: 12 }}
            />
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              {filtered.map((c) => {
                const st = catStyle(c.slug);
                return (
                  <button
                    key={c.id}
                    onClick={() => { setPickedId(c.id); setStep('scope'); }}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 12px', marginBottom: 6, borderRadius: 12,
                      background: '#fff',
                      border: '1px solid var(--line)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{st.emoji}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.nombre}</span>
                    <span style={{ color: '#cfd6e0', fontSize: 18 }}>›</span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 13, padding: 14 }}>Sin resultados</p>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep('cat')}
              style={{ background: 'none', border: 0, color: 'var(--blue3)', fontWeight: 700, fontSize: 14, padding: '4px 0', cursor: 'pointer', marginBottom: 4 }}
            >‹ Volver</button>
            <h3 style={{ marginBottom: 4 }}>¿Cómo aplico la regla?</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              <b style={{ color: 'var(--ink)' }}>{nombreComercio}</b> → {pickedCat ? <><span>{catStyle(pickedCat.slug).emoji}</span> <b style={{ color: 'var(--ink)' }}>{pickedCat.nombre}</b></> : '—'}
            </div>
            <div className="scope-picker">
              <ScopeOption
                active={scope === 'solo'}
                emoji="☝️"
                title="Solo este movimiento"
                desc="Excepción puntual. No afecta futuros."
                onClick={() => setScope('solo')}
              />
              <ScopeOption
                active={scope === 'exacto'}
                emoji="🧠"
                title={`Cualquier "${nombreComercio}"`}
                desc="Mismo nombre exacto en próximos movs."
                onClick={() => setScope('exacto')}
              />
              {hasPrefijo && (
                <ScopeOption
                  active={scope === 'prefijo'}
                  emoji="✨"
                  title={`Empieza por "${firstWord}"`}
                  desc="Atrapa todos los que empiezan así (existentes y futuros)."
                  onClick={() => setScope('prefijo')}
                />
              )}
            </div>
            <button
              disabled={saving || !pickedId}
              onClick={submit}
              style={{
                width: '100%', background: 'var(--blue3)', color: '#fff', border: 0,
                borderRadius: 22, padding: 13, fontWeight: 700, fontSize: 15, cursor: 'pointer',
                opacity: saving || !pickedId ? 0.5 : 1, marginTop: 12,
              }}
            >
              {saving ? 'Guardando…' : 'Confirmar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DetailSheet({
  m, movs, categorias, client, onChangeCat, onClose, onDismissPhantom, onAskChat, onAfterRuleMutate,
}: {
  m: UiMov;
  movs: UiMov[];
  categorias: Categoria[];
  client: TaggerClient | null;
  onChangeCat: (movId: string | number, newCategoriaId: string, scope: 'solo' | 'exacto' | 'prefijo') => Promise<void> | void;
  onClose: () => void;
  onDismissPhantom: (key: string) => void;
  onAskChat: (q: string) => void;
  onAfterRuleMutate?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<Movimiento | null>(null);
  const [reglaInfo, setReglaInfo] = useState<{ id: string; valor: string; tipo: 'literal' | 'contiene' | 'regex'; scope: string } | null>(null);
  const [deletingRegla, setDeletingRegla] = useState(false);

  useEffect(() => {
    if (!client || m.forecast) return;
    let cancel = false;
    (async () => {
      try {
        const d = await client.movimientos.obtener(String(m.id));
        if (cancel) return;
        setDetail(d);
        const reglaId = (d.evidencia as { regla_id?: string } | null)?.regla_id;
        if (reglaId) {
          // Buscar la regla en ambos scopes posibles.
          const all = await Promise.all([
            client.reglas.listar({ scope: 'global' }),
            client.reglas.listar({ scope: 'usuario:demo' }),
          ]);
          const found = all.flat().find((r) => r.id === reglaId);
          if (found && !cancel) {
            setReglaInfo({ id: found.id, valor: found.valor, tipo: found.tipo, scope: found.scope });
          }
        } else {
          setReglaInfo(null);
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancel = true; };
  }, [client, m.id, m.forecast]);

  const borrarReglaYReprocesar = async () => {
    if (!client || !reglaInfo) return;
    if (!window.confirm(`Borrar regla "${reglaInfo.valor}" y re-categorizar este movimiento?`)) return;
    setDeletingRegla(true);
    try {
      await client.reglas.eliminar(reglaInfo.id);
      await client.movimientos.reprocesar(String(m.id));
      onAfterRuleMutate?.();
      onClose();
    } finally {
      setDeletingRegla(false);
    }
  };
  const merchTotalCur = movs.filter((x) => x.t === m.t && monthOf(x.date) === CUR_M && x.amt < 0).reduce((s, x) => s - x.amt, 0);
  const merchTotalPrev = movs.filter((x) => x.t === m.t && monthOf(x.date) === PREV_M && x.amt < 0).reduce((s, x) => s - x.amt, 0);
  let ai: { t: string; d: string } | null = null;
  if (m.amt < 0) {
    if (merchTotalPrev > 0) {
      const pct = Math.round((merchTotalCur / merchTotalPrev - 1) * 100);
      ai = pct > 0
        ? { t: 'Gastás más aquí', d: `Este mes llevás ${fmt(merchTotalCur)} en ${m.t.split('-')[0].trim()}, ${pct}% más que el mes pasado (${fmt(merchTotalPrev)}).` }
        : { t: 'Vas mejor aquí', d: `Este mes llevás ${fmt(merchTotalCur)}, ${Math.abs(pct)}% menos que el mes pasado.` };
    } else if (m.recurring) {
      ai = { t: 'Gasto recurrente', d: `Detectamos que comprás frecuentemente en ${m.t.split('-')[0].trim()}.` };
    }
  }
  const curStyle = catStyle(m.cat);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>{m.t}</h3>
        <div className="amtbig" style={{ color: m.amt < 0 ? 'var(--pink)' : 'var(--teal)' }}>
          {m.amt < 0 ? '- ' : '+ '}{fmt(m.amt)}
        </div>
        <div className="row"><span>Fecha</span><span>{dayLabel(m.date)}</span></div>
        <div className="row" style={{ alignItems: 'center' }}>
          <span>Categoría</span>
          <span>
            <span className={'cat ' + curStyle.cls} style={{ marginRight: 8 }}>{curStyle.label}</span>
            {!m.forecast && (
              <button
                onClick={() => setEditOpen(true)}
                style={{ background: 'none', border: 0, color: 'var(--blue3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Editar
              </button>
            )}
          </span>
        </div>
        <div className="row"><span>Recurrente</span><span>{m.recurring ? 'Sí 🔁' : 'No'}</span></div>
        {m.forecast && (
          <div className="ai" style={{ flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <span className="spark">👻</span>
              <div>
                <b>Movimiento estimado</b>
                <span style={{ display: 'block', marginTop: 2, color: 'var(--muted)' }}>
                  Basado en patrón recurrente. Confianza: <b>{m.confidence}</b>.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => { onDismissPhantom('pname-' + m.t); onClose(); }}
                style={{ background: 'var(--pink)', color: '#fff', border: 0, padding: '7px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Cancelar débito
              </button>
              <button
                onClick={() => onAskChat('¿Por qué viene ' + m.t + '?')}
                style={{ background: 'var(--blue3)', color: '#fff', border: 0, padding: '7px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Preguntar a Mango IA
              </button>
            </div>
          </div>
        )}
        {ai && !m.forecast && (
          <div className="ai">
            <span className="spark">✨</span>
            <div><b>{ai.t}</b><span style={{ display: 'block', marginTop: 2, color: 'var(--muted)' }}>{ai.d}</span></div>
          </div>
        )}
        {!m.forecast && reglaInfo && (() => {
          const f = friendlyRule(reglaInfo);
          const esTuya = reglaInfo.scope.startsWith('usuario:');
          return (
            <div className="ai" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span className="spark">{esTuya ? '🧠' : '🌐'}</span>
                <div style={{ flex: 1 }}>
                  <b>{esTuya ? 'Tu memoria lo reconoció' : 'Patrón global'}</b>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word' }}>
                    {f.verbo.toLowerCase()} <b>{f.texto}</b>
                  </span>
                </div>
              </div>
              {esTuya && (
                <button
                  onClick={borrarReglaYReprocesar}
                  disabled={deletingRegla}
                  style={{
                    background: 'transparent', color: 'var(--pink)',
                    border: '1px solid var(--pink)', padding: '7px 14px',
                    borderRadius: 14, fontWeight: 700, fontSize: 12,
                    cursor: 'pointer', alignSelf: 'flex-start',
                  }}
                >
                  {deletingRegla ? 'Olvidando…' : 'Olvidar esta preferencia'}
                </button>
              )}
            </div>
          );
        })()}
        {!m.forecast && !reglaInfo && detail?.fuente_categoria === 'ia' && (
          <div className="ai">
            <span className="spark">✨</span>
            <div><b>Categorizado por IA</b><span style={{ display: 'block', marginTop: 2, color: 'var(--muted)' }}>Sin coincidencia con reglas existentes — la IA decidió la categoría.</span></div>
          </div>
        )}
      </div>
      {editOpen && (
        <CategoryEditSheet
          current={m.catId}
          categorias={categorias}
          nombreComercio={m.t}
          onClose={() => setEditOpen(false)}
          onSave={async (newId, scope) => {
            await onChangeCat(m.id, newId, scope);
          }}
        />
      )}
    </div>
  );
}

const SERVICIOS = ['ANDE', 'ESSAP', 'COPACO', 'Tigo', 'Personal', 'Claro'];

export function NewMovementSheet({
  onClose, onCreate, categorias,
}: {
  onClose: () => void;
  onCreate: (input: { nombreComercio: string; monto: number; descripcion: string; categoriaId?: string }) => Promise<{ categoria: string | null; fuente: string | null } | null>;
  categorias: Categoria[];
}) {
  const slugToId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categorias) m[c.slug] = c.id;
    return m;
  }, [categorias]);
  const [tab, setTab] = useState<'transferencia' | 'servicio'>('transferencia');
  const [beneficiario, setBeneficiario] = useState('');
  const [servicio, setServicio] = useState('ANDE');
  const [monto, setMonto] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ categoria: string | null; fuente: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const m = Number.parseInt(monto.replace(/\D/g, ''), 10);
    if (!Number.isFinite(m) || m <= 0) {
      setError('Ingresá un monto válido');
      return;
    }
    let nombreComercio: string;
    let descripcion: string;
    let categoriaId: string | undefined;
    if (tab === 'transferencia') {
      const ben = beneficiario.trim();
      if (!ben) { setError('Ingresá un beneficiario'); return; }
      nombreComercio = ben.toUpperCase();
      descripcion = `Transferencia a ${ben}`;
    } else {
      nombreComercio = servicio.toUpperCase();
      descripcion = `Pago de servicio ${servicio}`;
    }
    setSubmitting(true);
    try {
      const r = await onCreate({ nombreComercio, monto: -m, descripcion, categoriaId });
      setResult(r);
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Error al crear movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Nuevo movimiento</h3>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Categorizado automáticamente por el pipeline.</div>
        <div className="nm-tabs">
          <button className={tab === 'transferencia' ? 'on' : ''} onClick={() => setTab('transferencia')}>💸 Transferencia</button>
          <button className={tab === 'servicio' ? 'on' : ''} onClick={() => setTab('servicio')}>🧾 Pago de servicio</button>
        </div>
        {tab === 'transferencia' ? (
          <div className="nm-field">
            <label>Beneficiario</label>
            <input
              placeholder="Ej: Juan Pérez"
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
            />
          </div>
        ) : (
          <div className="nm-field">
            <label>Servicio</label>
            <div className="nm-services">
              {SERVICIOS.map((s) => (
                <button key={s} className={servicio === s ? 'on' : ''} onClick={() => setServicio(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        <div className="nm-field">
          <label>Monto (Gs)</label>
          <input
            inputMode="numeric"
            placeholder="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </div>
        {error && <div style={{ color: 'var(--pink)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        {result && (
          <div className="nm-result">
            <b>✓ Movimiento creado</b>
            Categoría: {result.categoria ?? 'sin categoría'} · Fuente: {result.fuente ?? 'n/a'}
          </div>
        )}
        <button className="nm-submit" disabled={submitting} onClick={submit}>
          {submitting ? 'Procesando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}
