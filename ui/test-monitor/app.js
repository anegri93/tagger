const $ = (id) => document.getElementById(id);
const LS = 'tagger-test-monitor-v3';

const state = {
  batchId: '',
  limit: '',
  concurrency: 30,
  paused: true,
  intervalId: null,
  pollMs: 2000,
};

function loadCfg() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch {}
  $('batch-id').value = state.batchId;
  $('limit').value = state.limit ?? '';
  $('concurrency').value = state.concurrency ?? 30;
}

function saveCfg() {
  localStorage.setItem(
    LS,
    JSON.stringify({
      batchId: state.batchId,
      limit: state.limit,
      concurrency: state.concurrency,
    }),
  );
}

function syncFromUI() {
  state.batchId = $('batch-id').value.trim();
  state.limit = $('limit').value.trim();
  state.concurrency = Number($('concurrency').value) || 30;
  saveCfg();
}

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `t-small ${cls === 'live' ? '' : 't-muted'}`;
}

const api = window.taggerApi;

async function startRun() {
  syncFromUI();
  if (!state.batchId) {
    alert('falta batch_id');
    return;
  }
  const payload = { batch_id: state.batchId, concurrency: state.concurrency };
  if (state.limit) payload.limit = Number(state.limit);
  if ($('bypass-cat').checked) payload.bypass_catalogo = true;
  const src = $('sel-source')?.value || 'tsv';
  if (src !== 'tsv') payload.source = src;
  try {
    setStatus('starting…', 'live');
    await api('/test-batch/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.paused = false;
    startPolling();
    setStatus('running', 'live');
  } catch (e) {
    setStatus(`error: ${e.message}`, 'error');
  }
}

async function stopRun() {
  syncFromUI();
  if (!state.batchId) return;
  try {
    await api('/test-batch/stop', {
      method: 'POST',
      body: JSON.stringify({ batch_id: state.batchId }),
    });
    setStatus('cancelling…');
  } catch (e) {
    setStatus(`error: ${e.message}`, 'error');
  }
}

function monitorOnly() {
  syncFromUI();
  if (!state.batchId) {
    alert('falta batch_id');
    return;
  }
  state.paused = false;
  startPolling();
}

function togglePause() {
  state.paused = !state.paused;
  if (state.paused) {
    setStatus('paused');
  } else {
    setStatus('live', 'live');
    tick();
  }
}

function startPolling() {
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = setInterval(tick, state.pollMs);
  tick();
}

async function tick() {
  if (state.paused) return;
  if (!state.batchId) {
    setStatus('falta batch_id', 'error');
    return;
  }
  try {
    const [stats, list] = await Promise.all([
      api(`/test-batch/${encodeURIComponent(state.batchId)}/stats`),
      api(`/test-batch/list`).catch(() => ({ items: [] })),
    ]);
    render(stats);
    renderRunner(list.items ?? [], stats.total);
    setStatus(`live (${new Date().toLocaleTimeString()})`, 'live');
  } catch (e) {
    setStatus(`error: ${e.message}`, 'error');
  }
}

function renderRunner(items, dbTotal) {
  const mine = items.find((i) => i.batchId === state.batchId);
  if (!mine) {
    $('runner-row').style.display = 'none';
    return;
  }
  $('runner-row').style.display = 'flex';
  const st = $('rs-status');
  st.textContent = mine.status;
  st.className = `rs-status-${mine.status}`;
  $('rs-processed').textContent = `${mine.processed} / ${mine.total}`;
  $('rs-ok').textContent = mine.ok;
  $('rs-errors').textContent = mine.errors;
  $('rs-limit').textContent = mine.limit ?? '—';
  $('rs-conc').textContent = mine.concurrency;

  // Auto-poll faster while running
  const targetMs = mine.status === 'running' ? 1000 : 3000;
  if (state.pollMs !== targetMs) {
    state.pollMs = targetMs;
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = setInterval(tick, state.pollMs);
    }
  }
  void dbTotal;
}

function render(stats) {
  const target = stats.total;

  $('kpi-total').textContent = stats.total.toLocaleString();
  $('kpi-progress-text').textContent = `${stats.total.toLocaleString()} en DB`;
  const list = state.lastList || [];
  const mine = list.find?.((i) => i.batchId === state.batchId);
  const goal = mine?.total || target;
  $('kpi-bar').style.width = `${Math.min(100, (100 * stats.total) / Math.max(1, goal))}%`;

  $('kpi-rps').textContent = stats.throughput_rps_total.toFixed(1);
  $('kpi-elapsed').textContent = `elapsed ${fmtMs(stats.elapsed_ms)}`;
  $('kpi-eta').textContent =
    stats.throughput_rps_total > 0 && goal > stats.total
      ? `ETA ${fmtMs(((goal - stats.total) / stats.throughput_rps_total) * 1000)}`
      : 'ETA —';

  $('kpi-cobertura').textContent = stats.cobertura.sync_ok_pct.toFixed(1);
  $('kpi-cobertura-detail').textContent = `sync ${stats.cobertura.sync_ok} • rev ${stats.cobertura.revision} • sin ${stats.cobertura.sin_categoria}`;

  $('kpi-agreement').textContent = stats.agreement.pct.toFixed(2);
  const modoLabel = {
    cascada_pura: '🧪 cascada pura (bypass)',
    con_catalogo: '⚠️ con catálogo (tautológico)',
    mixto: '🌀 mixto',
    sin_datos: '—',
  }[stats.modo] || '—';
  $('kpi-agreement-detail').textContent = `${modoLabel} • match ${stats.agreement.match} • mismatch ${stats.agreement.mismatch} • sin_cat ${stats.agreement.sin_catalogo}`;

  const l = stats.latencia;
  $('lat-min').textContent = l.min ?? '—';
  $('lat-p50').textContent = l.p50 ?? '—';
  $('lat-p95').textContent = l.p95 ?? '—';
  $('lat-p99').textContent = l.p99 ?? '—';
  $('lat-max').textContent = l.max ?? '—';
  $('lat-avg').textContent = l.avg ?? '—';

  renderBars($('lat-hist'), stats.latencia_histograma, 'bucket', 'count');
  renderBars($('fuente-bars'), stats.fuente, 'fuente', 'count', 'pct', 'fuente');
  renderBars($('confianza-bars'), stats.confianza_buckets, 'bucket', 'count');

  const tbody = $('top-cats').querySelector('tbody');
  tbody.innerHTML = stats.top_categorias
    .map((r) => `<tr><td>${esc(r.slug)}</td><td>${esc(r.nombre)}</td><td>${r.count}</td></tr>`)
    .join('');

  const mtbody = $('mismatches').querySelector('tbody');
  mtbody.innerHTML = stats.mismatches_recientes
    .map(
      (m) => `<tr>
      <td>${esc(m.nombre_bancard)}</td>
      <td>${esc(m.bancard_id)}</td>
      <td>${esc(m.codigo_comercio)}</td>
      <td><span class="tag tag-${m.runtime_fuente ?? 'NULL'}">${esc(m.runtime_fuente)}</span></td>
      <td>${esc(m.runtime_categoria)}</td>
      <td><span class="tag tag-${m.catalogo_fuente ?? 'NULL'}">${esc(m.catalogo_fuente)}</span></td>
      <td>${esc(m.catalogo_categoria)}</td>
    </tr>`,
    )
    .join('');

  const rtbody = $('recientes').querySelector('tbody');
  rtbody.innerHTML = stats.recientes
    .map((r) => {
      const t = new Date(r.created_at);
      const hh = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
      return `<tr>
        <td>${hh}</td>
        <td>${esc(r.nombre_bancard)}</td>
        <td><span class="tag tag-${r.fuente ?? 'NULL'}">${esc(r.fuente)}</span></td>
        <td>${r.confianza?.toFixed(2) ?? '—'}</td>
        <td>${esc(r.categoria_slug)}</td>
        <td><span class="tag tag-rev-${r.requiere_revision}">${r.requiere_revision ? 'sí' : 'no'}</span></td>
        <td>${r.latency_ms ?? '—'}ms</td>
      </tr>`;
    })
    .join('');
}

function renderBars(container, items, labelKey, valueKey, pctKey, fuenteClass) {
  const max = Math.max(...items.map((i) => i[valueKey]), 1);
  container.innerHTML = items
    .map((i) => {
      const w = (100 * i[valueKey]) / max;
      const cls = fuenteClass ? `fuente-${i[fuenteClass]}` : '';
      const pct = pctKey && i[pctKey] != null ? ` (${i[pctKey].toFixed(1)}%)` : '';
      return `<div class="bar-row ${cls}">
        <div class="label">${esc(i[labelKey])}</div>
        <div class="track"><div class="fill" style="width:${w}%"></div></div>
        <div class="value">${i[valueKey].toLocaleString()}${pct}</div>
      </div>`;
    })
    .join('');
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}m ${ss}s`;
}

function esc(s) {
  if (s == null) return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

$('btn-run').addEventListener('click', startRun);
$('btn-stop').addEventListener('click', stopRun);
$('btn-monitor').addEventListener('click', monitorOnly);
$('btn-pause').addEventListener('click', togglePause);

async function cargarDatasetsSource() {
  try {
    const r = await api('/datasets');
    const sel = $('sel-source');
    if (!sel) return;
    for (const ds of r.items || []) {
      const opt = document.createElement('option');
      opt.value = `datasets:${ds.slug}`;
      opt.textContent = `dataset: ${ds.nombre} (${ds.total})`;
      sel.appendChild(opt);
    }
  } catch (e) {
    console.warn('no pude cargar datasets', e);
  }
}
cargarDatasetsSource();
loadCfg();
