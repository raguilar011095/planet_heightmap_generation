// The band a flat map is fitted in at zoom 1, the same on every page (Generate and Import: js/scene.js; Evolution:
// v2/js/app/globe-view.js through v2/js/evolution/evolution-main.js): below the masthead and all that sits over the
// planet at the top (the view options while they are open, the layer tabs, a layer's own row of maps), above what sits
// under it (Generate's hint, Evolution's timeline), right of the panel (js/open-area.js), with room all round for its
// frame's ticks and numerals (js/graticule-frame.js). On a phone the tabs and the sheet float over it.
//
// When what is above or below it changes size (the view options opened, Climate's row shown), the band glides to its
// new place over a few frames rather than jumping; a window resized moves it at once.

import { openLeft } from './open-area.js';

const narrow = matchMedia('(max-width: 768px)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/** The room kept at the map's sides for its frame's numerals (px): less on a phone. */
export const mapMargin = () => (narrow.matches ? 22 : 56);

/** The masthead's height (--nav-h, px). */
export function navHeight() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 56; }

/**
 * The page's band. `below`: the element the map stays above (or null), kept `gap` px clear of it — on a phone too if
 * `phones` (Evolution's timeline; Generate's hint sits over the map there, above the sheet). Returns
 * { now(): { top, bottom, m } (client px from the window's top, and from its bottom; the side margin), frameRect():
 * the rectangle the map's frame keeps within when zoomed in (its numerals outside it), tick(now): eases the band
 * towards where it belongs — true while it moves (the page refits its map then) }.
 */
export function createMapBand({ below = null, gap = 24, phones = false } = {}) {
    let cur = null, goal = null, lastT = 0, jumped = false;
    const measure = () => {
        let top = navHeight() + 22, bottom = 22;
        if (!narrow.matches) {
            const bar = document.getElementById('layerBar')?.getBoundingClientRect();
            if (bar?.height) top = Math.max(top, bar.bottom + 30);
        }
        const u = (phones || !narrow.matches) && below?.getBoundingClientRect();
        if (u?.height) bottom = Math.max(bottom, innerHeight - u.top + gap);
        return { top, bottom };
    };
    // (at once: the next tick() reports the move, so the page refits whichever of its resize handlers ran first)
    const retarget = (atOnce = false) => {
        goal = measure();
        if (!cur || atOnce || reduce.matches) {
            jumped ||= !!cur && (cur.top !== goal.top || cur.bottom !== goal.bottom);
            cur = { ...goal };
        }
    };
    const watch = () => {
        addEventListener('resize', () => retarget(true));
        narrow.addEventListener('change', () => retarget(true));
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => retarget());
        const bar = document.getElementById('layerBar');
        if (bar) ro.observe(bar);
        if (below) ro.observe(below);
    };
    watch();
    return {
        now() {
            if (!cur) retarget(true);
            return { top: cur.top, bottom: cur.bottom, m: mapMargin() };
        },
        frameRect() {
            const { top, bottom, m } = this.now(), side = Math.max(16, m - 4);
            return { l: openLeft() + side, t: top - 8, r: innerWidth - side, b: innerHeight - bottom + 8 };
        },
        tick(now = performance.now()) {
            if (!cur) { this.now(); return false; }
            if (cur.top === goal.top && cur.bottom === goal.bottom) { lastT = 0; const j = jumped; jumped = false; return j; }
            const dt = Math.min(64, now - (lastT || now - 16)), k = Math.exp(-dt / 70);
            lastT = now;
            for (const s of ['top', 'bottom']) {
                cur[s] = goal[s] + (cur[s] - goal[s]) * k;
                if (Math.abs(cur[s] - goal[s]) < 0.5) cur[s] = goal[s];
            }
            return true;
        },
    };
}
