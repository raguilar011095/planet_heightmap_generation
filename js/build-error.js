// When a build, import or export fails (out of memory at high Detail, a climate error, a crashed worker), the build
// overlay becomes a message with a Close button instead of spinning over the page until a reload. Shared by Generate
// (js/main.js) and Import (js/import-main.js); js/generate.js announces failures as the 'orogen:build-failed' event.
// While a build runs the overlay sits behind the page's controls, over the planet only; the controls stay in view but
// are held (inert), since a job started mid-build (a code loaded, a climate slider or tab, the map) would cross it.

const HELD = ['ui', 'layerBar', 'mobileViewSwitch', 'editToggle', 'refreshFab', 'rebuildFab'];

const OUT_OF_MEMORY = /out of memory|allocation failed|invalid array length|array buffer|rangeerror/i;

/** A short, plain explanation of what went wrong, for the overlay. */
export function describeFailure(message, action = 'build this planet') {
    if (OUT_OF_MEMORY.test(message || '')) return `This device ran out of memory trying to ${action}. Try a lower Detail.`;
    return `Something went wrong trying to ${action}. Try again, or reload the page if it keeps happening.`;
}

/** Show the failure in the build overlay; Close hides it. */
export function showBuildError(text, detail = '') {
    const overlay = document.getElementById('buildOverlay');
    if (!overlay) return;
    let box = overlay.querySelector('.build-error');
    if (!box) {
        box = document.createElement('div');
        box.className = 'build-error';
        box.setAttribute('role', 'alert');
        box.innerHTML = '<p class="build-error-text"></p><p class="build-error-detail"></p><button type="button" class="build-error-close">Close</button>';
        overlay.querySelector('.build-overlay-inner').appendChild(box);
        box.querySelector('.build-error-close').addEventListener('click', () => {
            overlay.classList.remove('failed', 'initial');
            overlay.classList.add('hidden');
        });
    }
    box.querySelector('.build-error-text').textContent = text;
    box.querySelector('.build-error-detail').textContent = detail ? `(${detail})` : '';
    overlay.classList.add('failed');
    overlay.classList.remove('hidden');
    box.querySelector('.build-error-close').focus();
}

/** Hold the controls while a build runs (true), release them after (false). */
export function holdControls(on) {
    for (const id of HELD) document.getElementById(id)?.toggleAttribute('inert', on);
}

/** Back to the ordinary progress overlay (a new build starting). */
export function clearBuildError() {
    document.getElementById('buildOverlay')?.classList.remove('failed');
}
