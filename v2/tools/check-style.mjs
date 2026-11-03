// The style check: the interface takes its colours from the style guide's tokens (docs/style-guide/, tokens.css).
//
//   node v2/tools/check-style.mjs           check the app's pages, stylesheets and interface JS; exit 1 on a problem
//   node v2/tools/check-style.mjs --hook    as a Claude Code PostToolUse hook (.claude/settings.json): reads the
//                                           tool call on stdin, stays silent unless the edited file is a stylesheet,
//                                           a page or interface JS and something is wrong, then reports (exit 2)
//
// What it checks:
//   1. No literal colour (hex, rgb(), hsl(), a colour name) in a rule of a stylesheet the pages load, outside
//      tokens.css and the block of today's --ui-* roles at the top of styles.css; none in a style attribute or
//      <style> block on the pages either.
//   2. No new --ui-* role: the redesign only retires them (plans/REDESIGN_PLAN.md).
//   3. Every var(--name) without a fallback is defined: in tokens.css, in a stylesheet, or set from JS.
//   4. Interface JS sets no literal colour on an element's style (canvas drawing and map palettes are data, not chrome).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = ['index.html', 'generate.html', 'import.html', 'evolution.html'];
const UI_BEGIN = '/* ── Today’s look, as variables', UI_END = '/* ── end of today’s look ── */';
// The roles R0 made from today's colours. The list only shrinks.
const UI_ROLES = new Set(`page page-studio stage stage-veil well menu panel-75 panel-85 panel-86 panel panel-92 panel-94
panel-96 drop-veil drop-card shadow scrim ink ink-cool ink-soft body body-soft body-cool body-dim label label-cool label-dim
muted muted-grey muted-chip note faint marker faint-2 hint faintest off marker-off white-03 white-04 white-06 white-08
white-10 white-12 white-14 white-15 white-18 white-20 white-25 white-30 white-35 white-40 white-50 action action-deep
action-bar select select-text select-07 select-08 select-15 select-16 select-18 select-22 select-25 select-35 select-45
sky-18 sky-25 sky-28 sky-30 sky-35 sky-45 sky-50 sky-drop navy-40 navy-60 navy-70 navy-80 navy-hover-80 navy-hover-90
navy-on-65 navy-on-75 navy-chip link link-legend link-hover live live-bg amber amber-10 amber-25 stale stale-deep beta
beta-bg beta-note warn sun busy-bg busy-line busy-text note-warm regen regen-deep red error ready ready-deep ready-35
ready-40 ready-50 ready-55 ready-85 finish finish-deep new new-bg farm-text farm-line farm-bg busy-grey
busy-grey-deep`.split(/\s+/).map(n => 'ui-' + n));
const NAMED = 'white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|navy|silver|teal|maroon|olive|lime|' +
    'aqua|fuchsia|cyan|magenta|beige|ivory|tan|coral|salmon|crimson|indigo|violet|khaki|gold';
const COLOUR = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?)\\([^)]*\\)|(?<![-\\w])(?:${NAMED})(?![-\\w])`, 'g');
const JS_STYLE = /\.style\.(?:color|background|backgroundColor|borderColor|border(?:Top|Right|Bottom|Left)?Color|outlineColor|fill|stroke|boxShadow)\s*=\s*(['"`])\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|(?:white|black|red)\b)/;
const UI_JS_DIRS = ['js', 'v2/js/app', 'v2/js/evolution', 'v2/js/view'];
const SKIP_PROPS = /^(--|font|animation|transition|content|grid-template-areas|counter|quotes|will-change)/;

const blank = m => m.replace(/[^\n]/g, ' ');
// comments, url(...), var(...) and strings blanked, so a colour inside them is never read as a rule's colour
const mask = s => s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/url\([^)]*\)/g, blank).replace(/var\([^)]*\)/g, blank)
    .replace(/"[^"\n]*"|'[^'\n]*'/g, blank);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

function rootFrom(start) {
    for (let d = path.resolve(start); ; d = path.dirname(d)) {
        if (fs.existsSync(path.join(d, 'tokens.css')) && fs.existsSync(path.join(d, 'generate.html'))) return d;
        if (path.dirname(d) === d) return null;
    }
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else if (/\.m?js$/.test(e.name)) out.push(p);
    }
    return out;
}

function check(root) {
    const rel = p => path.relative(root, p).split(path.sep).join('/');
    const read = p => fs.readFileSync(path.join(root, p), 'utf8');
    const problems = [];
    const sheets = new Set();
    for (const page of PAGES) {
        const html = read(page);
        for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g))
            if (!/^(https?:)?\/\//.test(m[1])) sheets.add(m[1].replace(/^\//, ''));
        // style attributes and <style> blocks on the pages
        for (const m of html.matchAll(/style="([^"]*)"|<style[^>]*>([\s\S]*?)<\/style>/g)) {
            const body = mask(m[1] ?? m[2]);
            for (const c of body.matchAll(COLOUR))
                problems.push(`${page}:${lineOf(html, m.index)}  literal colour ${c[0]} in ${m[1] != null ? 'a style attribute' : 'a <style> block'}: use a token (var(--…))`);
        }
    }
    sheets.delete('tokens.css');

    const defined = new Set(), used = [];
    const tokens = read('tokens.css');
    for (const m of tokens.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);

    for (const sheet of sheets) {
        const src = read(sheet);
        const masked = mask(src);
        const a = src.indexOf(UI_BEGIN), b = a >= 0 ? src.indexOf(UI_END) + UI_END.length : -1;
        for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) {
            defined.add(m[1]);
            const inBlock = m.index > a && m.index < b;
            if (m[1].startsWith('--ui-') && (!UI_ROLES.has(m[1].slice(2)) || !inBlock || sheet !== 'styles.css'))
                problems.push(`${sheet}:${lineOf(src, m.index)}  new --ui-* role ${m[1]}: the --ui-* roles only retire; use a token from tokens.css`);
        }
        for (const m of src.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) used.push({ name: m[1], fallback: !!m[2], where: `${sheet}:${lineOf(src, m.index)}` });
        for (const blk of masked.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
            let pos = blk.index + blk[1].length + 1;
            for (const decl of blk[2].split(';')) {
                const colon = decl.indexOf(':');
                const prop = colon >= 0 ? decl.slice(0, colon).trim() : '';
                if (colon >= 0 && !SKIP_PROPS.test(prop)) {
                    const at = pos + colon + 1;
                    if (!(sheet === 'styles.css' && at > a && at < b))
                        for (const c of decl.slice(colon + 1).matchAll(COLOUR))
                            problems.push(`${sheet}:${lineOf(src, at + c.index)}  literal colour ${c[0]} in ${prop}: use a token (var(--…)) from tokens.css`);
                }
                pos += decl.length + 1;
            }
        }
    }

    // custom properties set from JS or inline, and literal colours set on elements from interface JS
    const jsFiles = UI_JS_DIRS.flatMap(d => walk(path.join(root, d)));
    for (const f of [...walk(path.join(root, 'js')), ...walk(path.join(root, 'v2', 'js'))]) {
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(/setProperty\(\s*['"`](--[\w-]+)|['"`;\s{](--[\w-]+)\s*:/g)) defined.add(m[1] || m[2]);
    }
    for (const page of PAGES) for (const m of read(page).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    for (const f of jsFiles) {
        const src = fs.readFileSync(f, 'utf8');
        src.split('\n').forEach((line, i) => {
            if (JS_STYLE.test(line)) problems.push(`${rel(f)}:${i + 1}  literal colour set on an element's style: use 'var(--…)'`);
        });
    }
    for (const u of used) if (!u.fallback && !defined.has(u.name)) problems.push(`${u.where}  var(${u.name}) is not defined anywhere (a typo, or a token missing from tokens.css?)`);

    // today's fonts, for the redesign to retire (information, not a problem)
    let legacyFonts = 0;
    for (const sheet of sheets) for (const m of mask(read(sheet)).matchAll(/font-family\s*:\s*([^;}]+)/g))
        if (!/^\s*(inherit|initial|unset)\s*$/.test(m[1])) legacyFonts++;
    return { problems, sheets: [...sheets], used: used.length, jsFiles: jsFiles.length, legacyFonts };
}

const GUIDE = 'The look: docs/style-guide/README.md; the values: tokens.css; the plan: plans/REDESIGN_PLAN.md.';

if (process.argv.includes('--hook')) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    let file = '';
    try { const j = JSON.parse(input); file = j.tool_input?.file_path || j.tool_response?.filePath || ''; } catch { process.exit(0); }
    const root = file && rootFrom(path.dirname(file));
    if (!root) process.exit(0);
    const r = path.relative(root, path.resolve(file)).split(path.sep).join('/');
    const relevant = /\.css$/.test(r) || PAGES.includes(r) || /^(js|v2\/js)\/.*\.m?js$/.test(r);
    if (!relevant || r.startsWith('docs/')) process.exit(0);
    const { problems } = check(root);
    if (!problems.length) process.exit(0);
    process.stderr.write(`Style check: ${problems.length} problem${problems.length > 1 ? 's' : ''} after editing ${r}\n` +
        problems.slice(0, 15).map(p => '  ' + p).join('\n') + (problems.length > 15 ? `\n  … and ${problems.length - 15} more (node v2/tools/check-style.mjs)` : '') +
        `\n${GUIDE}\n`);
    process.exit(2);
} else {
    const root = rootFrom(path.dirname(fileURLToPath(import.meta.url)));
    const { problems, sheets, used, jsFiles, legacyFonts } = check(root);
    console.log(`Stylesheets the pages load: ${sheets.join(', ')} (plus tokens.css)`);
    console.log(`var() uses checked: ${used}; interface JS files checked: ${jsFiles}`);
    console.log(`Today's font-family declarations, for the redesign to move onto --font-*: ${legacyFonts}`);
    if (problems.length) { console.log(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:`); for (const p of problems) console.log('  ' + p); console.log('\n' + GUIDE); }
    console.log(problems.length ? 'FAIL' : 'PASS');
    process.exit(problems.length ? 1 : 0);
}
