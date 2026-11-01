import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./world.js', import.meta.url), 'utf8');
const [rate, base, rc, thru] = process.argv.slice(2).map(Number);
globalThis.FoodTune = { rate, base, rc, thru };
new Function(src)();
const F = globalThis.FoodWorld; const out = [];
for (const seed of [7, 11, 23, 42, 5, 99]) {
  const L = F.buildLand(seed), G = F.buildGround(L), Hs = F.runHistory(G, 0, true);
  let fitL = 0, r10 = 0, r5 = 0; for (let c = 0; c < F.HN; c++) { if (!G.land[c]) continue; let f = 0; for (let a = 0; a < 5; a++) f = Math.max(f, G.fit[a][c]); if (f < 0.3) continue; fitL++; const tt = Hs.farmTime[c] - Hs.tFirst; if (tt <= 10000) r10++; if (tt <= 5000) r5++; }
  const prim = Hs.centres.filter(c => c.primary && c.t0 - Hs.tFirst <= 10000);
  const band = prim.map(c => Math.abs(c.lat) >= 25 ? 'M' : 'T').join('');
  const founders = prim.map(c => 'RWMrT'[c.items.find(x => x.a < 5).a]).join('');
  out.push(`${seed}: prim ${prim.length} [${band}|${founders}] sec ${Hs.centres.length - Hs.centres.filter(c => c.primary).length} reach5k ${(100 * r5 / fitL).toFixed(0)}% 10k ${(100 * r10 / fitL).toFixed(0)}%`);
}
console.log(`rate ${rate} base ${base} rc ${rc} thru ${thru}\n  ` + out.join('\n  '));
