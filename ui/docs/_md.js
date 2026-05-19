/* Markdown viewer engine. Carga md, renderiza con marked, genera TOC, copy buttons y scroll-spy. */
(function () {
  const cfg = window.__mdViewerCfg || {};
  const targetUrl = cfg.src;
  const mdEl = document.getElementById('md-content');
  const tocEl = document.getElementById('toc-list');

  function slugify(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  function renderMarkdown(src) {
    if (!window.marked) return '<p class="loading">marked.js no disponible.</p>';
    const renderer = new window.marked.Renderer();
    const usedIds = new Set();
    function uniqueId(base) {
      let id = base || 'h';
      let i = 2;
      while (usedIds.has(id)) {
        id = `${base}-${i++}`;
      }
      usedIds.add(id);
      return id;
    }
    renderer.heading = function (text, level) {
      const plain = String(text).replace(/<[^>]+>/g, '');
      const id = uniqueId(slugify(plain));
      const anchor =
        level >= 2 && level <= 4
          ? `<a class="anchor" href="#${id}" aria-label="anchor">#</a>`
          : '';
      return `<h${level} id="${id}">${anchor}${text}</h${level}>`;
    };
    window.marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
    return window.marked.parse(src, { renderer });
  }

  function decorateCallouts() {
    mdEl.querySelectorAll('blockquote').forEach((q) => {
      const txt = (q.textContent || '').trim().toLowerCase();
      if (/^(warning|warn|cuidado|⚠️|⚠)/.test(txt)) q.classList.add('callout-warn');
      else if (/^(danger|peligro|critical|crítico|❌|🚨)/.test(txt)) q.classList.add('callout-danger');
      else if (/^(ok|listo|tip|nota|note|info|ℹ️|✅)/.test(txt)) q.classList.add('callout-ok');
    });
  }

  function addCopyButtons() {
    mdEl.querySelectorAll('pre').forEach((pre) => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = 'copy';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent;
        navigator.clipboard?.writeText(code);
        btn.textContent = '✓ copied';
        setTimeout(() => (btn.textContent = 'copy'), 1200);
      });
      pre.appendChild(btn);
    });
  }

  function buildToc() {
    const headings = mdEl.querySelectorAll('h2, h3, h4');
    tocEl.innerHTML = '';
    if (!headings.length) {
      tocEl.innerHTML = '<li class="t-muted t-small">Sin secciones</li>';
      return;
    }
    headings.forEach((h) => {
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.slice(1);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = (h.textContent || '').replace(/^#\s*/, '').trim();
      a.dataset.target = h.id;
      li.appendChild(a);
      tocEl.appendChild(li);
    });
    setupScrollSpy(headings);
  }

  function setupScrollSpy(headings) {
    const links = tocEl.querySelectorAll('a');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const id = e.target.id;
          links.forEach((l) => l.classList.toggle('active', l.dataset.target === id));
        });
      },
      { rootMargin: '0px 0px -75% 0px', threshold: 0 },
    );
    headings.forEach((h) => io.observe(h));
  }

  async function load() {
    try {
      const r = await fetch(targetUrl, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const src = await r.text();
      mdEl.innerHTML = renderMarkdown(src);
      decorateCallouts();
      addCopyButtons();
      buildToc();
      if (location.hash) {
        const target = document.getElementById(location.hash.slice(1));
        target?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    } catch (e) {
      mdEl.innerHTML = `<p class="loading">Error cargando ${targetUrl}: ${e.message}</p>`;
      window.toast?.error('No se pudo cargar el documento');
    }
  }

  window.addEventListener('DOMContentLoaded', load);
})();
