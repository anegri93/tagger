// Breadcrumbs. Cada página llama window.taggerBreadcrumbs([{label, href?}, ...]).
(function () {
  function render(items) {
    const nav = document.createElement('nav');
    nav.className = 'tagger-breadcrumbs';
    nav.setAttribute('aria-label', 'Breadcrumb');
    const ol = document.createElement('ol');
    items.forEach((it, i) => {
      const li = document.createElement('li');
      if (it.href && i < items.length - 1) {
        const a = document.createElement('a');
        a.href = it.href;
        a.textContent = it.label;
        li.appendChild(a);
      } else {
        li.textContent = it.label;
        li.setAttribute('aria-current', 'page');
      }
      ol.appendChild(li);
    });
    nav.appendChild(ol);
    return nav;
  }

  function mount(items) {
    const slot = document.getElementById('tagger-breadcrumbs-slot');
    const node = render(items);
    if (slot) slot.replaceWith(node);
    else {
      const navEl = document.querySelector('.tagger-nav');
      if (navEl && navEl.parentNode) navEl.parentNode.insertBefore(node, navEl.nextSibling);
      else document.body.insertBefore(node, document.body.firstChild);
    }
  }

  window.taggerBreadcrumbs = function (items) {
    if (!Array.isArray(items) || items.length === 0) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mount(items));
    } else {
      mount(items);
    }
  };
})();
