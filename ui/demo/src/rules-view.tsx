import React, { useCallback, useEffect, useState } from 'react';
import type { Regla, TaggerClient } from '@mango/tagger-sdk';
import { catStyle } from './cat-style';
import { formatHits, friendlyRule } from './rule-friendly';

interface RulesViewProps {
  client: TaggerClient | null;
  usuario: string;
  onAfterMutate?: () => void;
}

export function RulesView({ client, usuario, onAfterMutate }: RulesViewProps) {
  const [userRules, setUserRules] = useState<Regla[]>([]);
  const [globalRules, setGlobalRules] = useState<Regla[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGlobal, setShowGlobal] = useState(false);
  const [globalQ, setGlobalQ] = useState('');

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [u, g] = await Promise.all([
        client.reglas.listar({ scope: `usuario:${usuario}` }),
        client.reglas.listar({ scope: 'global' }),
      ]);
      setUserRules(u);
      setGlobalRules(g);
    } catch (e) {
      setError((e as Error).message || 'Error al cargar reglas');
    } finally {
      setLoading(false);
    }
  }, [client, usuario]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggleActivo = async (r: Regla) => {
    if (!client) return;
    try {
      await client.reglas.actualizar(r.id, { activo: !r.activo });
      await refresh();
      onAfterMutate?.();
    } catch (e) { setError((e as Error).message); }
  };

  const eliminar = async (r: Regla) => {
    if (!client) return;
    if (!window.confirm(`¿Borrar esta preferencia tuya?\n\n"${friendlyRule(r).texto}" → ${catStyle(r.categoria_slug).label}`)) return;
    try {
      await client.reglas.eliminar(r.id);
      await refresh();
      onAfterMutate?.();
    } catch (e) { setError((e as Error).message); }
  };

  const filteredGlobal = globalQ
    ? globalRules.filter((r) => r.valor.toLowerCase().includes(globalQ.toLowerCase()))
    : globalRules;

  return (
    <>
      <div className="vscope"><span className="dot" />Tu memoria · cómo aprende de vos</div>

      {error && <div className="demo-banner" style={{ marginBottom: 10 }}>⚠️ {error}</div>}

      <div style={{ background: 'linear-gradient(135deg,#eaf3ff,#f6f2ff)', borderRadius: 16, padding: 14, marginBottom: 14, border: '1px solid #e0d7ff' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--purple)', textTransform: 'uppercase' }}>
          Tus preferencias
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
          {userRules.length} {userRules.length === 1 ? 'aprendida' : 'aprendidas'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Cuando corregís una categoría, el sistema lo recuerda para próximas veces.
        </div>
      </div>

      {loading && userRules.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 20 }}>Cargando…</p>
      )}

      {!loading && userRules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 12px', background: '#f6f8fb', borderRadius: 14, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>💡</div>
          <b style={{ color: 'var(--ink)' }}>Aún no aprendí nada</b>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>Corregí la categoría de un movimiento. La próxima vez con un nombre similar, lo voy a recordar.</p>
        </div>
      )}

      {userRules.map((r) => {
        const cat = catStyle(r.categoria_slug);
        const f = friendlyRule(r);
        return (
          <div
            key={r.id}
            style={{
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: 14,
              marginBottom: 10,
              boxShadow: '0 4px 12px rgba(10,40,90,.05)',
              opacity: r.activo ? 1 : 0.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: cat.color + '22', color: cat.color, display: 'grid', placeItems: 'center', fontSize: 20, flex: '0 0 38px' }}>
                {cat.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {f.verbo}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 2, wordBreak: 'break-word' }}>
                  {f.texto}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  → <b style={{ color: cat.color }}>{cat.label}</b>
                  {r.hits > 0 && <span> · usada {formatHits(r.hits)}×</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button
                onClick={() => toggleActivo(r)}
                style={{
                  background: r.activo ? '#eef3fb' : 'var(--teal)',
                  color: r.activo ? 'var(--blue3)' : '#fff',
                  border: 0, padding: '7px 14px', borderRadius: 16,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {r.activo ? 'Pausar' : 'Reactivar'}
              </button>
              <button
                onClick={() => eliminar(r)}
                style={{
                  background: 'transparent', color: 'var(--pink)',
                  border: '1px solid var(--pink)', padding: '7px 14px',
                  borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Olvidar
              </button>
            </div>
          </div>
        );
      })}

      <details
        open={showGlobal}
        onToggle={(e) => setShowGlobal((e.target as HTMLDetailsElement).open)}
        style={{ marginTop: 18, background: '#f6f8fb', borderRadius: 14, padding: 12 }}
      >
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink)', listStyle: 'none' }}>
          📚 Patrones globales ({globalRules.length}) — qué reconoce el sistema por defecto
        </summary>
        <div style={{ marginTop: 10 }}>
          <input
            placeholder="Buscar comercio..."
            value={globalQ}
            onChange={(e) => setGlobalQ(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13, outline: 0, background: '#fff' }}
          />
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
            {filteredGlobal.slice(0, 50).map((r) => {
              const cat = catStyle(r.categoria_slug);
              const f = friendlyRule(r);
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #e6ebf2' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 8, background: cat.color + '22', color: cat.color, display: 'grid', placeItems: 'center', fontSize: 13, flex: '0 0 24px' }}>
                    {cat.emoji}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', wordBreak: 'break-word' }}>
                    <b>{f.texto}</b>
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {cat.label}</span>
                  </span>
                  {r.hits > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatHits(r.hits)}×</span>
                  )}
                </div>
              );
            })}
            {filteredGlobal.length > 50 && (
              <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 11, marginTop: 8 }}>
                + {filteredGlobal.length - 50} más. Refiná tu búsqueda.
              </p>
            )}
            {filteredGlobal.length === 0 && (
              <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 12, padding: 14 }}>
                Sin resultados
              </p>
            )}
          </div>
        </div>
      </details>
    </>
  );
}
