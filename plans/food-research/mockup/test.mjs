// Node check of the toy world: timings, shares, hearths, ASCII maps. Usage: node test.mjs [seed] [roll]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
new Function(readFileSync(path.join(here, 'world.js'), 'utf8'))();
const F = globalThis.FoodWorld;
const seed = +(process.argv[2] ?? 7), roll = +(process.argv[3] ?? 0);
let t0 = performance.now();
const L = F.buildLand(seed); const tLand = performance.now() - t0; t0 = performance.now();
const G = F.buildGround(L); const tGround = performance.now() - t0; t0 = performance.now();
const Hs = F.runHistory(G, roll, true); const tHist = performance.now() - t0;
console.log(`seed ${seed}: land ${tLand.toFixed(0)} ms, ground ${tGround.toFixed(0)} ms, history ${tHist.toFixed(0)} ms (${Hs.events} events)`);
let land = 0; for (let k = 0; k < F.N; k++) if (!L.ocean[k]) land++;
console.log(`land ${(100 * land / F.N).toFixed(1)}%, landmasses ${G.masses.length} (big: ${G.masses.filter(m => m.area > 1e6).map(m => (m.area / 1e6).toFixed(1) + 'M').join(' ')}), regions ${G.regions.length}`);
console.log(`first farming at ${Hs.tFirst.toFixed(0)} yr; centres ${Hs.centres.length} (primary ${Hs.centres.filter(c => c.primary).length})`);
const NAMES = [...F.CROPS, ...F.BEASTS];
for (const C of Hs.centres) console.log(`  ${C.primary ? 'H' : 's'}${C.id + 1} ${C.lat.toFixed(0)},${C.lon.toFixed(0)} +${(C.t0 - Hs.tFirst).toFixed(0)}: ${C.items.map(x => `${NAMES[x.a]}@${(x.t - Hs.tFirst).toFixed(0)}`).join(' ')}`);
console.log('beasts per big landmass:', G.masses.filter(m => m.area > 5e5).map(m => `${(m.area / 1e6).toFixed(1)}M:` + Hs.has[m.id].map((h, b) => h ? F.BEASTS[b][0] : '.').join('')).join('  '));
// reach: the land some crop grows on (fit ≥ 0.3) that farming reached by 10,000 years and at all
{ let fitL = 0, r10 = 0, rAll = 0; for (let c = 0; c < F.HN; c++) { if (!G.land[c]) continue; let f = 0; for (let a = 0; a < 5; a++) f = Math.max(f, G.fit[a][c]); if (f < 0.3) continue; fitL++; const tt = Hs.farmTime[c] - Hs.tFirst; if (tt <= 10000) r10++; if (tt < Infinity) rAll++; }
  console.log(`farmable land reached: ${(100 * r10 / fitL).toFixed(0)}% by 10,000 yr, ${(100 * rAll / fitL).toFixed(0)}% at all; primaries within 10k: ${Hs.centres.filter(c => c.primary && c.t0 - Hs.tFirst <= 10000).length}`); }
// staple shares (best possible)
const foods = new Float32Array(9), o = {}, share = new Float64Array(9);
let tot = 0;
for (let k = 0; k < F.N; k++) { if (L.ocean[k]) continue; const a = F.COS[(k / F.W) | 0]; const st = F.placeFood(L, k, F.TECH_ALL, 31, 1, foods, o); const g = F.gatherAt(L, k); const landP = st === 5 ? 2 * foods[5] / 0.5 : 60 * o.cropV; share[g.people * 10 > landP ? (g.fish > g.wild ? 6 : 7) : st] += a; tot += a; }
console.log('staples (best possible):', ['none', 'rice', 'wheat', 'maize', 'roots', 'herd', 'fish', 'wild', 'tree'].map((s, i) => `${s} ${(100 * share[i] / tot).toFixed(0)}%`).join(', '));
// ASCII
const cols = 144, rows = 48, ch = (f) => { let s = ''; for (let r = 0; r < rows; r++) { let line = ''; for (let c = 0; c < cols; c++) { const j = Math.floor((r + 0.5) * F.H / rows), i = Math.floor((c + 0.5) * F.W / cols); line += f(j * F.W + i, j, i); } s += line + '\n'; } return s; };
console.log(ch(k => { if (L.ocean[k]) return L.ocean[k] && L.distLand[k] < 100 ? '~' : ' '; const st = F.placeFood(L, k, F.TECH_ALL, 31, 1, foods, o); const g = F.gatherAt(L, k); const landP = st === 5 ? 4 * foods[5] : 60 * o.cropV; if (L.tW[k] < 0) return '#'; return g.people * 10 > landP ? (g.fish > g.wild ? 'f' : '.') : ' rwmrhfwT'[st] ?? '?'; }));
console.log(ch((k, j, i) => { if (L.ocean[k]) return ' '; const c = (j >> 1) * F.HW + (i >> 1); for (const C of Hs.centres) if (C.cell === c) return C.primary ? '@' : '*'; const t = Hs.farmTime[c] - Hs.tFirst; return t === Infinity ? '-' : String(Math.min(9, Math.floor(t / 1000))); }));
