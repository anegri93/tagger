import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Categoria, PresupuestoEstado, TaggerClient } from '@mango/tagger-sdk';
import { catStyle } from './cat-style';
import { fmt } from './utils';

interface Props {
  client: TaggerClient | null;
  usuario: string;
  categorias: Categoria[];
  focusCategoriaId?: string | null;
  onClearFocus?: () => void;
  onSinAsignar: () => void;
  onViewMovs: (categoriaSlug: string) => void;
}

export function BudgetView({ client, usuario, categorias, focusCategoriaId, onClearFocus, onSinAsignar, onViewMovs }: Props) {
  const [estado, setEstado] = useState<PresupuestoEstado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCatId, setNewCatId] = useState('');
  const [newMonto, setNewMonto] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pulseCatId, setPulseCatId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const e = await client.presupuestos.estado({ usuario });
      setEstado(e);
    } catch (e) {
      setError((e as Error).message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [client, usuario]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Cuando llegamos con focusCategoriaId desde Manguito: scroll al item + pulse 2.5s.
  useEffect(() => {
    if (!focusCategoriaId || !estado) return;
    const item = estado.items.find((i) => i.categoria_id === focusCategoriaId);
    if (!item) return;
    const node = itemRefs.current[item.id];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseCatId(item.id);
      const t = setTimeout(() => setPulseCatId(null), 2500);
      const t2 = setTimeout(() => onClearFocus?.(), 100);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
  }, [focusCategoriaId, estado, onClearFocus]);

  const onCrear = async () => {
    if (!client || !newCatId || !newMonto) return;
    const monto = Number(newMonto.replace(/\D/g, ''));
    if (!monto || monto <= 0) { setError('Monto inválido'); return; }
    try {
      await client.presupuestos.crear({ usuario, categoria_id: newCatId, monto_mensual: monto });
      setShowAdd(false); setNewCatId(''); setNewMonto('');
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Error al crear');
    }
  };

  const onGuardarEdit = async (id: string) => {
    if (!client) return;
    const monto = Number(editMonto.replace(/\D/g, ''));
    if (!monto || monto <= 0) { setError('Monto inválido'); return; }
    try {
      await client.presupuestos.actualizar(id, monto);
      setEditId(null); setEditMonto('');
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Error');
    }
  };

  const onEliminar = async (id: string) => {
    if (!client) return;
    if (!confirm('¿Eliminar presupuesto?')) return;
    try {
      await client.presupuestos.eliminar(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Error');
    }
  };

  // Categorías sin presupuesto aún (excluye sin-categoria).
  const catsAsignadas = new Set((estado?.items ?? []).map((i) => i.categoria_id));
  const catsDisponibles = categorias.filter(
    (c) => c.slug !== 'sin-categoria' && !catsAsignadas.has(c.id),
  );

  return (
    <div className="budget-view">
      <div className="budget-header">
        <div>
          <small>Presupuestos · {estado?.mes ?? ''}</small>
          <h3>Tus límites mensuales</h3>
        </div>
        {!showAdd && catsDisponibles.length > 0 && (
          <button className="budget-add-btn" onClick={() => setShowAdd(true)} aria-label="Agregar presupuesto">+</button>
        )}
      </div>

      {error && <div className="budget-error">{error}</div>}
      {loading && !estado && <div className="budget-empty">Cargando…</div>}

      {showAdd && (
        <div className="budget-add-form">
          <select value={newCatId} onChange={(e) => setNewCatId(e.target.value)}>
            <option value="">Elegí categoría…</option>
            {catsDisponibles.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <input
            type="text" inputMode="numeric" placeholder="Monto mensual (Gs.)"
            value={newMonto}
            onChange={(e) => setNewMonto(e.target.value.replace(/\D/g, ''))}
          />
          <div className="budget-add-actions">
            <button className="budget-btn ghost" onClick={() => { setShowAdd(false); setNewCatId(''); setNewMonto(''); }}>Cancelar</button>
            <button className="budget-btn primary" onClick={onCrear} disabled={!newCatId || !newMonto}>Guardar</button>
          </div>
        </div>
      )}

      <div className="budget-list">
        {(estado?.items ?? []).map((it) => {
          const st = catStyle(it.categoria_slug);
          const overspend = it.pct > 100;
          const warn = it.pct >= 80 && !overspend;
          const editing = editId === it.id;
          return (
            <div
              key={it.id}
              ref={(el) => { itemRefs.current[it.id] = el; }}
              className={'budget-item' + (overspend ? ' over' : warn ? ' warn' : '') + (pulseCatId === it.id ? ' pulse' : '')}
            >
              <div className="budget-item-head">
                <div className="budget-item-cat">
                  <span className="budget-emoji">{st.emoji}</span>
                  <span className="budget-cat-name">{st.label}</span>
                </div>
                {editing ? (
                  <div className="budget-edit">
                    <input
                      type="text" inputMode="numeric"
                      value={editMonto}
                      onChange={(e) => setEditMonto(e.target.value.replace(/\D/g, ''))}
                      autoFocus
                    />
                    <button className="budget-link" onClick={() => onGuardarEdit(it.id)}>OK</button>
                    <button className="budget-link ghost" onClick={() => setEditId(null)}>✕</button>
                  </div>
                ) : (
                  <button
                    className="budget-monto"
                    onClick={() => { setEditId(it.id); setEditMonto(String(it.presupuesto)); }}
                    title="Editar"
                  >
                    {fmt(it.presupuesto)}
                  </button>
                )}
              </div>
              <div className="budget-bar">
                <div
                  className="budget-bar-fill"
                  style={{ width: Math.min(100, it.pct) + '%' }}
                />
              </div>
              <div className="budget-meta">
                <span className="budget-pct">{it.pct}% usado</span>
                <span className="budget-restante">
                  {overspend
                    ? `Excedido en ${fmt(Math.abs(it.restante))}`
                    : `Restan ${fmt(it.restante)}`}
                </span>
              </div>
              <div className="budget-actions">
                <button className="budget-link" onClick={() => onViewMovs(it.categoria_slug)}>
                  Ver {it.movs} {it.movs === 1 ? 'mov' : 'movs'} →
                </button>
                <button className="budget-link ghost" onClick={() => onEliminar(it.id)} title="Eliminar">🗑</button>
              </div>
            </div>
          );
        })}

        {estado?.sin_asignar && estado.sin_asignar.movs > 0 && (
          <button className="budget-sin-asignar" onClick={onSinAsignar}>
            <div className="budget-sin-asignar-row">
              <div>
                <small>SIN ASIGNAR</small>
                <div className="budget-sin-asignar-amt">{fmt(estado.sin_asignar.gastado)}</div>
                <small>{estado.sin_asignar.movs} mov sin categoría este mes</small>
              </div>
              <div className="budget-sin-asignar-cta">Revisar →</div>
            </div>
          </button>
        )}

        {!loading && (estado?.items.length ?? 0) === 0 && !showAdd && (
          <div className="budget-empty">
            Sin presupuestos aún. Tocá <b>+</b> para asignar uno a una categoría.
          </div>
        )}
      </div>
    </div>
  );
}
