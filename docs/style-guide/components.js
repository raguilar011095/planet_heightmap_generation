// World Orogen components: the few behaviours they need (docs/style-guide/components.md). Call Orogen.wire() once.
(function () {
  'use strict';
  // World Orogen: the few behaviours the components need, in plain JS (no framework).
  function choose(el, attr, btn) {
    el.querySelectorAll('button').forEach(function (b) { b.setAttribute(attr, b === btn ? 'true' : 'false'); });
    el.dispatchEvent(new CustomEvent('og-change', { bubbles: true, detail: { value: btn.value || btn.textContent.trim() } }));
  }
  function group(el, attr) {
    if (el.__og) return; el.__og = true;
    el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && el.contains(b)) choose(el, attr, b); });
  }
  function slider(el) {
    var input = el.querySelector('input[type="range"]'), out = el.querySelector('.og-slider__value');
    if (!input || !out || el.__og) return; el.__og = true;
    var fmt = el.getAttribute('data-format') || '{v}';
    function show() { out.textContent = fmt.replace('{v}', input.value); }
    input.addEventListener('input', show); show();
  }
  function wire(root) {
    root = root || document;
    root.querySelectorAll('.og-seg, .og-worlds').forEach(function (el) { group(el, 'aria-pressed'); });
    root.querySelectorAll('.og-tabs[role="tablist"]').forEach(function (el) { group(el, 'aria-selected'); });
    root.querySelectorAll('.og-slider').forEach(slider);
  }
  window.Orogen = { wire: wire, segmented: function (el) { group(el, 'aria-pressed'); }, tabs: function (el) { group(el, 'aria-selected'); }, slider: slider };
})();
