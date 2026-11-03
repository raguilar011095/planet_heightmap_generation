// The page's theme: Paper (light) or Night (dark), as the style guide sets them (docs/style-guide/README.md, Colour).
// A classic script in each page's <head>, before the stylesheets, so a saved choice is in place before the first paint
// and never flashes the other theme. Without a choice the device decides (tokens.css follows prefers-color-scheme).
// The switch in the top bar (#themeToggle) saves a choice. window.orogenTheme lets the globes follow: the stage behind
// a globe is the theme's desk.
(function () {
    var KEY = 'orogen-theme', root = document.documentElement, listeners = [];
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function saved() {
        try { var t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; }
    }
    function current() {
        var t = root.getAttribute('data-theme');
        return t === 'light' || t === 'dark' ? t : (media && media.matches ? 'dark' : 'light');
    }
    function token(name) { return getComputedStyle(root).getPropertyValue('--' + name).trim(); }

    // the browser's own chrome (a phone's status bar) takes the page's ground
    function syncMeta() {
        var meta = document.getElementById('themeColor');
        if (!saved()) { if (meta) meta.remove(); return; }
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color'; meta.id = 'themeColor';
            var first = document.querySelector('meta[name="theme-color"]');
            document.head.insertBefore(meta, first || null);
        }
        meta.content = token('bg');
    }
    function syncToggle() {
        var b = document.getElementById('themeToggle');
        if (!b) return;
        var label = current() === 'dark' ? 'Switch to Paper, the light theme' : 'Switch to Night, the dark theme';
        b.setAttribute('aria-label', label);
        b.title = label;
    }
    function changed() {
        syncMeta(); syncToggle();
        var t = current();
        for (var i = 0; i < listeners.length; i++) { try { listeners[i](t); } catch (e) { console.error(e); } }
    }
    function set(t) {
        root.setAttribute('data-theme', t);
        try { localStorage.setItem(KEY, t); } catch (e) { /* (private windows: the choice lasts the page) */ }
        changed();
    }

    var first = saved();
    if (first) root.setAttribute('data-theme', first);
    if (media) {
        var onDevice = function () { if (!saved()) changed(); };
        if (media.addEventListener) media.addEventListener('change', onDevice); else if (media.addListener) media.addListener(onDevice);
    }
    document.addEventListener('DOMContentLoaded', function () {
        var b = document.getElementById('themeToggle');
        if (b) b.addEventListener('click', function () { set(current() === 'dark' ? 'light' : 'dark'); });
        syncToggle(); syncMeta();
    });

    window.orogenTheme = {
        current: current,
        set: set,
        /** a token's value, e.g. token('desk') → '#EFEBE1' */
        token: token,
        /** fn(theme) whenever the theme changes, by the switch or by the device */
        onChange: function (fn) { listeners.push(fn); },
    };
})();
