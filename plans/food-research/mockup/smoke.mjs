// Runs the page's scripts against a stub DOM: every view, picker and chip, catching runtime errors.
import fs from 'node:fs';
const els = {}, listeners = {};
const mk = id => ({ id, innerHTML: '', textContent: '', hidden: false, value: '10000', style: { setProperty() {} }, offsetWidth: 200, offsetHeight: 100, dataset: {},
  addEventListener(ev, fn) { (listeners[id + ':' + ev] ||= []).push(fn); }, appendChild() {}, focus() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 360 }),
  getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) });
globalThis.window = globalThis;
globalThis.document = { getElementById: id => (els[id] ||= mk(id)), createElement: () => mk('x'), addEventListener(ev, fn) { (listeners['doc:' + ev] ||= []).push(fn); }, activeElement: null };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.setTimeout = (fn) => fn();
new Function(fs.readFileSync('world.js', 'utf8'))();
new Function(fs.readFileSync('names.js', 'utf8'))();
new Function(fs.readFileSync('items.js', 'utf8'))();
new Function(fs.readFileSync('ui.js', 'utf8'))();
const click = (attr, val) => { const target = { closest: sel => (sel === `[${attr}]` ? { dataset: { [attr === 'data-act' ? 'act' : attr === 'data-tab' ? 'tab' : 'sub']: val } } : null) }; listeners['doc:click'].forEach(f => f({ target })); };
const views = ['farmland', 'calendar', 'origins', 'crops', 'staple', 'animals', 'life', 'people'], subs = { farmland: ['farmland', 'soil', 'season'], calendar: ['harvest', 'lean', 'risk'], origins: ['when', 'from', 'larder'], crops: ['fields', 'pulses', 'fruit', 'veg', 'spice', 'other', 'variety'] };
let n = 0;
for (const v of views) { click('data-tab', v); n++; for (const s of subs[v] || []) { click('data-sub', s); n++; } }
click('data-tab', 'crops'); click('data-sub', 'fields'); click('data-act', 'var:0'); click('data-act', 'var:0'); for (const sb of ['pulses', 'fruit', 'spice', 'variety']) { click('data-sub', sb); click('data-act', 'item:' + { pulses: 0, fruit: 40, spice: 100, variety: 150 }[sb]); click('data-act', 'item:' + { pulses: 0, fruit: 40, spice: 100, variety: 150 }[sb]); }
for (const r of ['earth', 'wild', 'balanced']) click('data-act', 'real:' + r);
globalThis.__foodDebug.place(20000); globalThis.__foodDebug.place(-1);
for (const p of ['free', 'strict', 'regional']) click('data-act', 'pull:' + p); click('data-act', 'renames');
for (const a of ['best', 'best', 'full', 'full', 'years10', 'tech:flood', 'classes', 'watered', 'simple', 'scarce', 'staple:8', 'staple:6', 'beast:3', 'larder:2', 'larder:5']) { click('data-act', a); n++; }
click('data-tab', 'origins'); click('data-sub', 'when');
els.yrs.value = '4000'; listeners['yrs:input'].forEach(f => f({ target: els.yrs }));
listeners['reroll:click'].forEach(f => f()); listeners['newworld:click'].forEach(f => f());
// a readout at a few points
for (const [x, y] of [[100, 100], [360, 180], [500, 250], [200, 300]]) listeners['map:pointermove'].forEach(f => f({ clientX: x, clientY: y, pointerType: 'mouse' }));
console.log('ok:', n, 'states; legend chars', els.legend.innerHTML.length, '; readout:', els.readout.innerHTML.replace(/<[^>]+>/g, '').slice(0, 300));
const strip = s => s.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
for (const [x, y] of [[380, 150], [430, 230], [150, 120], [600, 260], [470, 110]]) { listeners['map:pointermove'].forEach(f => f({ clientX: x, clientY: y, pointerType: 'mouse' })); console.log('---', x, y, '\n' + strip(els.readout.innerHTML)); }
for (const v of ['crops']) { click('data-tab', v); console.log('=== legend', v, '\n' + strip(els.legend.innerHTML).slice(0, 900)); }
const dbg = globalThis.__foodDebug, Dd = dbg.D(); let shown = 0;
click('data-tab', 'crops'); click('data-sub', 'fields');
for (let k = 0; k < Dd.fieldVar.length && shown < 4; k += 997) if (dbg.D().fieldVar[k] >= 0) { console.log('+++', strip(dbg.readout(k).join('<br>'))); shown++; }
console.log('=== fields legend\n' + strip(els.legend.innerHTML).slice(0, 1200));
