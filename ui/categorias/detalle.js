const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const params = new URLSearchParams(window.location.search);
const SLUG = params.get('slug');
if (!SLUG) {
  alert('falta ?slug=X');
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
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Tabs
$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('.tab-content').forEach((x) =>
      x.classList.toggle('active', x.dataset.tab === t.dataset.tab),
    );
    if (t.dataset.tab === 'reglas') loadReglas();
    if (t.dataset.tab === 'mcc') loadMcc();
    if (t.dataset.tab === 'marcas') loadMarcas();
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
    $('#info-usage').textContent = `Movimientos: ${u.movimientos} | Reglas: ${u.reglas} | MCCs: ${u.mcc} | Comercios: ${u.comercios}`;
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
  } catch (e) {
    alert(e.message);
  }
});

$('#btn-delete-cat').addEventListener('click', async () => {
  try {
    await window.taggerApi(`/categorias/${encodeURIComponent(SLUG)}`, { method: 'DELETE' });
    window.location.href = 'index.html';
  } catch (e) {
    if (e.body?.usage)
      alert(`No se puede eliminar: tiene refs ${JSON.stringify(e.body.usage)}`);
    else alert(e.message);
  }
});

// Reglas
async function loadReglas() {
  try {
    const { items } = await window.taggerApi(`/reglas?categoria=${encodeURIComponent(SLUG)}`);
    const tbody = $('#reglas-tbl tbody');
    tbody.innerHTML = items
      .map(
        (r) => `<tr data-id="${r.id}">
          <td><code>${esc(r.patron)}</code></td>
          <td>${r.prioridad}</td>
          <td>${r.activo ? '✓' : '✗'}</td>
          <td>${esc(r.descripcion)}</td>
          <td>
            <button class="action-btn" data-act="toggle" data-id="${r.id}" data-activo="${r.activo}">${r.activo ? 'Desact' : 'Act'}</button>
            <button class="action-btn delete" data-act="del" data-id="${r.id}">Eliminar</button>
          </td>
        </tr>`,
      )
      .join('');
  } catch (e) {
    setStatus(`error reglas: ${e.message}`, 'error');
  }
}

$('#r-add').addEventListener('click', async () => {
  const patron = $('#r-patron').value.trim();
  const prioridad = Number($('#r-prio').value) || 100;
  const descripcion = $('#r-desc').value.trim() || undefined;
  if (!patron) return alert('falta patrón');
  try {
    await window.taggerApi('/reglas', {
      method: 'POST',
      body: JSON.stringify({ patron, categoria_slug: SLUG, prioridad, descripcion }),
    });
    $('#r-patron').value = '';
    $('#r-desc').value = '';
    await loadReglas();
  } catch (e) {
    alert(e.message);
  }
});

$('#r-test-btn').addEventListener('click', async () => {
  const patron = $('#r-patron').value.trim();
  const texto = $('#r-test-texto').value.trim();
  if (!patron || !texto) return;
  try {
    const r = await window.taggerApi('/reglas/test', {
      method: 'POST',
      body: JSON.stringify({ patron, texto }),
    });
    const el = $('#r-test-result');
    el.style.display = 'block';
    el.className = `test-result ${r.match ? 'match' : 'no-match'}`;
    el.textContent = r.match ? `✓ matchea` : `✗ no matchea`;
  } catch (e) {
    alert(e.message);
  }
});

$('#reglas-tbl').addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  try {
    if (act === 'del') {
      if (!confirm('Eliminar regla?')) return;
      await window.taggerApi(`/reglas/${id}`, { method: 'DELETE' });
    } else if (act === 'toggle') {
      const activo = btn.dataset.activo !== 'true';
      await window.taggerApi(`/reglas/${id}`, { method: 'PATCH', body: JSON.stringify({ activo }) });
    }
    await loadReglas();
  } catch (err) {
    alert(err.message);
  }
});

// MCC
async function loadMcc() {
  try {
    const [asignados, sin] = await Promise.all([
      api(`/mcc?categoria=${encodeURIComponent(SLUG)}`),
      api('/mcc?sin_categoria=true'),
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
    alert(e.message);
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
      await window.taggerApi(`/mcc/${cod}`, { method: 'PATCH', body: JSON.stringify({ categoria_slug: SLUG }) });
    } else if (act === 'unassign') {
      await window.taggerApi(`/mcc/${cod}`, { method: 'PATCH', body: JSON.stringify({ categoria_slug: null }) });
    } else return;
    await loadMcc();
  } catch (err) {
    alert(err.message);
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
  } catch (e) {
    alert(e.message);
  }
});

$('#marcas-tbl').addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn || btn.dataset.act !== 'del-marca') return;
  if (!confirm('Eliminar marca?')) return;
  try {
    await window.taggerApi(`/marcas/${btn.dataset.id}`, { method: 'DELETE' });
    await loadMarcas();
  } catch (e) {
    alert(e.message);
  }
});

loadInfo();
