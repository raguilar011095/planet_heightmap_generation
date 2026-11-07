// Keyboard and screen-reader basics every tool page shares (Generate, Import, Evolution), loaded by each page after its
// own module: the dialogs, the "?" tips, and the names and values of the panel's controls. It reads the pages as they
// are — the overlays opened and closed by their own code (the class `hidden`), the tips as <span class="tip"
// data-tip="…"> — so no page needs to call it, and controls made later (the export panel's rows) are covered too.
//
// The dialogs (the tutorial, What's New, the survey, the export panel): a dialog by role, named, out of reach while
// closed (inert); opened, focus moves onto it and Tab stays in it; closed, focus goes back to what opened it.
// The tips: each "?" a button the keyboard reaches, named "About <its control>", its words its description; its
// words show beside it (above it on a phone, never off the screen) on hover, on focus or on a tap, and Escape hides them.

const $ = (id) => document.getElementById(id);
const narrow = matchMedia('(max-width: 768px)');
const FOCUSABLE = 'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

// ── the dialogs ──
function wireDialog(overlay, card, name) {
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.tabIndex = -1;
    const head = card.querySelector('h3');
    if (name) card.setAttribute('aria-label', name);
    else if (head) { head.id ||= `${overlay.id}Title`; card.setAttribute('aria-labelledby', head.id); }
    for (const b of card.querySelectorAll('button')) if (!b.hasAttribute('aria-label') && b.textContent.trim() === '×') b.setAttribute('aria-label', 'Close');
    const isOpen = () => !overlay.classList.contains('hidden');
    let wasOpen = false, opener = null;
    const sync = () => {
        const open = isOpen();
        overlay.inert = !open;
        if (open && !wasOpen) {
            const a = document.activeElement;
            opener = a && a !== document.body && !overlay.contains(a) ? a : null;
            card.focus({ preventScroll: true });
        } else if (!open && wasOpen) {
            const a = document.activeElement;
            if (opener?.isConnected && (!a || a === document.body || overlay.contains(a))) opener.focus({ preventScroll: true });
            opener = null;
        }
        wasOpen = open;
    };
    new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    sync();
    // (Tab and Shift-Tab go round the dialog's own controls)
    overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || !isOpen()) return;
        const list = [...card.querySelectorAll(FOCUSABLE)].filter(shown);
        if (!list.length) { e.preventDefault(); return; }
        const first = list[0], last = list[list.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || a === card)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    });
    // (focus never wanders behind an open dialog)
    document.addEventListener('focusin', (e) => { if (isOpen() && !overlay.contains(e.target) && !e.target.closest?.('#tipPop')) card.focus({ preventScroll: true }); });
}

function wireDialogs() {
    const help = $('helpBtn');
    for (const [o, c, name] of [['tutorialOverlay', 'tutorialCard', help?.title || 'Tutorial'], ['whatsNewOverlay', 'whatsNewCard', "What's new"],
        ['surveyOverlay', 'surveyCard', null], ['exportOverlay', 'exportCard', null]]) {
        const overlay = $(o), card = $(c);
        if (overlay && card) wireDialog(overlay, card, name);
    }
}

// ── the tips ──
/** The words a tip explains: its label's, summary's or row's own text, without the tip or the value beside it. */
function subjectOf(tip) {
    const host = tip.closest('label, summary, .xp-name') || tip.parentElement;
    let text = '';
    for (const n of host.childNodes) {
        if (n === tip || (n.nodeType === 1 && (n.matches('.tip, .v, small, .xp-sun') || n.contains(tip)))) {
            if (n.nodeType === 1 && n !== tip && n.contains(tip)) text += ` ${[...n.childNodes].filter(m => m.nodeType === 3).map(m => m.textContent).join(' ')}`;
            continue;
        }
        text += ` ${n.textContent}`;
    }
    return text.replace(/\s+/g, ' ').trim();
}

let tipSeq = 0;
function enhanceTip(tip, texts) {
    if (tip.dataset.tipOn) return;
    tip.dataset.tipOn = '1';
    tip.tabIndex = 0;
    tip.setAttribute('role', 'button');
    const subject = subjectOf(tip);
    tip.setAttribute('aria-label', subject ? `About ${subject}` : 'About this');
    const d = document.createElement('span');
    d.id = `tipText${++tipSeq}`; d.textContent = tip.dataset.tip;
    texts.appendChild(d);
    tip.setAttribute('aria-describedby', d.id);
    // (a section's head: named by its own words, the tip's as its description — not "Climate About Climate")
    const head = tip.closest('summary');
    if (head && subject && !head.hasAttribute('aria-label')) { head.setAttribute('aria-label', subject); head.setAttribute('aria-describedby', d.id); }
}

function wireTips() {
    const pop = document.createElement('div');
    pop.id = 'tipPop'; pop.className = 'tip-pop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
    const texts = document.createElement('div');
    texts.hidden = true;
    document.body.append(pop, texts);
    let current = null, hideTimer = 0, openedAt = 0;
    const place = (tip) => {
        const r = tip.getBoundingClientRect(), W = innerWidth, H = innerHeight, m = 8;
        pop.style.width = `${Math.min(260, W - 2 * m)}px`;
        const w = pop.offsetWidth, h = pop.offsetHeight;
        let left, top;
        if (!narrow.matches && r.right + m + w <= W - m) { left = r.right + m; top = r.top + r.height / 2 - h / 2; }      // (beside it)
        else if (!narrow.matches && r.left - m - w >= m) { left = r.left - m - w; top = r.top + r.height / 2 - h / 2; }
        else {                                                                                                             // (above it: a phone)
            left = r.left + r.width / 2 - w / 2; top = r.top - m - h;
            if (top < m) top = r.bottom + m;
        }
        pop.style.left = `${Math.round(Math.max(m, Math.min(W - m - w, left)))}px`;
        pop.style.top = `${Math.round(Math.max(m, Math.min(H - m - h, top)))}px`;
    };
    const show = (tip) => {
        clearTimeout(hideTimer);
        if (current && current !== tip) current.classList.remove('is-open');
        if (current !== tip) openedAt = performance.now();
        current = tip; tip.classList.add('is-open');
        pop.textContent = tip.dataset.tip; pop.hidden = false;
        place(tip);
    };
    const hide = () => { clearTimeout(hideTimer); if (current) current.classList.remove('is-open'); current = null; pop.hidden = true; };
    const hideSoon = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 150); };
    const tipOf = (e) => e.target.closest?.('.tip[data-tip]');
    // a mouse: over the tip (or its words, so they can be read and copied)
    document.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') { const t = tipOf(e); if (t) show(t); else if (e.target === pop || pop.contains(e.target)) clearTimeout(hideTimer); } });
    document.addEventListener('pointerout', (e) => {
        if (e.pointerType !== 'mouse' || !current) return;
        const to = e.relatedTarget;
        if ((tipOf(e) || e.target === pop) && !(to && (to === pop || pop.contains(to) || to.closest?.('.tip') === current))) hideSoon();
    });
    // the keyboard: focus shows it, Enter or Space too
    document.addEventListener('focusin', (e) => { const t = tipOf(e); if (t) show(t); });
    document.addEventListener('focusout', (e) => { if (tipOf(e) === current) hide(); });
    // a tap or a click: shows or hides it — and does nothing else (not the label's control, not the section's fold)
    document.addEventListener('click', (e) => {
        const t = tipOf(e);
        // (a tap focuses the tip first, which shows it: that same tap must not hide it again)
        if (t) { e.preventDefault(); e.stopPropagation(); if (current === t && e.pointerType !== 'mouse' && performance.now() - openedAt > 400) hide(); else show(t); return; }
        if (current && !pop.contains(e.target)) hide();
    }, true);
    document.addEventListener('keydown', (e) => {
        const t = tipOf(e);
        if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (current === t) hide(); else show(t); return; }
        // (Escape hides the words first: the dialog under them stays open)
        if (e.key === 'Escape' && current) { hide(); e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    // (the panel scrolled, the window resized: the words follow their tip, and go when it leaves the window)
    const follow = () => {
        if (!current) return;
        const r = current.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > innerHeight) hide(); else place(current);
    };
    addEventListener('scroll', follow, true);
    addEventListener('resize', follow);
    // every tip, those on the page and those made later
    const enhanceIn = (root) => { if (root.matches?.('.tip[data-tip]')) enhanceTip(root, texts); root.querySelectorAll?.('.tip[data-tip]').forEach((t) => enhanceTip(t, texts)); };
    enhanceIn(document.body);
    return enhanceIn;
}

// ── the panel's controls: names from their labels, sliders' values as shown ──
/** A label's own words: its text, without its tip and its value. */
function ownWords(label) {
    return [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
}
function nameControls(root) {
    for (const cg of root.querySelectorAll?.('.cg') ?? []) {
        const label = cg.querySelector(':scope > label');
        const ctl = [...cg.querySelectorAll('input:not([type="hidden"]), select')].find((c) => !label?.contains(c));
        if (!label || !ctl || ctl.hasAttribute('aria-label') || ctl.hasAttribute('aria-labelledby') || ctl.labels?.length) continue;
        const words = ownWords(label);
        if (words) ctl.setAttribute('aria-label', words);
    }
    // a slider's value, as its label shows it (Detail's 204,000, not the slider's 600)
    for (const s of root.querySelectorAll?.('input[type="range"]') ?? []) {
        if (s.dataset.valueOn) continue;
        const v = s.closest('.cg')?.querySelector('.v') || (s.id ? $(s.id.replace(/^s/, 'v')) : null);
        if (!v || v === s) continue;
        s.dataset.valueOn = '1';
        const sync = () => { const t = v.textContent.trim(); if (t) s.setAttribute('aria-valuetext', t); };
        new MutationObserver(sync).observe(v, { childList: true, characterData: true, subtree: true });
        sync();
    }
}

/** The side panel's fold button: its name and state follow the panel (Evolution's code only folds it). */
function wirePanelToggle() {
    const ui = $('ui'), t = $('sidebarToggle');
    if (!ui || !t) return;
    const sync = () => {
        const folded = ui.classList.contains('collapsed'), words = folded ? 'Show panel' : 'Collapse panel';
        t.setAttribute('aria-label', words); t.title = words; t.setAttribute('aria-expanded', String(!folded));
        const glyph = folded ? '»' : '«';
        if (t.textContent !== glyph) t.textContent = glyph;
    };
    new MutationObserver(sync).observe(ui, { attributes: true, attributeFilter: ['class'] });
    sync();
}

function wire() {
    wireDialogs();
    const enhanceTips = wireTips();
    nameControls(document);
    wirePanelToggle();
    // (what the pages make later: the export panel's rows, a projection's options)
    let queued = new Set();
    new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && n.id !== 'tipPop') queued.add(n);
        if (!queued.size) return;
        const nodes = queued; queued = new Set();
        for (const n of nodes) { if (!n.isConnected) continue; enhanceTips(n); if (n.querySelector?.('.cg, input[type="range"]') || n.matches?.('.cg')) nameControls(n.matches?.('.cg') ? n.parentElement : n); }
    }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
else wire();
