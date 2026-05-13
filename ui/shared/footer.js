// Footer global. Auto-monta al final del body. Lee /version del backend.
(function () {
  const REPO_URL = 'https://github.com/anegri93/tagger';

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  async function fetchVersion() {
    try {
      const r = await fetch((window.tagger?.baseUrl ?? '') + '/version');
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function render(versionInfo) {
    const versionLabel = versionInfo?.version ? `v${versionInfo.version}` : 'v—';
    const links = el('div', { class: 'links' }, [
      el('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, ['GitHub ↗']),
      el('a', { href: '/postman/tagger.postman_collection.json', download: '' }, [
        'Postman collection',
      ]),
      el('a', { href: '/openapi.yaml' }, ['OpenAPI']),
      el('a', { href: '/docs/runbook.md' }, ['Runbook']),
    ]);
    const left = el('div', {}, [
      'tagger ',
      el('code', {}, [versionLabel]),
      ' — categorización movimientos bancarios',
    ]);
    return el('footer', { class: 'tagger-footer', role: 'contentinfo' }, [left, links]);
  }

  async function mount() {
    const slot = document.getElementById('tagger-footer-slot');
    const info = await fetchVersion();
    const node = render(info);
    if (slot) slot.replaceWith(node);
    else document.body.appendChild(node);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
