const $ = (sel) => document.querySelector(sel);

let state = { data: null, statusFilter: '', phaseFilter: '', lastSig: '' };
const POLL_MS = 2000;

function reloadScript() {
  return new Promise((done, fail) => {
    const old = document.getElementById('tasks-data-script');
    if (old) old.remove();
    const s = document.createElement('script');
    s.id = 'tasks-data-script';
    s.src = './tasks.data.js?v=' + Date.now();
    s.onload = () => done();
    s.onerror = fail;
    document.head.appendChild(s);
  });
}

async function load() {
  if (window.__TASKS__) {
    state.data = window.__TASKS__;
    render();
    return;
  }
  try {
    const res = await fetch('../tasks.json?ts=' + Date.now());
    state.data = await res.json();
    render();
  } catch {
    document.body.innerHTML =
      '<pre style="padding:24px;color:#f85149">No se pudo cargar tasks.json. ' +
      'Corre: <code>node scripts/sync-tasks.mjs</code> y recarga.</pre>';
  }
}

async function poll() {
  try {
    await reloadScript();
    const data = window.__TASKS__;
    if (!data) return;
    const sig = JSON.stringify(
      data.phases.flatMap((p) =>
        p.tasks.map((t) => `${t.id}:${t.status}:${JSON.stringify(t.gates_progress ?? {})}`),
      ),
    );
    if (sig !== state.lastSig) {
      state.lastSig = sig;
      state.data = data;
      render();
    }
  } catch {
    /* ignore */
  }
}

function render() {
  const { data, statusFilter, phaseFilter } = state;
  $('#desc').textContent = data.meta.description;

  const all = data.phases.flatMap((p) => p.tasks);
  const done = all.filter((t) => t.status === 'done').length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  $('#progress-bar').style.width = pct + '%';
  $('#progress-label').textContent = `${done}/${all.length} (${pct}%)`;

  const phaseSel = $('#filter-phase');
  if (phaseSel.options.length <= 1) {
    for (const p of data.phases) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.id} — ${p.name}`;
      phaseSel.appendChild(opt);
    }
  }

  const main = $('#phases');
  const openIds = new Set(
    [...main.querySelectorAll('.task.open')].map((el) => el.dataset.id),
  );
  main.innerHTML = '';
  for (const phase of data.phases) {
    if (phaseFilter && phase.id !== phaseFilter) continue;
    const tasks = phase.tasks.filter((t) => !statusFilter || t.status === statusFilter);
    if (!tasks.length) continue;
    const pDone = phase.tasks.filter((t) => t.status === 'done').length;

    const sec = document.createElement('section');
    sec.className = 'phase';
    const validated = phase.validated
      ? `<span class="validated" title="Fase validada">✓ validada</span>`
      : '';
    sec.innerHTML = `
      <div class="phase-header">
        <h2>${phase.id} — ${phase.name} ${validated}</h2>
        <span class="stats">${pDone}/${phase.tasks.length}</span>
      </div>`;
    for (const t of tasks) {
      const el = renderTask(t);
      if (openIds.has(t.id)) el.classList.add('open');
      sec.appendChild(el);
    }
    main.appendChild(sec);
  }
}

function renderTask(t) {
  const div = document.createElement('div');
  div.className = 'task';
  div.dataset.id = t.id;
  const deps = t.depends_on?.length ? `← ${t.depends_on.join(', ')}` : '';
  const gp = t.gates_progress ?? {};
  const gateBadge = (name) => {
    const s = gp[name] ?? (t.status === 'done' ? 'pass' : 'pending');
    return `<span class="gate gate-${s}" title="${s}">${name}</span>`;
  };
  div.innerHTML = `
    <div class="task-head">
      <span class="status ${t.status}" title="${t.status}"></span>
      <span class="id">${t.id}</span>
      <span class="title">${escapeHtml(t.title)}</span>
      <span class="deps">${deps}</span>
    </div>
    <div class="task-body">
      <h4>Detalle</h4>
      <ul>${t.detail.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
      ${t.files?.length ? `<h4>Archivos</h4><ul>${t.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>` : ''}
      <div class="gates">
        ${gateBadge('consistency')}
        ${gateBadge('lint')}
        ${gateBadge('test')}
      </div>
    </div>`;
  div.querySelector('.task-head').addEventListener('click', () => div.classList.toggle('open'));
  return div;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

$('#filter-status').addEventListener('change', (e) => {
  state.statusFilter = e.target.value;
  render();
});
$('#filter-phase').addEventListener('change', (e) => {
  state.phaseFilter = e.target.value;
  render();
});
$('#reload').addEventListener('click', () => poll());

load();
setInterval(poll, POLL_MS);
