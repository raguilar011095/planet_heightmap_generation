import { readFileSync } from 'node:fs';
new Function(readFileSync(new URL('./world.js', import.meta.url), 'utf8'))();
const F = globalThis.FoodWorld, seed = +(process.argv[2] ?? 7);
const L = F.buildLand(seed), G = F.buildGround(L), Hs = F.runHistory(G, 0, true);
let t0 = performance.now(); const Mn = F.buildMinor(L, G); const t1 = performance.now(); const Cr = F.runCrops(L, G, Hs, Mn, 0); const t2 = performance.now();
console.log(`minor ${(t1 - t0).toFixed(0)} ms, crops ${(t2 - t1).toFixed(0)} ms; variants ${Cr.variants.length}`);
const T = Hs.tFirst + 10000;
for (const c of Cr.minors) { const M = F.MINOR[c.m]; let fitN = 0, got = 0, all = 0, farmedFit = 0; for (let h = 0; h < F.HN; h++) { if (!G.land[h] || Mn.fit[c.m][h] < 0.25) continue; fitN++; if (c.arrive[h] <= T) got++; if (c.arrive[h] < Infinity) all++; if (Hs.farmTime[h] <= T) farmedFit++; } console.log(`${M.kind.padEnd(7)} ${M.word.padEnd(20)} homes ${c.homes.length} (${c.homes.map(h => (h.t - Hs.tFirst).toFixed(0)).join(',')}) fit cells ${fitN} (farmed by 10k ${farmedFit}) grown 10k ${got} full ${all}`); }
