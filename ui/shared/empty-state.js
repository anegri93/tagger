// Empty state util. window.taggerEmpty.render(container, { title, message, ctaLabel, ctaHref, postmanRequest }).
(function () {
  const REPO_POSTMAN = '/postman/tagger.postman_collection.json';

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

  function render(container, opts) {
    if (!container) return;
    const o = opts || {};
    container.innerHTML = '';
    const wrap = el('div', { class: 'tagger-empty', role: 'status' });
    if (o.title) wrap.appendChild(el('h3', {}, [o.title]));
    if (o.message) wrap.appendChild(el('p', {}, [o.message]));
    const actions = el('div', { class: 'tagger-empty-actions' });
    if (o.ctaLabel && o.ctaHref) {
      actions.appendChild(el('a', { class: 'btn btn-primary', href: o.ctaHref }, [o.ctaLabel]));
    }
    if (o.postmanRequest) {
      actions.appendChild(
        el(
          'a',
          {
            class: 'btn btn-ghost',
            href: REPO_POSTMAN,
            download: '',
            title: `Descargar colección (request: ${o.postmanRequest})`,
          },
          ['Ver en Postman →'],
        ),
      );
    }
    if (actions.childElementCount > 0) wrap.appendChild(actions);
    container.appendChild(wrap);
  }

  window.taggerEmpty = { render };
})();
