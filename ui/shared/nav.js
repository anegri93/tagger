// Inyecta navbar unificado (topbar). Requiere window.tagger (state.js).
(function () {
  const REPO_URL = 'https://github.com/anegri93/tagger';

  const SECTIONS = [
    { path: '/ui/index.html', label: 'Inicio', exact: ['/ui/', '/ui/index.html', '/ui'] },
    { path: '/ui/categorias/index.html', label: 'Categorías', prefix: '/ui/categorias/' },
    { path: '/ui/importar/index.html', label: 'Importar', prefix: '/ui/importar/' },
    { path: '/ui/recat/index.html', label: 'Recategorizar', prefix: '/ui/recat/' },
    { path: '/ui/test-monitor/index.html', label: 'Monitor', prefix: '/ui/test-monitor/' },
    { path: '/ui/memoria/index.html', label: 'Playground', prefix: '/ui/memoria/' },
    { path: '/ui/api/index.html', label: 'API', prefix: '/ui/api/' },
  ];

  const RESOURCES = [
    { label: 'GitHub repo', href: REPO_URL, external: true },
    {
      label: 'Postman collection',
      href: '/postman/tagger.postman_collection.json',
      download: true,
    },
    { label: 'OpenAPI spec', href: '/openapi.yaml', external: false },
    { label: 'Runbook', href: '/docs/runbook.md', external: false },
    { label: 'Integration guide', href: '/docs/integration-guide.md', external: false },
  ];

  const THEME_KEY = 'tagger:theme';
  function getTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
  }
  setTheme(getTheme());

  function isActive(section) {
    const p = window.location.pathname;
    if (section.exact) return section.exact.includes(p);
    if (section.prefix) return p.startsWith(section.prefix);
    return false;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
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

  function renderResourcesDropdown() {
    const wrap = el('div', { class: 'tagger-nav-dd' });
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'tagger-nav-dd-btn',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
        'aria-label': 'Recursos del proyecto',
      },
      ['Recursos ▾'],
    );
    const menu = el('div', { class: 'tagger-nav-dd-menu', role: 'menu', hidden: '' });

    for (const r of RESOURCES) {
      const a = el(
        'a',
        {
          href: r.href,
          role: 'menuitem',
          ...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          ...(r.download ? { download: '' } : {}),
        },
        [r.label + (r.external ? ' ↗' : '')],
      );
      menu.appendChild(a);
    }

    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function open() {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden ? open() : close();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        menu.hidden ? open() : close();
      }
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    wrap.append(btn, menu);
    return wrap;
  }

  function renderHealthBadge() {
    return el('span', {
      class: 'tagger-nav-health',
      id: 'tagger-nav-health',
      title: 'Estado API',
      'aria-live': 'polite',
    });
  }

  function render() {
    const nav = el('nav', { class: 'tagger-nav', role: 'navigation', 'aria-label': 'Principal' });

    const brand = el(
      'a',
      { class: 'brand', href: '/ui/index.html', 'aria-label': 'tagger inicio' },
      [el('span', { class: 'brand-mark' }, ['◆']), 'tagger'],
    );

    const links = el('div', { class: 'tagger-nav-links' });
    for (const s of SECTIONS) {
      links.appendChild(
        el(
          'a',
          {
            href: s.path,
            class: isActive(s) ? 'active' : '',
            'aria-current': isActive(s) ? 'page' : null,
          },
          [s.label],
        ),
      );
    }

    const themeBtn = el(
      'button',
      {
        type: 'button',
        class: 'tagger-nav-help-btn',
        title: 'Cambiar tema',
        'aria-label': 'Cambiar tema',
        id: 'tagger-theme-toggle',
      },
      [getTheme() === 'light' ? '☾' : '☼'],
    );
    themeBtn.addEventListener('click', () => {
      const next = getTheme() === 'light' ? 'dark' : 'light';
      setTheme(next);
      themeBtn.textContent = next === 'light' ? '☾' : '☼';
    });

    const helpBtn = el(
      'button',
      {
        type: 'button',
        class: 'tagger-nav-help-btn',
        title: 'API y atajos (?)',
        'aria-label': 'Mostrar API y atajos',
        onclick: () => window.taggerApiModal?.open(),
      },
      ['?'],
    );

    const config = el('div', { class: 'tagger-nav-config' }, [
      renderHealthBadge(),
      themeBtn,
      helpBtn,
      renderResourcesDropdown(),
      el('input', {
        id: 'tagger-nav-apikey',
        type: 'password',
        placeholder: 'x-api-key',
        autocomplete: 'off',
        'aria-label': 'API key',
      }),
    ]);

    nav.append(brand, links, config);
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
    setInterval(pingHealth, 30000);
  }

  async function pingHealth() {
    const el = document.getElementById('tagger-nav-health');
    if (!el) return;
    try {
      const r = await fetch((window.tagger.baseUrl ?? '') + '/health/ready');
      if (r.ok) {
        const body = await r.json().catch(() => ({}));
        const dbOk = body?.db === 'ok';
        if (dbOk) {
          el.textContent = '● API ok';
          el.className = 'tagger-nav-health ok';
        } else {
          el.textContent = '● degraded';
          el.className = 'tagger-nav-health warn';
        }
      } else {
        el.textContent = `● HTTP ${r.status}`;
        el.className = 'tagger-nav-health err';
      }
    } catch {
      el.textContent = '● API down';
      el.className = 'tagger-nav-health err';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
