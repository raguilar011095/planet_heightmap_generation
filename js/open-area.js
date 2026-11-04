// The open area: the part of the window the planet has to itself, right of the control panel (#ui) while the panel is
// open on a wider screen. On a phone (the panel is the bottom sheet) and with the panel folded away, the whole window.
//
// Where the planet sits (the owner's rule): with room to spare it is centred on the whole window, as it always was; when
// room is short it is centred on the open area, so it never sits behind the panel. Between the two it eases over:
// the gap a truly centred planet would leave beside the panel, from none to the panel's own width, takes it smoothly
// (a smoothstep, not a straight line) from the open area's centre to the window's. The planet's width comes from the
// page (planetWidthFrom: the globe at its home zoom with its ring, or the whole map), so the globe doesn't slide as you
// zoom. A change (the panel folded or opened, the window resized, the globe swapped for the map) glides there.
//
// For the stylesheets, on <html>: --open-left (the open area's left edge) and --open-shift (how far right of the
// window's centre the planet's centre sits), in CSS pixels. For the cameras (js/scene.js, v2/js/app/globe-view.js) and
// the degree ring: openLeft(), openShift(), onOpenArea(fn).

const narrow = matchMedia('(max-width: 768px)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = [];
let panel = null, left = 0, room = 0, shift = 0, target = 0, settled = false, frame = 0, lastT = 0;
let widthOf = () => 0;

const smoothstep = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

function publish() {
    const s = document.documentElement.style;
    s.setProperty('--open-left', `${left}px`);
    s.setProperty('--open-shift', `${shift.toFixed(1)}px`);
    for (const fn of listeners) { try { fn(left, shift); } catch (e) { console.error(e); } }
}

function glide(now) {
    const dt = Math.min(64, now - (lastT || now)); lastT = now;
    shift = target + (shift - target) * Math.exp(-dt / 70);
    if (Math.abs(shift - target) < 0.5) { shift = target; frame = 0; lastT = 0; }
    else frame = requestAnimationFrame(glide);
    publish();
}

// (`moved`: the open area itself changed, so the cameras refit even if the planet stays put)
function retarget(moved = false) {
    const w = widthOf();
    target = left > 0 ? (left / 2) * (1 - smoothstep(((innerWidth - w) / 2 - left) / Math.max(1, room))) : 0;
    if (!settled || reduce.matches) {
        if (frame) { cancelAnimationFrame(frame); frame = 0; lastT = 0; }
        shift = target; publish();
        return;
    }
    if (frame) return;                                     // (gliding: each frame publishes)
    if (Math.abs(target - shift) < 0.5) { shift = target; if (moved) publish(); return; }
    frame = requestAnimationFrame(glide);
}

function measure() {
    panel ??= document.getElementById('ui');
    let x = 0, wide = 0;
    if (panel && !narrow.matches && !panel.classList.contains('collapsed') && panel.offsetParent !== null) {
        const r = panel.getBoundingClientRect();
        x = Math.max(0, Math.round(r.right)); wide = Math.round(r.width);
        if (x > innerWidth * 0.6) x = wide = 0;             // (a window too narrow to spare the room: the whole of it)
    }
    const moved = x !== left || wide !== room;
    left = x; room = wide;
    retarget(moved);
}

/** The open area's left edge, in CSS pixels (0: the whole window). */
export function openLeft() { return left; }

/** How far right of the window's centre the planet's centre sits, in CSS pixels. */
export function openShift() { return shift; }

/** fn(left, shift) whenever either moves (each frame of a glide). */
export function onOpenArea(fn) { listeners.push(fn); }

/** The page's planet: fn() → its width on screen in CSS pixels, fitted to the open area (the globe at home zoom with its
 *  ring, or the whole map). Called again whenever the open area changes. */
export function planetWidthFrom(fn) { widthOf = fn; retarget(); settled = true; }

/** The planet's width has changed (the globe swapped for the map, another projection): the planet moves to suit. */
export function planetChanged() { retarget(true); }

function watch() {
    panel = document.getElementById('ui');
    measure();
    if (!panel) return;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => measure()).observe(panel);
    new MutationObserver(() => measure()).observe(panel, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    addEventListener('resize', () => measure());
    narrow.addEventListener('change', () => measure());
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
else watch();
