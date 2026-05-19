const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const params = new URLSearchParams(window.location.search);
const SLUG = params.get('slug');
if (!SLUG) {
  window.toast?.error('falta ?slug=X');
  window.location.href = 'index.html';
}

// API + state vienen de shared (window.taggerApi, window.tagger)

function setStatus(t, c = '') {
  const el = $('#status');
  el.textContent = t;
  el.className = c;
}

function esc(s) {
  if (s == null) return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Tabs
const TABS_LOADED = new Set();
$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('.tab-content').forEach((x) =>
      x.classList.toggle('active', x.dataset.tab === t.dataset.tab),
    );
    const tab = t.dataset.tab;
    if (!TABS_LOADED.has(tab)) setStatus('cargando…', 'live');
    const done = () => {
      TABS_LOADED.add(tab);
      setStatus('live', 'live');
    };
    if (tab === 'mcc') loadMcc().then(done);
    if (tab === 'marcas') loadMarcas().then(done);
    if (tab === 'comercios') loadComercios().then(done);
    if (tab === 'patrones') loadPatrones().then(done);
  }),
);

// Info
async function loadInfo() {
  $('#cat-slug').textContent = SLUG;
  $('#info-slug').value = SLUG;
  try {
    const { items } = await window.taggerApi('/categorias');
    const cat = items.find((c) => c.slug === SLUG);
    if (cat) {
      $('#info-nombre').value = cat.nombre;
      $('#info-desc').value = cat.descripcion ?? '';
    }
    const u = await window.taggerApi(`/categorias/${encodeURIComponent(SLUG)}/usage`);
    $('#info-usage').textContent =
      `Movimientos: ${u.movimientos} | MCCs: ${u.mcc} | Comercios: ${u.comercios}`;
    setStatus('live', 'live');
  } catch (e) {
    setStatus(`error: ${e.message}`, 'error');
  }
}

$('#info-save').addEventListener('click', async () => {
  try {
    await window.taggerApi(`/categorias/${encodeURIComponent(SLUG)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nombre: $('#info-nombre').value.trim(),
        descripcion: $('#info-desc').value.trim() || null,
      }),
    });
    setStatus('guardado', 'live');
    window.toast?.success('Cambios guardados');
  } catch (e) {
    window.toast?.error(e.message);
  }
});

$('#btn-delete-cat').addEventListener('click', async () => {
  if (!confirm(`Eliminar categoría '${SLUG}'?`)) return;
  try {
    await window.taggerApi(`/categorias/${encodeURIComponent(SLUG)}`, { method: 'DELETE' });
    window.location.href = 'index.html';
  } catch (e) {
    if (e.body?.usage)
      window.toast?.error(`No se puede eliminar: tiene refs ${JSON.stringify(e.body.usage)}`);
    else window.toast?.error(e.message);
  }
});

// MCC
async function loadMcc() {
  try {
    const [asignados, sin] = await Promise.all([
      window.taggerApi(`/mcc?categoria=${encodeURIComponent(SLUG)}`),
      window.taggerApi('/mcc?sin_categoria=true'),
    ]);
    $('#mcc-asignados-tbl tbody').innerHTML = asignados.items
      .map(
        (m) => `<tr>
          <td><code>${esc(m.codMcc)}</code></td>
          <td>${esc(m.descripcion)}</td>
          <td><button class="action-btn delete" data-act="unassign" data-cod="${m.codMcc}">Quitar</button></td>
        </tr>`,
      )
      .join('');
    $('#mcc-disponibles-tbl tbody').innerHTML = sin.items
      .slice(0, 50)
      .map(
        (m) => `<tr>
          <td><code>${esc(m.codMcc)}</code></td>
          <td>${esc(m.descripcion)}</td>
          <td><button class="action-btn" data-act="assign" data-cod="${m.codMcc}">Asignar</button></td>
        </tr>`,
      )
      .join('');
  } catch (e) {
    setStatus(`error mcc: ${e.message}`, 'error');
  }
}

$('#mcc-asignar-btn').addEventListener('click', async () => {
  const cod = $('#mcc-asignar-cod').value.trim();
  if (!cod) return;
  try {
    await window.taggerApi(`/mcc/${cod}`, {
      method: 'PATCH',
      body: JSON.stringify({ categoria_slug: SLUG }),
    });
    $('#mcc-asignar-cod').value = '';
    await loadMcc();
  } catch (e) {
    window.toast?.error(e.message);
  }
});

document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const act = btn.dataset.act;
  const cod = btn.dataset.cod;
  if (!cod) return;
  try {
    if (act === 'assign') {
      await window.taggerApi(`/mcc/${cod}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoria_slug: SLUG }),
      });
    } else if (act === 'unassign') {
      await window.taggerApi(`/mcc/${cod}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoria_slug: null }),
      });
    } else return;
    await loadMcc();
  } catch (err) {
    window.toast?.error(err.message);
  }
});

// Marcas
async function loadMarcas() {
  try {
    const { items } = await window.taggerApi(`/marcas?categoria=${encodeURIComponent(SLUG)}`);
    $('#marcas-tbl tbody').innerHTML = items
      .map(
        (m) => `<tr data-id="${m.id}">
          <td>${esc(m.marca)}</td>
          <td>${esc(m.descripcion)}</td>
          <td><button class="action-btn delete" data-act="del-marca" data-id="${m.id}">Eliminar</button></td>
        </tr>`,
      )
      .join('');
  } catch (e) {
    setStatus(`error marcas: ${e.message}`, 'error');
  }
}

$('#m-add').addEventListener('click', async () => {
  const marca = $('#m-marca').value.trim();
  const descripcion = $('#m-desc').value.trim() || undefined;
  if (!marca) return;
  try {
    await window.taggerApi('/marcas', {
      method: 'POST',
      body: JSON.stringify({ marca, categoria_slug: SLUG, descripcion }),
    });
    $('#m-marca').value = '';
    $('#m-desc').value = '';
    await loadMarcas();
    window.toast?.success('Marca agregada');
  } catch (e) {
    window.toast?.error(e.message);
  }
});

$('#marcas-tbl').addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn || btn.dataset.act !== 'del-marca') return;
  if (!confirm('Eliminar marca?')) return;
  try {
    await window.taggerApi(`/marcas/${btn.dataset.id}`, { method: 'DELETE' });
    await loadMarcas();
    window.toast?.success('Marca eliminada');
  } catch (e) {
    window.toast?.error(e.message);
  }
});

// Comercios tab
const comerciosState = { offset: 0, limit: 50, total: 0, q: '', revOnly: false, allCats: [] };

async function loadAllCats() {
  if (comerciosState.allCats.length > 0) return;
  try {
    const r = await window.taggerApi('/categorias');
    comerciosState.allCats = r.items;
  } catch {}
}

async function loadComercios() {
  await loadAllCats();
  const params = new URLSearchParams();
  params.set('categoria', SLUG);
  params.set('limit', String(comerciosState.limit));
  params.set('offset', String(comerciosState.offset));
  if (comerciosState.q) params.set('q', comerciosState.q);
  if (comerciosState.revOnly) params.set('requiere_revision', 'true');
  try {
    const r = await window.taggerApi(`/comercios?${params}`);
    comerciosState.total = r.total;
    const tbody = $('#comercios-tbl tbody');
    const opts = comerciosState.allCats
      .map((c) => `<option value="${c.slug}">${esc(c.slug)}</option>`)
      .join('');
    tbody.innerHTML = r.items
      .map(
        (c) => `<tr data-id="${c.id}">
          <td>${esc(c.nombre)}</td>
          <td>${esc(c.bancardId)}</td>
          <td>${esc(c.codigoComercio)}</td>
          <td>${esc(c.mcc)}</td>
          <td><span class="tag tag-info">${esc(c.fuenteCategoria)}</span></td>
          <td class="num">${c.confianza ?? '—'}</td>
          <td><input type="checkbox" data-act="rev" data-id="${c.id}" ${c.requiereRevision ? 'checked' : ''} /></td>
          <td>
            <select data-act="cat" data-id="${c.id}">
              <option value="">—</option>
              ${opts}
            </select>
          </td>
        </tr>`,
      )
      .join('');
    const from = comerciosState.offset + 1;
    const to = Math.min(comerciosState.offset + r.items.length, comerciosState.total);
    $('#cm-info').textContent =
      r.items.length === 0 ? 'sin resultados' : `${from}-${to} de ${comerciosState.total}`;
    $('#cm-prev').disabled = comerciosState.offset === 0;
    $('#cm-next').disabled = comerciosState.offset + comerciosState.limit >= comerciosState.total;
  } catch (e) {
    setStatus(`error comercios: ${e.message}`, 'error');
  }
}

$('#cm-search').addEventListener('click', () => {
  comerciosState.q = $('#cm-q').value.trim();
  comerciosState.revOnly = $('#cm-rev').checked;
  comerciosState.offset = 0;
  loadComercios();
});

$('#cm-q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#cm-search').click();
});

$('#cm-prev').addEventListener('click', () => {
  comerciosState.offset = Math.max(0, comerciosState.offset - comerciosState.limit);
  loadComercios();
});

$('#cm-next').addEventListener('click', () => {
  if (comerciosState.offset + comerciosState.limit < comerciosState.total) {
    comerciosState.offset += comerciosState.limit;
    loadComercios();
  }
});

$('#comercios-tbl').addEventListener('change', async (e) => {
  const el = e.target;
  const id = el.dataset.id;
  const act = el.dataset.act;
  if (!id || !act) return;
  const payload =
    act === 'cat'
      ? el.value
        ? { categoria_slug: el.value }
        : null
      : { requiere_revision: el.checked };
  if (!payload) return;
  try {
    await window.taggerApi(`/comercios/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (act === 'cat' && el.value && el.value !== SLUG) {
      // movió a otra categoría → quitar fila de esta vista
      el.closest('tr').remove();
    } else {
      await loadComercios();
    }
  } catch (err) {
    window.toast?.error(err.message);
  }
});

// Reglas globales (filtradas por categoría en cliente)
async function loadPatrones() {
  try {
    const { items } = await window.taggerApi('/reglas?scope=global');
    const filtradas = items.filter((p) => p.categoria_slug === SLUG);
    const tbody = $('#patrones-tbl tbody');
    tbody.innerHTML = filtradas
      .map(
        (p) => `<tr data-id="${p.id}">
          <td>${esc(p.tipo)}</td>
          <td><code>${esc(p.valor)}</code></td>
          <td>${p.prioridad}</td>
          <td>${p.activo ? '✓' : '✗'}</td>
          <td>${esc(p.descripcion)}</td>
          <td>
            <button class="action-btn" data-act="p-toggle" data-id="${p.id}" data-activo="${p.activo}">${p.activo ? 'Desact' : 'Act'}</button>
            <button class="action-btn delete" data-act="p-del" data-id="${p.id}">Eliminar</button>
          </td>
        </tr>`,
      )
      .join('');
  } catch (e) {
    setStatus(`error reglas: ${e.message}`, 'error');
  }
}

$('#p-add').addEventListener('click', async () => {
  // Tipos válidos en reglas: literal | contiene | regex. Si UI ofrece 'prefijo', convertir a regex.
  let tipo = $('#p-tipo').value;
  let valor = $('#p-valor').value.trim();
  if (tipo === 'prefijo') {
    tipo = 'regex';
    valor = '^' + valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const prioridad = Number($('#p-prio').value) || 100;
  const descripcion = $('#p-desc').value.trim() || undefined;
  if (!valor) return window.toast?.error('falta valor');
  try {
    await window.taggerApi('/reglas', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'global',
        tipo,
        valor,
        categoria_slug: SLUG,
        prioridad,
        descripcion,
      }),
    });
    $('#p-valor').value = '';
    $('#p-desc').value = '';
    await loadPatrones();
    window.toast?.success('Regla agregada');
  } catch (e) {
    window.toast?.error(e.message);
  }
});

$('#patrones-tbl').addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  try {
    if (act === 'p-del') {
      if (!confirm('Eliminar regla?')) return;
      await window.taggerApi(`/reglas/${id}`, { method: 'DELETE' });
    } else if (act === 'p-toggle') {
      const activo = btn.dataset.activo !== 'true';
      await window.taggerApi(`/reglas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo }),
      });
    } else return;
    await loadPatrones();
  } catch (err) {
    window.toast?.error(err.message);
  }
});

// Sugerencias por categoría: feature removida en simplificación.
// Las sugerencias ahora viven en /ui/dashboard/ (globales cross-user).
const sugBtn = document.getElementById('p-sugerir');
if (sugBtn) {
  sugBtn.style.display = 'none';
}
const sugPanel = document.getElementById('p-sugerir-panel');
if (sugPanel) sugPanel.style.display = 'none';

// Test patrón inline: feature removida.
const testBtn = document.getElementById('p-test-btn');
if (testBtn) testBtn.style.display = 'none';
const testInput = document.getElementById('p-test-texto');
if (testInput) testInput.style.display = 'none';

loadInfo();
