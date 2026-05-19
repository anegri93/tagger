// Modal "API / Atajos". Cada página llama window.taggerApiModal.register([{name, method, path, body?}]).
// Se abre con tecla "?" o programáticamente.
(function () {
  const POSTMAN_URL = '/postman/tagger.postman_collection.json';
  const REPO_URL = 'https://github.com/anegri93/tagger';
  let endpoints = [];
  let modalEl = null;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function')
        node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function curlFor(ep) {
    const base = (window.tagger?.baseUrl ?? 'http://localhost:3000').replace(/\/$/, '');
    const headers = ['-H "x-api-key: $API_KEY"'];
    if (ep.body) headers.push('-H "content-type: application/json"');
    const method = (ep.method || 'GET').toUpperCase();
    let cmd = `curl -X ${method} ${headers.join(' ')} "${base}${ep.path}"`;
    if (ep.body) cmd += ` \\\n  -d '${JSON.stringify(ep.body)}'`;
    return cmd;
  }

  function buildModal() {
    const overlay = el('div', {
      class: 'tagger-modal-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'API y atajos',
      hidden: '',
    });
    const dialog = el('div', { class: 'tagger-modal' });
    const header = el('div', { class: 'tagger-modal-head' }, [
      el('h3', {}, ['API y atajos de esta página']),
      el(
        'button',
        {
          type: 'button',
          class: 'tagger-modal-close',
          'aria-label': 'Cerrar',
          onclick: close,
        },
        ['×'],
      ),
    ]);
    const body = el('div', { class: 'tagger-modal-body' });

    if (endpoints.length === 0) {
      body.appendChild(el('p', { class: 't-muted' }, ['No hay endpoints registrados.']));
    } else {
      for (const ep of endpoints) {
        const item = el('div', { class: 'tagger-api-item' });
        item.appendChild(
          el('div', { class: 'tagger-api-head' }, [
            el('span', { class: `tag tag-${methodColor(ep.method)}` }, [
              (ep.method || 'GET').toUpperCase(),
            ]),
            el('code', {}, [ep.path]),
            ep.name ? el('span', { class: 't-muted t-small' }, ['— ' + ep.name]) : null,
          ]),
        );
        const pre = el('pre', { class: 'tagger-api-curl' }, [curlFor(ep)]);
        const copyBtn = el(
          'button',
          {
            type: 'button',
            class: 'btn btn-sm btn-ghost',
            onclick: () => navigator.clipboard?.writeText(curlFor(ep)),
          },
          ['Copiar curl'],
        );
        item.appendChild(pre);
        item.appendChild(copyBtn);
        body.appendChild(item);
      }
    }

    body.appendChild(
      el('div', { class: 'tagger-modal-footer' }, [
        el('a', { class: 'btn btn-ghost', href: POSTMAN_URL, download: '' }, ['Descargar Postman']),
        el('a', { class: 'btn btn-ghost', href: REPO_URL, target: '_blank', rel: 'noopener' }, [
          'GitHub repo ↗',
        ]),
        el('a', { class: 'btn btn-ghost', href: '/ui/docs/openapi.html' }, ['OpenAPI']),
      ]),
    );

    dialog.append(header, body);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function methodColor(m) {
    const s = (m || 'GET').toUpperCase();
    if (s === 'GET') return 'info';
    if (s === 'POST') return 'ok';
    if (s === 'PATCH' || s === 'PUT') return 'warn';
    if (s === 'DELETE') return 'err';
    return 'info';
  }

  function open() {
    if (modalEl) modalEl.remove();
    modalEl = buildModal();
    modalEl.hidden = false;
    const closeBtn = modalEl.querySelector('.tagger-modal-close');
    closeBtn?.focus();
  }

  function close() {
    if (modalEl) {
      modalEl.hidden = true;
      modalEl.remove();
      modalEl = null;
    }
  }

  function register(list) {
    endpoints = Array.isArray(list) ? list : [];
  }

  function bind() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl) close();
      if (
        e.key === '?' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        open();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.taggerApiModal = { register, open, close };
})();
