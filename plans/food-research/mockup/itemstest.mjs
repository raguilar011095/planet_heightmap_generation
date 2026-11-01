import { readFileSync } from 'node:fs';
for (const f of ['world.js', 'names.js', 'items.js']) new Function(readFileSync(new URL('./' + f, import.meta.url), 'utf8'))();
const F = globalThis.FoodWorld, NM = globalThis.FoodNames, IT = globalThis.FoodItems;
const seed = +(process.argv[2] ?? 7), real = process.argv[3] ?? 'balanced';
const L = F.buildLand(seed), G = F.buildGround(L), Hs = F.runHistory(G, 0, true), Mn = F.buildMinor(L, G);
let t0 = performance.now(); const items = IT.prepare(Mn); const tPrep = performance.now() - t0;
// sites: the farmed crop regions, each with its cells (~330 km) and an Earth likeness
const sites = G.regions.filter(R => !R.beastOnly && Hs.farmTime[R.cell] < Infinity).map(R => {
  const J = (R.cell / F.HW) | 0, I = R.cell % F.HW, cells = [];
  for (let dj = -3; dj <= 3; dj++) { const jj = J + dj; if (jj < 0 || jj >= F.HH) continue; const span = Math.min(F.HW / 2, Math.round(3 / Math.max(0.2, Math.cos((90 - jj - 0.5) * Math.PI / 180)))); for (let di = -span; di <= span; di++) { const m = jj * F.HW + ((I + di + F.HW) % F.HW); if (G.land[m]) cells.push(m); } }
  return { region: R, cells, lat: R.lat, lon: R.lon, mass: R.mass, h: F.regionClimate(G, Mn, R), t: Hs.farmTime[R.cell] };
});
const { pkg, second } = NM.choosePackages(sites, 'regional', 99, F.hash01); sites.forEach((s, i) => { s.pkg = pkg[i]; s.pkg2 = second[i]; });
t0 = performance.now(); IT.build(items, { G, Hs, sites, seed: 4242 }, { real, pull: 'regional' }); const tBuild = performance.now() - t0;
const byKind = {}; for (const I of items) { const k = (byKind[I.kind] ||= { n: 0, ex: 0, noland: 0 }); k.n++; if (I.exists) k.ex++; if (I.noland) k.noland++; }
console.log(`seed ${seed} ${real}: ${items.length} crops, prepare ${tPrep.toFixed(0)} ms, build ${tBuild.toFixed(0)} ms, sites ${sites.length}`);
console.log(Object.entries(byKind).map(([k, v]) => `${k} ${v.ex}/${v.n} (no land ${v.noland})`).join(' · '));
// how many crops a farmed place grows by 10,000 years
const T10 = Math.floor((Hs.tFirst + 10000) / 10); let sum = 0, n = 0, mx = 0;
for (let c = 0; c < F.HN; c++) { if (!(Hs.farmTime[c] <= Hs.tFirst + 10000)) continue; let k = 0; for (const I of items) if (I.exists && I.arrive[c] <= T10 && I.fit8[c] >= 77) k++; sum += k; n++; mx = Math.max(mx, k); }
console.log(`farmed cells ${n}: mean ${(sum / n).toFixed(1)} crops, max ${mx}`);
const top = items.filter(I => I.exists).map(I => { let k = 0; for (let c = 0; c < F.HN; c++) if (I.arrive[c] <= T10 && I.fit8[c] >= 77) k++; return [I.label, k, NM.KEYS[sites[I.homes[0].site].pkg]]; }).sort((a, b) => b[1] - a[1]);
console.log('widest:', top.slice(0, 12).map(x => `${x[0]} ${x[1]} (${x[2]})`).join(', '));
console.log('narrowest:', top.slice(-8).map(x => `${x[0]} ${x[1]}`).join(', '));
