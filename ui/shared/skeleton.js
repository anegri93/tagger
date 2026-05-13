// Skeleton helper. window.taggerSkeleton.rows(tbody, { rows: 5, cols: 6 })
(function () {
  function rows(target, opts) {
    if (!target) return;
    const o = opts || {};
    const r = Math.max(1, o.rows ?? 5);
    const c = Math.max(1, o.cols ?? 4);
    let html = '';
    for (let i = 0; i < r; i++) {
      html += '<tr class="tagger-skel-row">';
      for (let j = 0; j < c; j++) html += '<td><span class="tagger-skel-bar"></span></td>';
      html += '</tr>';
    }
    target.innerHTML = html;
  }

  function block(target, opts) {
    if (!target) return;
    const o = opts || {};
    const lines = Math.max(1, o.lines ?? 3);
    let html = '';
    for (let i = 0; i < lines; i++) {
      html += `<span class="tagger-skel-bar" style="width:${60 + ((i * 7) % 35)}%"></span>`;
    }
    target.innerHTML = `<div class="tagger-skel-block">${html}</div>`;
  }

  window.taggerSkeleton = { rows, block };
})();
