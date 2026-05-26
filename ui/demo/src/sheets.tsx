import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Categoria, CategoriaUsuario, ChatMessage, TaggerClient, Movimiento } from '@mango/tagger-sdk';
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
  current, categorias, subcats, nombreComercio, client, usuario, onClose, onSave, onSubcatCreated,
}: {
  current: string | null;
  categorias: Categoria[];
  subcats: CategoriaUsuario[];
  nombreComercio: string;
  client: TaggerClient | null;
  usuario: string;
  onClose: () => void;
  onSave: (
    pick:
      | { kind: 'canon'; categoriaId: string }
      | { kind: 'subcat'; subcategoriaUsuarioId: string; categoriaId: string },
    scope: 'solo' | 'exacto' | 'prefijo',
  ) => Promise<void>;
  onSubcatCreated: (s: CategoriaUsuario) => void;
}) {
  type Pick =
    | { kind: 'canon'; categoriaId: string }
    | { kind: 'subcat'; subcategoriaUsuarioId: string; categoriaId: string };
  const [picked, setPicked] = useState<Pick | null>(current ? { kind: 'canon', categoriaId: current } : null);
  const [scope, setScope] = useState<'solo' | 'exacto' | 'prefijo'>('exacto');
  const [step, setStep] = useState<'cat' | 'scope'>('cat');
  const [createOpen, setCreateOpen] = useState(false);
  const firstWord = useMemo(() => {
    const w = nombreComercio.trim().split(/\s+/)[0] ?? '';
    return w.toUpperCase();
  }, [nombreComercio]);
  const hasPrefijo = firstWord.length >= 3;
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const filteredCanon = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return categorias;
    return categorias.filter((c) => c.nombre.toLowerCase().includes(t) || c.slug.includes(t));
  }, [categorias, q]);
  const filteredSubcats = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return subcats;
    return subcats.filter(
      (s) =>
        s.nombre.toLowerCase().includes(t) ||
        s.slug.includes(t) ||
        s.canonica_nombre.toLowerCase().includes(t),
    );
  }, [subcats, q]);

  const submit = async () => {
    if (!picked) { onClose(); return; }
    setSaving(true);
    try {
      await onSave(picked, scope);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Label de la pick para el step 2.
  const pickedLabel = (() => {
    if (!picked) return null;
    if (picked.kind === 'canon') {
      const c = categorias.find((x) => x.id === picked.categoriaId);
      return c ? { emoji: catStyle(c.slug).emoji, nombre: c.nombre, sub: null as string | null } : null;
    }
    const s = subcats.find((x) => x.id === picked.subcategoriaUsuarioId);
    if (!s) return null;
    return { emoji: s.emoji ?? '✨', nombre: s.nombre, sub: s.canonica_nombre };
  })();

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
              {filteredSubcats.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '4px 4px 6px' }}>
                    Tus categorías
                  </div>
                  {filteredSubcats.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setPicked({ kind: 'subcat', subcategoriaUsuarioId: s.id, categoriaId: s.canonica_id });
                        setStep('scope');
                      }}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 12px', marginBottom: 6, borderRadius: 12,
                        background: '#fff', border: '1px solid var(--line)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 22, width: 32, textAlign: 'center' }}>{s.emoji ?? '✨'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{s.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.canonica_nombre}</div>
                      </span>
                      <span style={{ color: '#cfd6e0', fontSize: 18 }}>›</span>
                    </button>
                  ))}
                </>
              )}
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', padding: filteredSubcats.length > 0 ? '10px 4px 6px' : '4px 4px 6px' }}>
                Globales
              </div>
              {filteredCanon.map((c) => {
                const st = catStyle(c.slug);
                return (
                  <button
                    key={c.id}
                    onClick={() => { setPicked({ kind: 'canon', categoriaId: c.id }); setStep('scope'); }}
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
              {filteredCanon.length === 0 && filteredSubcats.length === 0 && (
                <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 13, padding: 14 }}>Sin resultados</p>
              )}
              <button
                onClick={() => setCreateOpen(true)}
                style={{
                  width: '100%', marginTop: 10, padding: '12px 12px',
                  borderRadius: 12, background: '#f6f8fb',
                  border: '1px dashed var(--blue3)', color: 'var(--blue3)',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                + Crear categoría personal
              </button>
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
              <b style={{ color: 'var(--ink)' }}>{nombreComercio}</b> →{' '}
              {pickedLabel ? (
                <>
                  <span>{pickedLabel.emoji}</span>{' '}
                  <b style={{ color: 'var(--ink)' }}>{pickedLabel.nombre}</b>
                  {pickedLabel.sub && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}> · {pickedLabel.sub}</span>
                  )}
                </>
              ) : '—'}
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
              disabled={saving || !picked}
              onClick={submit}
              style={{
                width: '100%', background: 'var(--blue3)', color: '#fff', border: 0,
                borderRadius: 22, padding: 13, fontWeight: 700, fontSize: 15, cursor: 'pointer',
                opacity: saving || !picked ? 0.5 : 1, marginTop: 12,
              }}
            >
              {saving ? 'Guardando…' : 'Confirmar'}
            </button>
          </>
        )}
      </div>
      {createOpen && (
        <CreateSubcatSheet
          client={client}
          usuario={usuario}
          categorias={categorias}
          onClose={() => setCreateOpen(false)}
          onCreated={(s) => {
            onSubcatCreated(s);
            // Auto-pick subcat recién creada y avanzar al step scope.
            setPicked({ kind: 'subcat', subcategoriaUsuarioId: s.id, categoriaId: s.canonica_id });
            setStep('scope');
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function DetailSheet({
  m, movs, categorias, subcats, client, usuario, onChangeCat, onClose, onDismissPhantom, onAskChat, onAfterRuleMutate, onSubcatCreated,
}: {
  m: UiMov;
  movs: UiMov[];
  categorias: Categoria[];
  subcats: CategoriaUsuario[];
  client: TaggerClient | null;
  usuario: string;
  onChangeCat: (
    movId: string | number,
    pick:
      | { kind: 'canon'; categoriaId: string }
      | { kind: 'subcat'; subcategoriaUsuarioId: string; categoriaId: string },
    scope: 'solo' | 'exacto' | 'prefijo',
  ) => Promise<void> | void;
  onSubcatCreated: (s: CategoriaUsuario) => void;
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
            {m.subcat ? (
              <span
                className={'cat ' + curStyle.cls}
                style={{ marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title={'Rubro: ' + curStyle.label}
              >
                <span>{m.subcat.emoji ?? '✨'}</span>
                {m.subcat.nombre}
              </span>
            ) : (
              <span className={'cat ' + curStyle.cls} style={{ marginRight: 8 }}>
                {curStyle.label}
              </span>
            )}
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
        {m.subcat && (
          <div className="row">
            <span>Rubro</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{curStyle.label}</span>
          </div>
        )}
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
          subcats={subcats}
          nombreComercio={m.t}
          client={client}
          usuario={usuario}
          onClose={() => setEditOpen(false)}
          onSubcatCreated={onSubcatCreated}
          onSave={async (pick, scope) => {
            await onChangeCat(m.id, pick, scope);
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
  const [tab, setTab] = useState<'transferencia' | 'servicio' | 'ingreso'>('transferencia');
  const [beneficiario, setBeneficiario] = useState('');
  const [servicio, setServicio] = useState('ANDE');
  const [origenIngreso, setOrigenIngreso] = useState('');
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
    let signedMonto = -m;
    if (tab === 'transferencia') {
      const ben = beneficiario.trim();
      if (!ben) { setError('Ingresá un beneficiario'); return; }
      nombreComercio = ben.toUpperCase();
      descripcion = `Transferencia a ${ben}`;
    } else if (tab === 'servicio') {
      nombreComercio = servicio.toUpperCase();
      descripcion = `Pago de servicio ${servicio}`;
    } else {
      const orig = origenIngreso.trim();
      if (!orig) { setError('Indicá el origen del ingreso'); return; }
      nombreComercio = orig.toUpperCase();
      descripcion = `Ingreso: ${orig}`;
      categoriaId = slugToId['ingresos'];
      signedMonto = m; // positivo
    }
    setSubmitting(true);
    try {
      const r = await onCreate({ nombreComercio, monto: signedMonto, descripcion, categoriaId });
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
          <button className={tab === 'servicio' ? 'on' : ''} onClick={() => setTab('servicio')}>🧾 Servicio</button>
          <button className={tab === 'ingreso' ? 'on' : ''} onClick={() => setTab('ingreso')}>💰 Ingreso</button>
        </div>
        {tab === 'transferencia' && (
          <div className="nm-field">
            <label>Beneficiario</label>
            <input
              placeholder="Ej: Juan Pérez"
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
            />
          </div>
        )}
        {tab === 'servicio' && (
          <div className="nm-field">
            <label>Servicio</label>
            <div className="nm-services">
              {SERVICIOS.map((s) => (
                <button key={s} className={servicio === s ? 'on' : ''} onClick={() => setServicio(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {tab === 'ingreso' && (
          <div className="nm-field">
            <label>Origen del ingreso</label>
            <input
              placeholder="Ej: Sueldo, freelance, venta..."
              value={origenIngreso}
              onChange={(e) => setOrigenIngreso(e.target.value)}
            />
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

const SUBCAT_EMOJIS = ['🛒', '🍔', '☕', '🎬', '🎮', '🏃', '✈️', '🎓', '💼', '🐶', '💊', '👕', '🔧', '🎁', '📚', '💡'];

export function CreateSubcatSheet({
  client, usuario, categorias, onClose, onCreated,
}: {
  client: TaggerClient | null;
  usuario: string;
  categorias: Categoria[];
  onClose: () => void;
  onCreated: (created: CategoriaUsuario) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [emoji, setEmoji] = useState<string>(SUBCAT_EMOJIS[0]!);
  const [rubroId, setRubroId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autosugerencia rubro: matchea nombre vs categorias canónicas.
  const sugeridos = useMemo(() => {
    const q = nombre.trim().toLowerCase();
    if (!q || q.length < 3) return [];
    const out: Categoria[] = [];
    for (const c of categorias) {
      const hay = (c.nombre + ' ' + c.slug + ' ' + (c.descripcion ?? '')).toLowerCase();
      if (hay.includes(q)) out.push(c);
    }
    return out.slice(0, 3);
  }, [nombre, categorias]);

  // Auto-seleccionar primera sugerencia si no hay rubro elegido aún.
  useEffect(() => {
    if (!rubroId && sugeridos.length > 0) setRubroId(sugeridos[0]!.id);
  }, [sugeridos, rubroId]);

  const rubroSel = categorias.find((c) => c.id === rubroId) ?? null;
  const nombreIgualRubro =
    rubroSel != null && nombre.trim().toLowerCase() === rubroSel.nombre.trim().toLowerCase();

  const submit = async () => {
    setError(null);
    if (!client) { setError('Sin cliente'); return; }
    const n = nombre.trim();
    if (!n) { setError('Ingresá un nombre'); return; }
    if (!rubroId) { setError('Elegí un rubro'); return; }
    if (nombreIgualRubro) { setError('El nombre no puede ser igual al rubro'); return; }
    setSaving(true);
    try {
      const created = await client.categoriasUsuario.crear({
        usuario,
        canonicaId: rubroId,
        nombre: n,
        emoji,
      });
      onCreated(created);
      onClose();
    } catch (e) {
      const msg = (e as { message?: string }).message || 'Error al crear';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85%' }}>
        <div className="grab" />
        <h3>Crear categoría</h3>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Personal — internamente la agrupamos bajo un rubro.
        </div>

        <div className="nm-field">
          <label>Nombre</label>
          <input
            placeholder="Ej: Streaming, Verdulería barrio..."
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </div>

        <div className="nm-field">
          <label>Emoji</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUBCAT_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                style={{
                  width: 36, height: 36, fontSize: 18, lineHeight: 1,
                  borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  background: emoji === e ? '#eaf3ff' : '#f6f8fb',
                  border: emoji === e ? '2px solid var(--blue3)' : '1px solid var(--line)',
                }}
              >{e}</button>
            ))}
          </div>
        </div>

        <div className="nm-field">
          <label>Rubro</label>
          {sugeridos.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              Sugerencias automáticas según el nombre:
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {sugeridos.map((c) => {
              const st = catStyle(c.slug);
              const on = rubroId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setRubroId(c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    background: on ? '#eaf3ff' : '#f6f8fb',
                    border: on ? '2px solid var(--blue3)' : '1px solid var(--line)',
                    fontSize: 12, fontWeight: 700, color: 'var(--ink)',
                  }}
                >
                  <span>{st.emoji}</span>{c.nombre}
                </button>
              );
            })}
          </div>
          <select
            value={rubroId}
            onChange={(e) => setRubroId(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
              borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 0,
            }}
          >
            <option value="">Elegí un rubro...</option>
            {categorias
              .filter((c) => c.slug !== 'sin-categoria')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </div>

        {nombreIgualRubro && (
          <div style={{ fontSize: 12, color: '#c2410c', marginBottom: 10 }}>
            ⚠ El nombre coincide con el rubro padre. Usá un nombre más específico.
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#c2410c', marginBottom: 10 }}>{error}</div>}

        <button
          disabled={saving || !nombre.trim() || !rubroId || nombreIgualRubro}
          onClick={submit}
          style={{
            width: '100%', background: 'var(--blue3)', color: '#fff', border: 0,
            borderRadius: 22, padding: 13, fontWeight: 700, fontSize: 15, cursor: 'pointer',
            opacity: saving || !nombre.trim() || !rubroId || nombreIgualRubro ? 0.5 : 1,
            marginTop: 4,
          }}
        >
          {saving ? 'Guardando…' : 'Crear categoría'}
        </button>
      </div>
    </div>
  );
}
