// Inyecta navbar unificado. Requiere window.tagger (state.js).
(function () {
  const SECTIONS = [
    { path: '/ui/index.html', label: 'Inicio', icon: '🏠', exact: ['/ui/', '/ui/index.html'] },
    {
      path: '/ui/categorias/index.html',
      label: 'Categorías',
      icon: '📂',
      prefix: '/ui/categorias/',
    },
    {
      path: '/ui/test-monitor/index.html',
      label: 'Monitor',
      icon: '📊',
      prefix: '/ui/test-monitor/',
    },
    { path: '/ui/importar/index.html', label: 'Importar', icon: '📥', prefix: '/ui/importar/' },
    { path: '/ui/recat/index.html', label: 'Recat', icon: '🔁', prefix: '/ui/recat/' },
  ];

  function isActive(section) {
    const p = window.location.pathname;
    if (section.exact) return section.exact.includes(p);
    if (section.prefix) return p.startsWith(section.prefix);
    return false;
  }

  function render() {
    const nav = document.createElement('nav');
    nav.className = 'tagger-nav';
    nav.innerHTML = `
      <div class="brand"><span class="brand-icon">🏷️</span>tagger</div>
      <div class="tagger-nav-links">
        ${SECTIONS.map(
          (s) =>
            `<a href="${s.path}" class="${isActive(s) ? 'active' : ''}">${s.icon} ${s.label}</a>`,
        ).join('')}
      </div>
      <div class="tagger-nav-config">
        <input id="tagger-nav-apikey" type="password" placeholder="x-api-key" autocomplete="off" />
        <span class="tagger-nav-status" id="tagger-nav-status">—</span>
      </div>
    `;
    return nav;
  }

  function mount() {
    const slot = document.getElementById('tagger-nav-slot');
    const nav = render();
    if (slot) slot.replaceWith(nav);
    else document.body.insertBefore(nav, document.body.firstChild);

    const input = document.getElementById('tagger-nav-apikey');
    input.value = window.tagger.apiKey;
    input.addEventListener('change', () => window.tagger.setApiKey(input.value.trim()));
    input.addEventListener('blur', () => window.tagger.setApiKey(input.value.trim()));

    window.tagger.on('apiKey', (k) => {
      if (input.value !== k) input.value = k;
    });

    pingHealth();
    setInterval(pingHealth, 10000);
  }

  async function pingHealth() {
    const el = document.getElementById('tagger-nav-status');
    if (!el) return;
    try {
      const r = await fetch((window.tagger.baseUrl ?? '') + '/health');
      if (r.ok) {
        el.textContent = '● API ok';
        el.className = 'tagger-nav-status ok';
      } else {
        el.textContent = `● HTTP ${r.status}`;
        el.className = 'tagger-nav-status err';
      }
    } catch {
      el.textContent = '● API down';
      el.className = 'tagger-nav-status err';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
