// Tooltips. Marca elementos con data-tooltip="texto" o usa <span class="tagger-help" data-tooltip="...">?</span>
(function () {
  let tipEl = null;
  let activeTarget = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'tagger-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function position(target) {
    const rect = target.getBoundingClientRect();
    const t = ensureTip();
    t.hidden = false;
    const top = rect.bottom + window.scrollY + 6;
    const left = Math.max(
      8,
      Math.min(
        rect.left + window.scrollX,
        window.scrollX + document.documentElement.clientWidth - t.offsetWidth - 8,
      ),
    );
    t.style.top = top + 'px';
    t.style.left = left + 'px';
  }

  function show(target) {
    const text = target.getAttribute('data-tooltip');
    if (!text) return;
    activeTarget = target;
    const t = ensureTip();
    t.textContent = text;
    position(target);
  }

  function hide() {
    activeTarget = null;
    if (tipEl) tipEl.hidden = true;
  }

  function bindGlobal() {
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-tooltip]');
      if (t) show(t);
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target.closest('[data-tooltip]');
      if (t && t === activeTarget) hide();
    });
    document.addEventListener('focusin', (e) => {
      const t = e.target.closest('[data-tooltip]');
      if (t) show(t);
    });
    document.addEventListener('focusout', (e) => {
      const t = e.target.closest('[data-tooltip]');
      if (t && t === activeTarget) hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGlobal);
  } else {
    bindGlobal();
  }

  window.taggerTooltip = { show, hide };
})();
