// Evolution's loading screen: Generate's overlay (styles.css, .build-overlay: the logo turning, a title, a bar, a line
// saying what is happening), over the planet and behind the controls, for the waits where there is nothing to watch —
// a world starting before its first moment, a planet file opening, detail being added, a view's first picture being
// painted, the terrain built again. The history building is never covered: watching a world form is the point.
//
// Each wait shows it under its own name; a later one takes it over, and only the one showing hides it. A share of null
// runs the bar as a slow sweep (no fraction to give). It appears at once (a wait about to freeze the page must be on
// screen first) and fades as it goes.

export function createLoading(el) {
    const title = el.querySelector('.build-overlay-title'), label = el.querySelector('.progress-label');
    const bar = el.querySelector('.progress-bar-container'), fill = el.querySelector('.progress-bar-fill');
    let owner = null;
    const set = ({ title: t, label: l, share }) => {
        if (t !== undefined) title.textContent = t;
        if (l !== undefined) label.textContent = l;
        if (share !== undefined) {
            bar.classList.toggle('indeterminate', share === null);
            fill.style.transform = share === null ? '' : `scaleX(${Math.max(0, Math.min(1, share))})`;
        }
    };
    return {
        /** Show the screen for wait `id`: { title, label, share (0…1, or null), opaque (the first, over nothing yet) }. */
        show(id, { title: t = '', label: l = '', share = null, opaque = false } = {}) {
            const fresh = owner !== id;
            owner = id;
            if (fresh) { fill.style.transition = 'none'; set({ title: t, label: l, share }); void fill.offsetWidth; fill.style.transition = ''; }
            else set({ title: t, label: l, share });
            el.classList.toggle('initial', opaque);
            el.classList.add('now');
            el.classList.remove('hidden');
            void el.offsetWidth;
            el.classList.remove('now');
        },
        /** New words or a new share for wait `id`, if it is the one showing. */
        update(id, words) { if (owner === id) set(words); },
        /** Wait `id` is over (if it is the one showing). */
        hide(id) {
            if (owner !== id) return;
            owner = null;
            el.classList.add('hidden');
        },
        /** The wait showing, or null. */
        get showing() { return owner; },
    };
}
