const $ = (s) => document.querySelector(s);
const STORAGE = {
  url: 'tagger.tester.url',
  key: 'tagger.tester.key',
  history: 'tagger.tester.history',
};

const state = {
  url: localStorage.getItem(STORAGE.url) || 'http://localhost:3000',
  key: localStorage.getItem(STORAGE.key) || '',
  categorias: [],
  history: JSON.parse(localStorage.getItem(STORAGE.history) || '[]'),
};

const EJEMPLOS = {
  biggie: { descripcion: 'COMPRA BIGGIE EXPRESS SUC. CENTRO', monto: 50000 },
  copetrol: {
    descripcion: 'COPETROL ESTACION RUTA 2',
    nombre_bancard: 'COPETROL',
    mcc: '5541',
    monto: 250000,
  },
  mcc: { mcc: '5411', monto: 12000 },
  desconocido: { descripcion: 'XYZ COMERCIO RANDOM', monto: 30000 },
};

function saveHistory() {
  localStorage.setItem(STORAGE.history, JSON.stringify(state.history.slice(0, 50)));
}

async function api(path, opts = {}) {
  const res = await fetch(state.url + path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'x-api-key': state.key,
      ...(opts.headers || {}),
    },
  });
  let body;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function checkConfig() {
  $('#cfg-status').textContent = 'verificando...';
  $('#cfg-status').className = 'status';
  try {
    const h = await api('/health/ready');
    $('#cfg-status').textContent = `API ok · DB ${h.db} · Ollama ${h.ollama}`;
    $('#cfg-status').className = 'status ok';
  } catch (e) {
    $('#cfg-status').textContent = `API no responde: ${e.message}`;
    $('#cfg-status').className = 'status fail';
  }
  await loadCategorias();
}

async function loadCategorias() {
  try {
    const r = await api('/categorias');
    state.categorias = r.items || [];
  } catch (e) {
    console.warn('no se pudieron cargar categorías:', e);
    state.categorias = [];
  }
}

function renderResultado(r, error) {
  const el = $('#resultado-actual');
  if (error) {
    el.innerHTML = `<div class="error">${escapeHtml(formatError(error))}</div>`;
    return;
  }
  const cat = state.categorias.find((c) => c.id === r.categoria_id);
  el.innerHTML = renderMovCard(
    {
      ...r,
      _categoria_label: cat ? `${cat.slug}` : '—',
    },
    true,
  );
}

function formatError(e) {
  if (typeof e === 'string') return e;
  let msg = e.message || 'error';
  if (e.body) msg += '\n' + JSON.stringify(e.body, null, 2);
  return msg;
}

function renderMovCard(m, expanded = false) {
  const cat = m.categoria || state.categorias.find((c) => c.id === m.categoria_id);
  const fuente = m.fuente ?? 'null';
  const conf = m.confianza !== null && m.confianza !== undefined ? m.confianza.toFixed(2) : '—';
  const flag = m.requiere_revision ? `<span class="flag-revision">requiere revisión</span>` : '';
  return `
    <div class="mov-card ${expanded ? 'open' : ''}" data-id="${m.movimiento_id}">
      <div class="mov-head">
        <span class="id">${m.movimiento_id.slice(0, 8)}</span>
        <span class="desc">${escapeHtml(m._desc || (cat ? cat.nombre : '(sin categoría)'))}</span>
        <span class="fuente fuente-${fuente}">${fuente}</span>
        <span class="confianza">conf ${conf}</span>
        ${flag}
      </div>
      <div class="mov-actions">
        <button data-act="toggle">▼ detalle</button>
        <button data-act="refresh">↻ refrescar</button>
        <button data-act="correct" class="primary">✎ corregir</button>
      </div>
      <div class="mov-body" id="body-${m.movimiento_id}">
        <div class="field"><strong>movimiento_id:</strong> ${m.movimiento_id}</div>
        <div class="field"><strong>categoría:</strong> ${cat ? `${cat.slug} — ${cat.nombre}` : (m.categoria_id ?? '—')}</div>
        <div class="field"><strong>fuente:</strong> ${fuente}</div>
        <div class="field"><strong>confianza:</strong> ${conf}</div>
        <div class="field"><strong>requiere_revision:</strong> ${m.requiere_revision}</div>
        ${m._raw ? `<div class="field"><strong>respuesta API:</strong></div><pre>${escapeHtml(JSON.stringify(m._raw, null, 2))}</pre>` : ''}
      </div>
    </div>`;
}

function renderHistorial() {
  const el = $('#historial');
  if (state.history.length === 0) {
    el.innerHTML = `<div class="empty">No hay movimientos en historial. Categorizá uno arriba.</div>`;
    return;
  }
  el.innerHTML = state.history.map((m) => renderMovCard(m)).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

async function categorizar(payload) {
  const r = await api('/categorizar-movimiento', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const entry = {
    movimiento_id: r.movimiento_id,
    categoria_id: r.categoria_id,
    categoria: r.categoria,
    fuente: r.fuente,
    confianza: r.confianza,
    requiere_revision: r.requiere_revision,
    _desc: payload.descripcion || payload.nombre_comercio || payload.nombre_bancard || `MCC ${payload.mcc}`,
    _raw: r,
    _ts: Date.now(),
  };
  state.history.unshift(entry);
  saveHistory();
  renderResultado(entry);
  renderHistorial();
}

async function refrescarMov(id) {
  try {
    const r = await api(`/movimientos/${id}`);
    const idx = state.history.findIndex((m) => m.movimiento_id === id);
    if (idx >= 0) {
      const cat = r.categoria_confirmada ?? r.categoria_predicha;
      state.history[idx] = {
        ...state.history[idx],
        categoria_id: r.categoria_confirmada_id ?? r.categoria_predicha_id,
        categoria: cat,
        fuente: r.fuente_categoria,
        confianza: r.confianza !== null ? Number(r.confianza) : null,
        requiere_revision: r.requiere_revision,
        _raw: r,
      };
      saveHistory();
      renderHistorial();
    }
  } catch (e) {
    alert(formatError(e));
  }
}

async function refrescarTodos() {
  for (const m of state.history.slice(0, 20)) {
    await refrescarMov(m.movimiento_id);
  }
}

function abrirModalCorreccion(movId) {
  const sel = $('#modal-categoria');
  sel.innerHTML = state.categorias
    .map((c) => `<option value="${c.id}">${c.slug} — ${c.nombre}</option>`)
    .join('');
  $('#modal-mov-info').textContent = `Movimiento ${movId.slice(0, 8)}`;
  $('#modal-motivo').value = '';
  $('#modal-usuario').value = '';
  $('#modal').dataset.movId = movId;
  $('#modal').classList.remove('hidden');
}

async function aplicarCorreccion() {
  const movId = $('#modal').dataset.movId;
  const categoria_id_nueva = $('#modal-categoria').value;
  const motivo = $('#modal-motivo').value || undefined;
  const usuario = $('#modal-usuario').value || undefined;
  try {
    await api(`/movimientos/${movId}/correccion`, {
      method: 'POST',
      body: JSON.stringify({ categoria_id_nueva, motivo, usuario }),
    });
    $('#modal').classList.add('hidden');
    await refrescarMov(movId);
  } catch (e) {
    alert(formatError(e));
  }
}

// Eventos
$('#cfg-save').addEventListener('click', () => {
  state.url = $('#cfg-url').value.trim().replace(/\/+$/, '') || 'http://localhost:3000';
  state.key = $('#cfg-key').value.trim();
  localStorage.setItem(STORAGE.url, state.url);
  localStorage.setItem(STORAGE.key, state.key);
  checkConfig();
});

$('#form-categorizar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {};
  for (const [k, v] of fd.entries()) {
    if (v === '') continue;
    if (k === 'monto') payload[k] = Number(v);
    else payload[k] = v;
  }
  try {
    await categorizar(payload);
  } catch (err) {
    renderResultado(null, err);
  }
});

$('#btn-clear').addEventListener('click', () => {
  $('#form-categorizar').reset();
  $('#resultado-actual').innerHTML = '';
});

$('#btn-refresh').addEventListener('click', () => refrescarTodos());

$('#btn-clear-history').addEventListener('click', () => {
  if (!confirm('¿Limpiar historial local? (no afecta la base de datos)')) return;
  state.history = [];
  saveHistory();
  renderHistorial();
});

document.querySelectorAll('[data-ej]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const ej = EJEMPLOS[btn.dataset.ej];
    if (!ej) return;
    const form = $('#form-categorizar');
    form.reset();
    for (const [k, v] of Object.entries(ej)) {
      const input = form.elements[k];
      if (input) input.value = v;
    }
  });
});

$('#historial').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.mov-card');
  const id = card?.dataset.id;
  if (!id) return;
  if (btn.dataset.act === 'toggle') card.classList.toggle('open');
  else if (btn.dataset.act === 'refresh') refrescarMov(id);
  else if (btn.dataset.act === 'correct') abrirModalCorreccion(id);
});

$('#resultado-actual').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.mov-card');
  const id = card?.dataset.id;
  if (!id) return;
  if (btn.dataset.act === 'refresh') refrescarMov(id);
  else if (btn.dataset.act === 'correct') abrirModalCorreccion(id);
  else if (btn.dataset.act === 'toggle') card.classList.toggle('open');
});

$('#modal-cancel').addEventListener('click', () => $('#modal').classList.add('hidden'));
$('#modal-submit').addEventListener('click', aplicarCorreccion);
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') $('#modal').classList.add('hidden');
});

// init
$('#cfg-url').value = state.url;
$('#cfg-key').value = state.key;
renderHistorial();
checkConfig();
