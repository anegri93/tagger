const $ = (id) => document.getElementById(id);

function setStatus(t, c = '') {
  const el = $('status');
  el.textContent = t;
  el.className = `t-small ${c === 'live' ? '' : 't-muted'}`;
}

function esc(s) {
  if (s == null) return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadList() {
  setStatus('cargando…');
  const tbodySkel = $('lista-cats');
  if (tbodySkel && window.taggerSkeleton) {
    window.taggerSkeleton.rows(tbodySkel, { rows: 5, cols: 6 });
  }
  try {
    const { items } = await window.taggerApi('/categorias');
    const tbody = $('lista-cats');
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" id="cats-empty-cell"></td></tr>';
      const cell = document.getElementById('cats-empty-cell');
      if (window.taggerEmpty && cell) {
        window.taggerEmpty.render(cell, {
          title: 'Sin categorías',
          message: 'Creá la primera categoría o importá un catálogo para empezar.',
          ctaLabel: '+ Nueva categoría',
          ctaHref: '#',
          postmanRequest: 'POST /categorias',
        });
      }
      setStatus('');
      return;
    }
    tbody.innerHTML = items
      .map(
        (c) => `<tr data-slug="${c.slug}">
          <td><a href="detalle.html?slug=${c.slug}">${esc(c.slug)}</a></td>
          <td>${esc(c.nombre)}</td>
          <td class="num"><span data-usage="movimientos">…</span></td>
          <td class="num"><span data-usage="mcc">…</span></td>
          <td class="num"><span data-usage="comercios">…</span></td>
          <td>
            <button class="action-btn" data-act="edit" data-slug="${c.slug}">Editar</button>
            <button class="action-btn delete" data-act="delete" data-slug="${c.slug}">Eliminar</button>
          </td>
        </tr>`,
      )
      .join('');
    await Promise.all(
      items.map(async (c) => {
        try {
          const u = await window.taggerApi(`/categorias/${encodeURIComponent(c.slug)}/usage`);
          const row = tbody.querySelector(`tr[data-slug="${c.slug}"]`);
          if (!row) return;
          row.querySelector('[data-usage="movimientos"]').textContent = u.movimientos;
          row.querySelector('[data-usage="mcc"]').textContent = u.mcc;
          row.querySelector('[data-usage="comercios"]').textContent = u.comercios;
        } catch {}
      }),
    );
    setStatus(`${items.length} categorías`, 'live');
  } catch (e) {
    setStatus(`error: ${e.message}`, 'error');
    if (window.toast)
      window.toast.error(e.userMessage || e.message, {
        action: { label: 'Reintentar', onClick: () => loadList() },
      });
  }
}

async function crear() {
  const slug = $('new-slug').value.trim();
  const nombre = $('new-nombre').value.trim();
  const desc = $('new-desc').value.trim() || undefined;
  $('new-error').textContent = '';
  if (!slug || !nombre) {
    $('new-error').textContent = 'slug y nombre requeridos';
    return;
  }
  try {
    await window.taggerApi('/categorias', {
      method: 'POST',
      body: JSON.stringify({ slug, nombre, descripcion: desc }),
    });
    $('modal-new').style.display = 'none';
    $('new-slug').value = '';
    $('new-nombre').value = '';
    $('new-desc').value = '';
    await loadList();
    if (window.toast) window.toast.success(`Categoría "${slug}" creada`);
  } catch (e) {
    $('new-error').textContent = e.message;
    if (window.toast) window.toast.error(e.userMessage || e.message);
  }
}

async function eliminar(slug) {
  try {
    const u = await window.taggerApi(`/categorias/${encodeURIComponent(slug)}/usage`);
    if (u.movimientos > 0 || u.mcc > 0 || u.comercios > 0) {
      alert(
        `No se puede eliminar: tiene refs\nmov:${u.movimientos} mcc:${u.mcc} comercios:${u.comercios}`,
      );
      return;
    }
    if (!confirm(`Eliminar categoría '${slug}'?`)) return;
    await window.taggerApi(`/categorias/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    await loadList();
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function editar(slug) {
  const nombre = prompt('Nuevo nombre:', '');
  if (!nombre) return;
  try {
    await window.taggerApi(`/categorias/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify({ nombre }),
    });
    await loadList();
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function loadConflictos() {
  // Detectar conflictos: misma (tipo, valor_normalizado) apunta a >1 categoría dentro del scope global.
  // Reemplazo de /patrones/conflictos (endpoint removido en simplificación).
  try {
    const { items: reglas } = await window.taggerApi('/reglas?scope=global');
    const grupos = new Map();
    for (const r of reglas) {
      const key = `${r.tipo}|${r.valor_normalizado}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push({
        tipo: r.tipo,
        valor: r.valor,
        categoria_slug: r.categoria_slug,
        regla_id: r.id,
      });
    }
    const items = [];
    for (const [, entries] of grupos) {
      const cats = new Set(entries.map((e) => e.categoria_slug));
      if (cats.size > 1) {
        items.push({
          tipo: entries[0].tipo,
          valor: entries[0].valor,
          entries,
        });
      }
    }
    const banner = $('conflictos-banner');
    if (!items || items.length === 0) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'block';
    $('conflictos-count').textContent = String(items.length);
    const det = $('conflictos-detalle');
    det.innerHTML = items
      .map(
        (c) =>
          `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
            <code>${esc(c.tipo)} "${esc(c.valor)}"</code> →
            ${c.entries
              .map(
                (e) =>
                  `<span style="margin-left:8px;padding:2px 6px;background:rgba(255,255,255,0.08);border-radius:4px">${esc(e.categoriaSlug)} <span class="t-small t-muted">(prio ${e.prioridad})</span></span>`,
              )
              .join('')}
          </div>`,
      )
      .join('');
  } catch (e) {
    // silencio: feature secundaria
    console.warn('conflictos load failed:', e);
  }
}

$('btn-reload').addEventListener('click', () => {
  loadList();
  loadConflictos();
});
$('btn-new').addEventListener('click', () => ($('modal-new').style.display = 'flex'));
$('btn-cancel').addEventListener('click', () => ($('modal-new').style.display = 'none'));
$('btn-save').addEventListener('click', crear);
$('lista-cats').addEventListener('click', (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const act = btn.dataset.act;
  const slug = btn.dataset.slug;
  if (act === 'edit') editar(slug);
  else if (act === 'delete') eliminar(slug);
});
$('conflictos-toggle').addEventListener('click', () => {
  const det = $('conflictos-detalle');
  const visible = det.style.display !== 'none';
  det.style.display = visible ? 'none' : 'block';
  $('conflictos-toggle').textContent = visible ? 'Ver detalle' : 'Ocultar';
});

window.tagger.on('apiKey', () => {
  loadList();
  loadConflictos();
});
loadList();
