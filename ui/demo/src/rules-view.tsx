import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Regla, TaggerClient } from '@mango/tagger-sdk';
import { catStyle } from './cat-style';
import { formatHits, friendlyRule } from './rule-friendly';

interface RulesViewProps {
  client: TaggerClient | null;
  usuario: string;
  onAfterMutate?: () => void;
}

// Extrae nombre limpio: si "X ... X" detectado (típico en transferencias) devuelve "X".
// Si no, limpia separadores sobrantes al final.
function smartMerchantName(s: string): string {
  const t = s.trim();
  for (let len = Math.floor(t.length / 2); len >= 4; len--) {
    const head = t.slice(0, len).trim();
    if (head.length < 4) continue;
    if (t.toLowerCase().endsWith(head.toLowerCase()) && t.length >= head.length * 1.6) {
      return head;
    }
  }
  return t.replace(/[\s,\-–—→]+$/, '').trim();
}

// Detecta si la regla nació de una transferencia a/desde uno mismo.
function isSelfTransfer(s: string): boolean {
  const t = s.trim();
  for (let len = Math.floor(t.length / 2); len >= 4; len--) {
    const head = t.slice(0, len).trim();
    if (head.length < 4) continue;
    if (t.toLowerCase().endsWith(head.toLowerCase()) && t.length >= head.length * 1.6) {
      const middle = t.slice(head.length, t.length - head.length).toLowerCase();
      return /transfer|pago a|envío|envio|cobro/.test(middle);
    }
  }
  return false;
}

export function RulesView({ client, usuario, onAfterMutate }: RulesViewProps) {
  const [userRules, setUserRules] = useState<Regla[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const u = await client.reglas.listar({ scope: `usuario:${usuario}` });
      setUserRules(u);
    } catch (e) {
      setError((e as Error).message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [client, usuario]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Cierra menú al click fuera
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-rule-menu]')) setMenuFor(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuFor]);

  const togglePause = async (r: Regla) => {
    if (!client) return;
    setMenuFor(null);
    try {
      await client.reglas.actualizar(r.id, { activo: !r.activo });
      await refresh();
      onAfterMutate?.();
    } catch (e) { setError((e as Error).message); }
  };

  const eliminar = async (r: Regla) => {
    if (!client) return;
    setMenuFor(null);
    if (!window.confirm(`¿Olvidar "${smartMerchantName(friendlyRule(r).texto)}"?`)) return;
    try {
      await client.reglas.eliminar(r.id);
      await refresh();
      onAfterMutate?.();
    } catch (e) { setError((e as Error).message); }
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return userRules;
    return userRules.filter((r) =>
      r.valor.toLowerCase().includes(ql) ||
      catStyle(r.categoria_slug).label.toLowerCase().includes(ql),
    );
  }, [userRules, q]);

  return (
    <>
      {/* Header línea única: contador */}
      <div style={{ margin: '2px 0 10px', fontSize: 12, color: 'var(--muted)' }}>
        <b style={{ color: 'var(--ink)', fontSize: 14, marginRight: 6 }}>{userRules.length}</b>
        {userRules.length === 1 ? 'regla aprendida' : 'reglas aprendidas'}
      </div>

      {/* Search */}
      {userRules.length > 0 && (
        <div className="search" style={{ marginBottom: 10 }}>
          <span style={{ color: '#9aa6b7' }}>🔍</span>
          <input
            placeholder="Buscar en tus reglas..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}

      {error && <div className="demo-banner" style={{ marginBottom: 10 }}>⚠️ {error}</div>}

      {loading && userRules.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 13, padding: 14 }}>Cargando…</p>
      )}

      {!loading && userRules.length === 0 && <EmptyMine />}

      {!loading && filtered.length === 0 && userRules.length > 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 13, padding: 14 }}>Sin resultados</p>
      )}

      {/* Lista densa — sin overflow:hidden para no clipear popovers */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12 }}>
        {filtered.map((r, i) => (
          <RuleRow
            key={r.id}
            regla={r}
            divider={i > 0}
            editable={true}
            menuOpen={menuFor === r.id}
            expanded={expandedId === r.id}
            onToggleMenu={() => { setMenuFor(menuFor === r.id ? null : r.id); }}
            onToggleExpand={() => { setExpandedId(expandedId === r.id ? null : r.id); setMenuFor(null); }}
            onPause={() => togglePause(r)}
            onDelete={() => eliminar(r)}
          />
        ))}
      </div>

    </>
  );
}

function EmptyMine() {
  return (
    <div
      style={{
        textAlign: 'center', padding: '22px 14px',
        background: '#f6f8fb', borderRadius: 12, color: 'var(--muted)',
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 4 }}>💡</div>
      <b style={{ color: 'var(--ink)', fontSize: 13 }}>Aún no aprendí nada tuyo</b>
      <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.35 }}>
        Corregí una categoría desde un movimiento y la recordaré.
      </p>
    </div>
  );
}

function RuleRow({
  regla, divider, editable, menuOpen, expanded,
  onToggleMenu, onToggleExpand, onPause, onDelete,
}: {
  regla: Regla;
  divider: boolean;
  editable: boolean;
  menuOpen: boolean;
  expanded: boolean;
  onToggleMenu: () => void;
  onToggleExpand: () => void;
  onPause: () => void;
  onDelete: () => void;
}) {
  const cat = catStyle(regla.categoria_slug);
  const f = friendlyRule(regla);
  const display = smartMerchantName(f.texto);
  const transfer = isSelfTransfer(f.texto);
  const paused = !regla.activo;
  const rootRef = useRef<HTMLDivElement>(null);

  // Cuando se expande, asegurar que el detalle quede visible dentro del .content scrollable.
  useEffect(() => {
    if (!expanded || !rootRef.current) return;
    const t = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const detail = rootRef.current?.querySelector<HTMLElement>('[data-rule-detail]');
      detail?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [expanded]);

  return (
    <div
      ref={rootRef}
      style={{
        borderTop: divider ? '1px solid #eef1f5' : 'none',
        opacity: paused ? .65 : 1,
        background: expanded ? '#fafbfd' : 'transparent',
        transition: 'background .15s ease',
      }}
    >
      <div
        onClick={onToggleExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 32, height: 32, borderRadius: 9,
            background: cat.color + '22', color: cat.color,
            display: 'grid', placeItems: 'center',
            fontSize: 16, flex: '0 0 32px',
          }}
        >
          {cat.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            title={f.texto}
            style={{
              fontSize: 13.5, fontWeight: 700, color: 'var(--ink)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.25,
            }}
          >
            {display}
          </div>
          <div
            style={{
              fontSize: 11.5, color: 'var(--muted)', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            <span style={{ color: cat.color, fontWeight: 700 }}>{cat.label}</span>
            {transfer && <span> · 🔁 transferencia</span>}
            {regla.hits > 0 && <span> · {formatHits(regla.hits)}×</span>}
            {paused && <span> · pausada</span>}
          </div>
        </div>

        {/* Chevron indica expand */}
        <span
          aria-hidden
          style={{
            color: 'var(--muted)', fontSize: 14, lineHeight: 1,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform .15s ease',
            flex: '0 0 auto', marginRight: editable ? 0 : 4,
          }}
        >›</span>

        {editable && (
          <RowMenu
            paused={paused}
            menuOpen={menuOpen}
            onToggleMenu={onToggleMenu}
            onPause={onPause}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Detalle expandido: explicación SI → ENTONCES en lenguaje natural */}
      {expanded && (
        <div
          data-rule-detail
          style={{
            padding: '0 12px 12px 54px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <DetailBlock
            tag="SI"
            tagColor="var(--blue3)"
            label={transfer ? 'es una transferencia con' : f.verbo.toLowerCase()}
            value={display}
          />
          <DetailBlock
            tag="ENTONCES"
            tagColor={cat.color}
            label="asigno la categoría"
            value={`${cat.emoji} ${cat.label}`}
          />
          {regla.hits > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Aplicada {formatHits(regla.hits)} {regla.hits === 1 ? 'vez' : 'veces'} en tus movimientos.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RowMenu({
  paused, menuOpen, onToggleMenu, onPause, onDelete,
}: {
  paused: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onPause: () => void;
  onDelete: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Calcula posición fija — abre arriba si no hay espacio abajo dentro de .content.
  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const btn = btnRef.current;
    const r = btn.getBoundingClientRect();
    const content = btn.closest('.content') as HTMLElement | null;
    const bounds = content?.getBoundingClientRect();
    const limitBottom = bounds ? bounds.bottom - 12 : window.innerHeight - 12;
    const menuHeight = 96; // Pausar + Olvidar
    const right = window.innerWidth - r.right;
    let top = r.bottom + 4;
    if (top + menuHeight > limitBottom) {
      top = r.top - menuHeight - 4;
    }
    setPos({ top, right });
  }, [menuOpen]);

  // Cerrar al scroll dentro del .content
  useEffect(() => {
    if (!menuOpen) return;
    const content = btnRef.current?.closest('.content');
    if (!content) return;
    const close = () => onToggleMenu();
    content.addEventListener('scroll', close, { passive: true });
    return () => content.removeEventListener('scroll', close);
  }, [menuOpen, onToggleMenu]);

  return (
    <div
      data-rule-menu
      style={{ position: 'relative', flex: '0 0 auto' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        onClick={onToggleMenu}
        aria-label="Opciones"
        title="Opciones"
        style={{
          background: menuOpen ? '#eaf3ff' : '#f6f8fb',
          color: menuOpen ? 'var(--blue3)' : 'var(--muted)',
          border: 0, width: 30, height: 30, borderRadius: 8,
          cursor: 'pointer', fontSize: 16, lineHeight: 1,
          display: 'grid', placeItems: 'center', fontFamily: 'inherit',
        }}
      >⋯</button>
      {menuOpen && pos && (
        <div
          style={{
            position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000,
            background: '#fff', border: '1px solid var(--line)',
            borderRadius: 10, padding: 4, minWidth: 152,
            boxShadow: '0 16px 32px rgba(10,40,90,.22)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <MenuItem onClick={onPause} icon={paused ? '▶' : '⏸'} label={paused ? 'Reactivar' : 'Pausar'} />
          <MenuItem onClick={onDelete} icon="✕" label="Olvidar" tone="pink" />
        </div>
      )}
    </div>
  );
}

function DetailBlock({
  tag, tagColor, label, value,
}: { tag: string; tagColor: string; label: string; value: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span
          style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em',
            textTransform: 'uppercase', color: '#fff',
            background: tagColor, padding: '2px 7px', borderRadius: 5,
          }}
        >{tag}</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</span>
      </div>
      <div
        style={{
          fontSize: 13, fontWeight: 600, color: 'var(--ink)',
          background: '#fff', border: '1px solid var(--line)',
          borderRadius: 8, padding: '7px 10px',
          wordBreak: 'break-word', lineHeight: 1.35,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MenuItem({
  onClick, icon, label, tone,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  tone?: 'pink';
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: 0,
        color: tone === 'pink' ? 'var(--pink)' : 'var(--ink)',
        padding: '8px 10px', borderRadius: 8,
        textAlign: 'left', cursor: 'pointer',
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f6f8fb'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{icon}</span>
      {label}
    </button>
  );
}
