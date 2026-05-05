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
  $('#tbl-diffs tbody').innerHTML = (c.top_diffs || [])
    .map(
      (r) =>
        `<tr class="diff-row" data-actual="${r.actual}" data-nueva="${r.nueva}">
          <td>${r.actual}</td>
          <td>${r.nueva}</td>
          <td>${r.n}</td>
          <td>
            <button class="btn btn-ver" data-actual="${r.actual}" data-nueva="${r.nueva}">Ver</button>
            <button class="btn btn-aplicar" data-actual="${r.actual}" data-nueva="${r.nueva}" data-n="${r.n}">Aplicar ${r.n}</button>
          </td>
        </tr>
        <tr class="diff-detalle" data-actual="${r.actual}" data-nueva="${r.nueva}" style="display:none">
          <td colspan="4"><div class="detalle-content t-small t-muted">cargando…</div></td>
        </tr>`,
    )
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
    const { id, decision } = decidirBtn.dataset;
    try {
      await window.taggerApi(`/catalogo/comercios/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      const tr = decidirBtn.closest('tr');
      const detalleRow = tr?.closest('.diff-detalle');
      if (tr) tr.remove();
      // actualizar contador en cabecera del detalle + botón "Aplicar N" del diff padre
      if (detalleRow) {
        const actual = detalleRow.dataset.actual;
        const nueva = detalleRow.dataset.nueva;
        const restantes = detalleRow.querySelectorAll('tbody tr').length;
        const headerDiv = detalleRow.querySelector('div');
        if (headerDiv) headerDiv.textContent = `${restantes} comercios pendientes:`;
        // actualizar botón Aplicar N en la fila padre
        const padre = document.querySelector(
          `tr.diff-row[data-actual="${actual}"][data-nueva="${nueva}"]`,
        );
        const btnAp = padre?.querySelector('.btn-aplicar');
        const btnVer = padre?.querySelector('.btn-ver');
        if (btnAp) {
          btnAp.dataset.n = restantes;
          btnAp.textContent = `Aplicar ${restantes}`;
        }
        if (padre) {
          const cant = padre.querySelector('td:nth-child(3)');
          if (cant) cant.textContent = restantes;
        }
        if (restantes === 0) {
          padre?.remove();
          detalleRow.remove();
          if (btnVer) btnVer.remove();
        }
      }
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

loadStatus();
