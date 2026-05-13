// Toasts. window.toast.{success,error,info,warn}(message, opts?)
(function () {
  let host = null;

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement('div');
    host.className = 'tagger-toasts';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    document.body.appendChild(host);
    return host;
  }

  function show(kind, message, opts) {
    const o = opts || {};
    const node = document.createElement('div');
    node.className = `tagger-toast tagger-toast-${kind}`;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const text = document.createElement('div');
    text.className = 'tagger-toast-msg';
    text.textContent = String(message ?? '');
    node.appendChild(text);

    if (o.action && o.action.label && typeof o.action.onClick === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tagger-toast-action';
      btn.textContent = o.action.label;
      btn.addEventListener('click', () => {
        try {
          o.action.onClick();
        } finally {
          dismiss();
        }
      });
      node.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tagger-toast-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', dismiss);
    node.appendChild(closeBtn);

    ensureHost().appendChild(node);
    let timer = null;
    const ttl = o.duration ?? (kind === 'error' ? 8000 : 4000);
    if (ttl > 0) timer = setTimeout(dismiss, ttl);

    function dismiss() {
      if (timer) clearTimeout(timer);
      node.classList.add('out');
      setTimeout(() => node.remove(), 180);
    }

    return { dismiss };
  }

  window.toast = {
    success: (m, o) => show('success', m, o),
    error: (m, o) => show('error', m, o),
    info: (m, o) => show('info', m, o),
    warn: (m, o) => show('warn', m, o),
  };
})();
