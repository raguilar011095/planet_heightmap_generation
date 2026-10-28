// The view strip above the layer tabs, on every page (plans/VIEW_UI_PLAN.md): Globe | Map and what applies to it — the
// map's projection and centre, the globe's turning, the grid, and on Evolution the terrain's colours, hillshade and
// rivers. Each control keeps its id and its page's own wiring; this module gives Globe | Map its two buttons (they drive
// the page's #viewMode select, which the page listens to), shows the controls marked data-view="map" or "globe" only in
// that view, folds the strip behind the arrow at the tabs' left (opened, the tabs move down to make room; the browser
// remembers which), and on a phone moves the strip to the top of the bottom sheet, never folded (an always-on row would
// cover the planet there) — back above the tabs when the window widens.

import { PROJECTIONS } from '../v2/js/view/projections.js';
import { renderProjectionOptions } from '../v2/js/view/export-panel.js';

const OPEN_KEY = 'orogen.view-strip-open';
// (one projection for the three pages; Evolution's own key, from before they shared it, read when there is none)
const PROJECTION_KEY = 'orogen.projection', OLD_PROJECTION_KEY = 'orogen.evolution.projection';

/**
 * The map's projection (#mapProjection, the projection's own options in #mapProjOpts — the export's controls,
 * export-panel.js), remembered by the browser. `onChange(id, opts)` is called with the remembered one at once, then on
 * every change.
 */
export function initProjectionPicker(onChange) {
    const sel = document.getElementById('mapProjection'), optsEl = document.getElementById('mapProjOpts');
    if (!sel || !optsEl) return;
    for (const p of PROJECTIONS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; sel.appendChild(o); }
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(PROJECTION_KEY) || localStorage.getItem(OLD_PROJECTION_KEY) || 'null'); } catch { stored = null; }
    let id = stored?.id && PROJECTIONS.some(p => p.id === stored.id) ? stored.id : 'equirect', getOpts = () => ({});
    const apply = () => {
        const opts = getOpts();
        onChange(id, opts);
        try { localStorage.setItem(PROJECTION_KEY, JSON.stringify({ id, opts })); } catch { /* (remembered only where the browser allows) */ }
    };
    const build = (initial) => { getOpts = renderProjectionOptions(optsEl, id, initial, apply); };
    sel.value = id;
    build(id === stored?.id ? stored.opts : null);
    onChange(id, getOpts());
    sel.addEventListener('change', () => { id = sel.value; build(null); apply(); });
}

export function initViewStrip() {
    const strip = document.getElementById('viewStrip'), mode = document.getElementById('viewMode');
    if (!strip || !mode) return;
    const buttons = strip.querySelectorAll('.vs-seg [data-mode]');
    const sync = () => {
        for (const b of buttons) { const on = b.dataset.mode === mode.value; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
        for (const el of strip.querySelectorAll('[data-view]')) el.hidden = el.dataset.view !== mode.value;
    };
    for (const b of buttons) b.addEventListener('click', () => {
        if (mode.value === b.dataset.mode) return;
        mode.value = b.dataset.mode;
        mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    mode.addEventListener('change', sync);
    sync();
    // (folded until opened)
    const fold = document.getElementById('viewFold');
    if (fold) {
        const tip = fold.title;
        const setOpen = (open) => {
            strip.classList.toggle('folded', !open);
            fold.setAttribute('aria-expanded', String(open));
            fold.title = open ? 'Hide the view options' : tip;
        };
        let open = false;
        try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* (folded where the browser forbids remembering) */ }
        setOpen(open);
        fold.addEventListener('click', () => {
            open = !open;
            setOpen(open);
            try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* (remembered only where the browser allows) */ }
        });
    }
    const narrow = matchMedia('(max-width: 768px)');
    // (beside an open sidebar — a narrow window, a tablet — the bar moves right just enough to clear it, as far as the
    // room before the help button allows; centred over the planet otherwise)
    const bar = document.getElementById('layerBar'), panel = document.getElementById('ui'), help = document.getElementById('helpBtn');
    if (bar && panel && typeof ResizeObserver !== 'undefined') {
        const clear = () => {
            bar.style.removeProperty('--bar-shift');
            if (narrow.matches) return;
            const b = bar.getBoundingClientRect(), want = panel.getBoundingClientRect().right + 8 - b.left;
            if (want <= 0) return;
            const room = (help?.checkVisibility?.() ? help.getBoundingClientRect().left : innerWidth) - 8 - b.right;
            bar.style.setProperty('--bar-shift', `${Math.max(0, Math.min(want, room))}px`);
        };
        const watch = new ResizeObserver(clear);
        watch.observe(bar); watch.observe(panel);
        addEventListener('resize', clear);
    }
    // (a phone: at the top of the bottom sheet; wider: back where the page put it)
    const slot = document.getElementById('viewStripSlot'), home = strip.parentElement, after = strip.nextElementSibling;
    if (!slot) return;
    const place = () => {
        if (narrow.matches) { slot.appendChild(strip); strip.classList.add('in-sheet'); }
        else { home.insertBefore(strip, after && after.parentElement === home ? after : null); strip.classList.remove('in-sheet'); }
    };
    narrow.addEventListener('change', place);
    place();
}
