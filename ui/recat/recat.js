const $ = (s) => document.querySelector(s);

let pollTimer = null;

function setStatus(t) {
  $('#status').textContent = t;
}

function fmt(v) {
  return v == null ? '—' : v;
}

function renderRun(run) {
  if (!run) {
    $('#r-estado').textContent = '—';
    return;
  }
  $('#r-estado').textContent = run.estado + (run.error ? ` (${run.error})` : '');
  $('#r-runid').textContent = run.runId;
  $('#r-start').textContent = run.startedAt;
  $('#r-end').textContent = fmt(run.finishedAt);
  $('#r-total').textContent = run.stats.total;
  $('#r-proc').textContent = run.stats.procesados;
  $('#r-match').textContent = run.stats.match;
  $('#r-diff').textContent = run.stats.diff;
  $('#r-sin').textContent = run.stats.sinCategoria;
}

function renderComparacion(c) {
  $('#c-total').textContent = c.total;
  $('#c-recat').textContent = c.recategorizados;
  $('#c-match').textContent = c.match;
  $('#c-diff').textContent = c.diff;
  $('#c-sin').textContent = c.sin_categoria;
  // index patrones_por_diff por par actual|nueva
  const patronesIdx = {};
  for (const p of c.patrones_por_diff || []) {
    const k = `${p.actual}|${p.nueva}`;
    (patronesIdx[k] = patronesIdx[k] || []).push(p);
  }
  $('#tbl-diffs tbody').innerHTML = (c.top_diffs || [])
    .map((r) => {
      const k = `${r.actual}|${r.nueva}`;
      const pats = (patronesIdx[k] || []).slice(0, 5);
      const patrRows = pats
        .map(
          (p) => `<tr class="patron-row">
            <td class="t-small"><code>${esc(p.patron)}</code></td>
            <td class="t-small t-muted">${esc(p.fuente ?? '—')}</td>
            <td class="num">${p.n}</td>
            <td>
              <button class="btn btn-aplicar-patron" data-actual="${esc(r.actual)}" data-nueva="${esc(r.nueva)}" data-patron="${esc(p.patron)}" data-n="${p.n}">Aplicar (${p.n})</button>
              <button class="btn btn-crear-patron" data-actual="${esc(r.actual)}" data-nueva="${esc(r.nueva)}" data-patron="${esc(p.patron)}">+ Patrón formal</button>
            </td>
          </tr>`,
        )
        .join('');
      return `<tr class="diff-row" data-actual="${r.actual}" data-nueva="${r.nueva}">
          <td>${r.actual}</td>
          <td>${r.nueva}</td>
          <td>${r.n}</td>
          <td>
            <button class="btn btn-ver" data-actual="${r.actual}" data-nueva="${r.nueva}">Ver</button>
            <button class="btn btn-aplicar" data-actual="${r.actual}" data-nueva="${r.nueva}" data-n="${r.n}">Aplicar ${r.n}</button>
          </td>
        </tr>
        ${pats.length > 0 ? `<tr class="patrones-resumen"><td colspan="4"><table class="tbl-inline"><thead><tr><th>Patrón</th><th>Fuente</th><th>Count</th><th>Acciones</th></tr></thead><tbody>${patrRows}</tbody></table></td></tr>` : ''}
        <tr class="diff-detalle" data-actual="${r.actual}" data-nueva="${r.nueva}" style="display:none">
          <td colspan="4"><div class="detalle-content t-small t-muted">cargando…</div></td>
        </tr>`;
    })
    .join('');
  $('#tbl-fuente tbody').innerHTML = (c.por_fuente_nueva || [])
    .map((r) => `<tr><td>${r.fuente_nueva}</td><td>${r.n}</td></tr>`)
    .join('');
}

async function loadStatus() {
  try {
    const { run } = await window.taggerApi('/catalogo/recategorizar/status');
    renderRun(run);
    if (run && run.estado === 'running') {
      schedulePoll();
    } else {
      stopPoll();
      await loadComparacion();
    }
  } catch (e) {
    setStatus(`error status: ${e.message}`);
  }
}

async function loadComparacion() {
  try {
    const c = await window.taggerApi('/catalogo/recategorizar/comparacion');
    renderComparacion(c);
    setStatus('live');
  } catch (e) {
    setStatus(`error comparacion: ${e.message}`);
  }
  loadTokens();
}

function esc(s) {
  if (s == null) return '—';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadTokens() {
  try {
    const r = await window.taggerApi('/catalogo/tokens-sin-categoria?limit=50');
    const tbody = $('#tbl-tokens tbody');
    tbody.innerHTML = (r.items || [])
      .map(
        (t) => `<tr>
          <td><code>${esc(t.token)}</code></td>
          <td>${t.freq}</td>
          <td class="t-small t-muted">${(t.ejemplos || []).map(esc).join(' · ')}</td>
          <td><button class="btn-token" data-token="${esc(t.token)}">+ Patrón</button></td>
        </tr>`,
      )
      .join('');
  } catch (e) {
    /* silencioso */
    void e;
  }
}

let categoriasCache = null;
async function getCategorias() {
  if (categoriasCache) return categoriasCache;
  const r = await window.taggerApi('/categorias');
  categoriasCache = r.items || [];
  return categoriasCache;
}

async function abrirModal(token) {
  const cats = await getCategorias();
  const sel = $('#m-categoria');
  sel.innerHTML = cats
    .map((c) => `<option value="${c.slug}">${c.nombre} (${c.slug})</option>`)
    .join('');
  $('#m-valor').value = token;
  $('#m-tipo').value = 'contiene';
  $('#m-prio').value = '20';
  $('#m-desc').value = '';
  $('#m-error').style.display = 'none';
  $('#modal-bg').style.display = 'flex';
  $('#m-categoria').focus();
}

function cerrarModal() {
  $('#modal-bg').style.display = 'none';
}

$('#modal-close').addEventListener('click', cerrarModal);
$('#modal-cancel').addEventListener('click', cerrarModal);
$('#modal-bg').addEventListener('click', (e) => {
  if (e.target.id === 'modal-bg') cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#modal-bg').style.display === 'flex') cerrarModal();
});

$('#modal-save').addEventListener('click', async () => {
  const tipo = $('#m-tipo').value;
  const valor = $('#m-valor').value.trim();
  const categoria_slug = $('#m-categoria').value;
  const prioridad = Number($('#m-prio').value) || 100;
  const descripcion = $('#m-desc').value.trim() || undefined;
  if (!valor || !categoria_slug) {
    $('#m-error').textContent = 'falta valor o categoría';
    $('#m-error').style.display = 'block';
    return;
  }
  try {
    await window.taggerApi('/patrones', {
      method: 'POST',
      body: JSON.stringify({ tipo, valor, categoria_slug, prioridad, descripcion }),
    });
    cerrarModal();
    setStatus(`patrón creado: ${tipo} "${valor}" → ${categoria_slug}`);
    await loadTokens();
  } catch (e) {
    $('#m-error').textContent = e.message;
    $('#m-error').style.display = 'block';
  }
});

document.addEventListener('click', async (e) => {
  const tokenBtn = e.target.closest('.btn-token');
  if (tokenBtn) {
    abrirModal(tokenBtn.dataset.token);
    return;
  }
  const verBtn = e.target.closest('.btn-ver');
  if (verBtn) {
    const { actual, nueva } = verBtn.dataset;
    const detalleRow = document.querySelector(
      `tr.diff-detalle[data-actual="${actual}"][data-nueva="${nueva}"]`,
    );
    if (!detalleRow) return;
    if (detalleRow.style.display === 'none') {
      detalleRow.style.display = '';
      const cont = detalleRow.querySelector('.detalle-content');
      cont.textContent = 'cargando…';
      try {
        const r = await window.taggerApi(
          `/catalogo/recategorizar/diff-detalle?actual=${encodeURIComponent(actual)}&nueva=${encodeURIComponent(nueva)}&limit=100`,
        );
        if (!r.items.length) {
          cont.textContent = 'sin filas';
        } else {
          cont.innerHTML = `
            <div style="margin:6px 0">${r.items.length} comercios (limit ${r.limit}):</div>
            <table class="tbl">
              <thead><tr><th>Nombre</th><th>Fuente nueva</th><th>Conf</th><th>Acción</th></tr></thead>
              <tbody>
                ${r.items
                  .map(
                    (it) => `<tr data-id="${it.id}">
                      <td>${esc(it.nombre)}</td>
                      <td>${esc(it.fuente_nueva)}</td>
                      <td>${esc(it.confianza_nueva)}</td>
                      <td>
                        <button class="btn btn-decidir" data-id="${it.id}" data-decision="aplicar">Aplicar</button>
                        <button class="btn btn-decidir" data-id="${it.id}" data-decision="mantener">Mantener</button>
                      </td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`;
        }
      } catch (err) {
        cont.textContent = `error: ${err.message}`;
      }
    } else {
      detalleRow.style.display = 'none';
    }
    return;
  }
  const decidirBtn = e.target.closest('.btn-decidir');
  if (decidirBtn) {
    e.stopPropagation();
    const { id, decision } = decidirBtn.dataset;
    const tr = decidirBtn.closest('tr');
    const detalleRow = tr?.closest('.diff-detalle');
    const actual = detalleRow?.dataset.actual;
    const nueva = detalleRow?.dataset.nueva;
    try {
      await window.taggerApi(`/catalogo/comercios/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      if (tr) tr.remove();
      if (detalleRow && actual && nueva) {
        const restantes = detalleRow.querySelectorAll('tbody tr').length;
        const headerDiv = detalleRow.querySelector('.detalle-content > div');
        if (headerDiv) headerDiv.textContent = `${restantes} comercios pendientes:`;
        const padre = document.querySelector(
          `tr.diff-row[data-actual="${actual}"][data-nueva="${nueva}"]`,
        );
        const btnAp = padre?.querySelector('.btn-aplicar');
        if (btnAp) {
          btnAp.dataset.n = restantes;
          btnAp.textContent = `Aplicar ${restantes}`;
        }
        if (padre) {
          const cant = padre.querySelector('td:nth-child(3)');
          if (cant) cant.textContent = restantes;
        }
        // NO cerrar el detalle aunque restantes=0; usuario decide cuando cerrar.
      }
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  const aplicarPatronBtn = e.target.closest('.btn-aplicar-patron');
  if (aplicarPatronBtn) {
    const { actual, nueva, patron, n } = aplicarPatronBtn.dataset;
    if (!confirm(`Aplicar patrón "${patron}" → ${actual} a ${nueva} (${n} comercios)?`)) return;
    try {
      const r = await window.taggerApi('/catalogo/aplicar-diff-patron', {
        method: 'POST',
        body: JSON.stringify({
          categoria_actual_slug: actual,
          categoria_nueva_slug: nueva,
          patron,
        }),
      });
      setStatus(`aplicadas: ${r.actualizadas}`);
      await loadComparacion();
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  const crearPatronBtn = e.target.closest('.btn-crear-patron');
  if (crearPatronBtn) {
    const { nueva, patron } = crearPatronBtn.dataset;
    const sugerido = prompt(
      `Crear patrón formal pa categoría '${nueva}'.\nValor (regex):`,
      patron,
    );
    if (!sugerido) return;
    try {
      await window.taggerApi('/patrones', {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'regex',
          valor: sugerido,
          categoria_slug: nueva,
          prioridad: 30,
          fuente: 'manual',
        }),
      });
      setStatus(`patrón creado pa ${nueva}`);
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  const aplicarBtn = e.target.closest('.btn-aplicar');
  if (aplicarBtn) {
    const { actual, nueva, n } = aplicarBtn.dataset;
    if (!confirm(`Aplicar diff: ${actual} → ${nueva} a ${n} comercios?`)) return;
    try {
      const r = await window.taggerApi('/catalogo/aplicar-diff', {
        method: 'POST',
        body: JSON.stringify({
          categoria_actual_slug: actual,
          categoria_nueva_slug: nueva,
        }),
      });
      setStatus(`aplicadas: ${r.actualizadas}`);
      await loadComparacion();
    } catch (err) {
      alert(err.message);
    }
  }
});

function schedulePoll() {
  if (pollTimer) return;
  pollTimer = setInterval(loadStatus, 2000);
}
function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

$('#btn-run').addEventListener('click', async () => {
  try {
    const r = await window.taggerApi('/catalogo/recategorizar', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setStatus(`run iniciado ${r.run_id}`);
    schedulePoll();
    loadStatus();
  } catch (e) {
    if (e.body && e.body.error === 'run_en_progreso') {
      setStatus(`ya hay un run corriendo: ${e.body.run_id}`);
      schedulePoll();
    } else {
      alert(e.message);
    }
  }
});

$('#btn-refresh').addEventListener('click', () => loadComparacion());

$('#sg-gen').addEventListener('click', async () => {
  const params = new URLSearchParams({
    freq_min: $('#sg-freq').value,
    pureza_min: $('#sg-pureza').value,
    longitud_min: $('#sg-long').value,
    impacto_min: $('#sg-imp').value,
  });
  $('#sg-status').textContent = 'generando…';
  try {
    const r = await window.taggerApi(`/patrones/sugerencias?${params}`);
    renderSugeridos(r.items || []);
    $('#sg-status').textContent = `${r.items.length} sugerencias`;
  } catch (e) {
    $('#sg-status').textContent = `error: ${e.message}`;
  }
});

function renderSugeridos(items) {
  const tbody = $('#tbl-sugeridos tbody');
  tbody.innerHTML = items
    .map(
      (s, i) => `<tr data-idx="${i}">
        <td><input type="checkbox" class="sg-chk" checked /></td>
        <td><code>${esc(s.token)}</code></td>
        <td>${s.tipo}</td>
        <td>${esc(s.categoriaSlug)}</td>
        <td>${(s.pureza * 100).toFixed(0)}%</td>
        <td>${s.freqSeed}</td>
        <td>${s.impactoSinCat}</td>
      </tr>`,
    )
    .join('');
  // guardar items en data
  $('#tbl-sugeridos').dataset.items = JSON.stringify(items);
}

$('#sg-toggle-all').addEventListener('change', (e) => {
  document
    .querySelectorAll('.sg-chk')
    .forEach((c) => (c.checked = e.target.checked));
});

// Sugerencias IA
let iaPollTimer = null;

$('#ia-run').addEventListener('click', async () => {
  try {
    const r = await window.taggerApi('/patrones/sugerencias-ia/run', {
      method: 'POST',
      body: JSON.stringify({
        lote_size: Number($('#ia-lote').value),
        confianza_min: Number($('#ia-conf').value),
      }),
    });
    $('#ia-status').textContent = `run iniciado ${r.run_id}`;
    iniciarPollIa();
  } catch (e) {
    if (e.body && e.body.error === 'run_en_progreso') {
      $('#ia-status').textContent = `ya hay un run corriendo`;
      iniciarPollIa();
    } else {
      alert(e.message);
    }
  }
});

function iniciarPollIa() {
  if (iaPollTimer) return;
  iaPollTimer = setInterval(pollIa, 3000);
  pollIa();
}

async function pollIa() {
  try {
    const { run } = await window.taggerApi('/patrones/sugerencias-ia/status');
    if (!run) return;
    $('#ia-status').textContent = `${run.estado}${run.error ? ' — ' + run.error : ''}`;
    if (run.estado !== 'running') {
      clearInterval(iaPollTimer);
      iaPollTimer = null;
      renderIa(run.sugerencias || []);
    }
  } catch {
    /* silencioso */
  }
}

function renderIa(items) {
  const tbody = $('#tbl-ia tbody');
  tbody.innerHTML = items
    .map(
      (s, i) => `<tr data-idx="${i}">
        <td><input type="checkbox" class="ia-chk" checked /></td>
        <td><code>${esc(s.token)}</code></td>
        <td>${s.tipo}</td>
        <td>${esc(s.categoriaSlug)}</td>
        <td>${(s.confianza * 100).toFixed(0)}%</td>
        <td class="t-small t-muted">${(s.ejemplos || []).slice(0, 3).map(esc).join(' · ')}</td>
        <td class="t-small t-muted">${esc(s.razonamiento || '')}</td>
      </tr>`,
    )
    .join('');
  $('#tbl-ia').dataset.items = JSON.stringify(items);
}

$('#ia-toggle-all').addEventListener('change', (e) => {
  document.querySelectorAll('.ia-chk').forEach((c) => (c.checked = e.target.checked));
});

$('#ia-aplicar').addEventListener('click', async () => {
  const items = JSON.parse($('#tbl-ia').dataset.items || '[]');
  const seleccionados = [];
  document.querySelectorAll('#tbl-ia tbody tr').forEach((tr) => {
    const chk = tr.querySelector('.ia-chk');
    if (chk?.checked) {
      const idx = Number(tr.dataset.idx);
      const it = items[idx];
      seleccionados.push({
        tipo: it.tipo,
        valor: it.valor,
        categoria_slug: it.categoriaSlug,
        prioridad: 35,
      });
    }
  });
  if (!seleccionados.length) {
    alert('seleccioná al menos uno');
    return;
  }
  if (!confirm(`Crear ${seleccionados.length} patrones IA?`)) return;
  try {
    const r = await window.taggerApi('/patrones/sugerencias-ia/aplicar', {
      method: 'POST',
      body: JSON.stringify({ items: seleccionados }),
    });
    $('#ia-status').textContent = `creados: ${r.creados} | errores: ${r.errores.length}`;
  } catch (e) {
    alert(e.message);
  }
});

$('#sg-aplicar').addEventListener('click', async () => {
  const items = JSON.parse($('#tbl-sugeridos').dataset.items || '[]');
  const seleccionados = [];
  document.querySelectorAll('#tbl-sugeridos tbody tr').forEach((tr) => {
    const chk = tr.querySelector('.sg-chk');
    if (chk?.checked) {
      const idx = Number(tr.dataset.idx);
      const it = items[idx];
      seleccionados.push({
        tipo: it.tipo,
        valor: it.valor,
        categoria_slug: it.categoriaSlug,
        prioridad: 35,
      });
    }
  });
  if (!seleccionados.length) {
    alert('seleccioná al menos uno');
    return;
  }
  if (!confirm(`Crear ${seleccionados.length} patrones?`)) return;
  try {
    const r = await window.taggerApi('/patrones/sugerencias/aplicar', {
      method: 'POST',
      body: JSON.stringify({ items: seleccionados }),
    });
    $('#sg-status').textContent = `creados: ${r.creados} | errores: ${r.errores.length}`;
    if (r.errores.length) console.warn('errores:', r.errores);
    // refrescar tabla
    $('#sg-gen').click();
  } catch (e) {
    alert(e.message);
  }
});

loadStatus();
