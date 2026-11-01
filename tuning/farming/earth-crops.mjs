// The crops beyond the staples on the farmed Earth (earth-world.mjs; farming/minor.js through farming-store.js minorOf): how
// far each spread — its share of the farmed land 10,000 years after the first farming and at the full spread, each kind's
// spread of shares, the widest and the narrowest, its homes — for weighing the spread's speeds, reaches and crowding
// (developer, 2026-11-01: "some are very restrained and some are very commonly spread").
// Usage: node tuning/farming/earth-crops.mjs [--rolls N] [--list kind]   (N re-rolls of the history, default 3)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { earthWorld } from './earth-world.mjs';
import { minorOf, minorAgeOf } from '../../v2/js/evolution/farming-store.js';
import { MINOR, KINDS, GROWN_FIT, ARRIVE_NEVER, arriveByte } from '../../v2/js/farming/minor.js';

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

/** How patchy each grown crop is at an age (years; Infinity the full spread): the share of the land it grows on in patches
 *  (8-neighbour, on the 1° grid) holding none of its homes — got to by jumping a gap — and its patches' count. */
export function cropPatches(M, age) {
    const Gm = M.Gm, { w, h, N } = Gm, ab = age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(age), out = [];
    const comp = new Int32Array(N), stack = [];
    for (const I of M.items) {
        const B = M.built[I.id];
        if (!B.exists) continue;
        const on = c => Gm.land[c] && I.fit8[c] >= GROWN_FIT && B.arrive[c] <= ab && M.farm[c] <= age && M.farm[c] < Infinity;
        comp.fill(-1);
        let n = 0, total = 0, homeArea = 0;
        const homes = new Set(B.homes.map(hm => hm.cell));
        for (let c0 = 0; c0 < N; c0++) {
            if (comp[c0] >= 0 || !on(c0)) continue;
            let area = 0, home = false;
            comp[c0] = n; stack.push(c0);
            while (stack.length) {
                const c = stack.pop(), j = (c / w) | 0, i = c - j * w;
                area += Gm.area[c]; if (homes.has(c)) home = true;
                for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) { const q = jj * w + (i + di + w) % w; if (comp[q] < 0 && on(q)) { comp[q] = n; stack.push(q); } } }
            }
            n++; total += area; if (home) homeArea += area;
        }
        if (total > 0) out.push({ I, patches: n, leak: 1 - homeArea / total });
    }
    return out;
}

/** Each grown crop's share of the farmed land (its 1° cells farmed by then) at 10,000 years and at the full spread, over
 *  `rolls` re-rolls: [{ I, k10, full, homes, rolls }]. */
export function cropSpreads(fin, rolls = 3) {
    const per = new Map();
    for (let roll = 0; roll < rolls; roll++) {
        const M = minorOf(fin, roll, false);
        if (!M) return null;
        for (const [age, key] of [[10000, 'k10'], [Infinity, 'full']]) {
            const A = minorAgeOf(M, age), Gm = M.Gm;
            // (the farmed land by then, the share's denominator)
            let farmed = 0, land = 0;
            for (let c = 0; c < Gm.N; c++) if (Gm.land[c]) { land += Gm.area[c]; if (M.farm[c] <= age && M.farm[c] < Infinity) farmed += Gm.area[c]; }
            for (const I of M.items) {
                if (!M.built[I.id].exists) continue;
                const e = per.get(I.id) ?? { I, k10: 0, full: 0, homes: 0, rolls: 0, farmedK10: 0 };
                e[key] += A.share[I.id] * land / Math.max(1, farmed);
                if (key === 'k10') { e.rolls++; e.homes += M.built[I.id].homes.length; }
                per.set(I.id, e);
            }
        }
    }
    return [...per.values()].map(e => ({ ...e, k10: e.k10 / e.rolls, full: e.full / e.rolls, homes: e.homes / e.rolls }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), rolls = args.includes('--rolls') ? +args[args.indexOf('--rolls') + 1] : 3, only = args.includes('--list') ? args[args.indexOf('--list') + 1] : null;
    const E = earthWorld();
    if (!E) { console.log('No Earth reference climate: run node tuning/climate/fetch-references.mjs first'); process.exit(0); }
    const t0 = performance.now(), S = cropSpreads(E.fin, rolls);
    console.log(`${S.length} crops grown (mean of ${rolls} rolls) in ${((performance.now() - t0) / 1000).toFixed(1)} s — shares of the land farmed by then`);
    const pc = v => `${(100 * v).toFixed(1).padStart(5)} %`;
    console.log(`  ${'kind'.padEnd(26)} n    10,000 years: p10 · median · p90 · max      full spread: median · max`);
    for (const K of KINDS) {
        const L = S.filter(e => MINOR[e.I.m].kind === K.key);
        if (!L.length) continue;
        console.log(`  ${K.word.padEnd(26)} ${String(L.length).padStart(3)}  ${pc(q(L.map(e => e.k10), 0.1))} ${pc(q(L.map(e => e.k10), 0.5))} ${pc(q(L.map(e => e.k10), 0.9))} ${pc(Math.max(...L.map(e => e.k10)))}    ${pc(q(L.map(e => e.full), 0.5))} ${pc(Math.max(...L.map(e => e.full)))}`);
    }
    console.log('  by niche (MINOR):');
    for (let m = 0; m < MINOR.length; m++) {
        const L = S.filter(e => e.I.m === m);
        if (!L.length) continue;
        console.log(`    ${MINOR[m].word.padEnd(24)} ${String(L.length).padStart(3)}  median ${pc(q(L.map(e => e.k10), 0.5))} · max ${pc(Math.max(...L.map(e => e.k10)))} (${L.reduce((a, e) => (e.k10 > a.k10 ? e : a)).I.label}) · min ${pc(Math.min(...L.map(e => e.k10)))} (${L.reduce((a, e) => (e.k10 < a.k10 ? e : a)).I.label})`);
    }
    // (how many crops a farming place grows, the staples too — minor.js minorAt's variety)
    for (const [age, w] of [[10000, '10,000 years'], [Infinity, 'full spread']]) {
        const M = minorOf(E.fin, 0, false), A = minorAgeOf(M, age), v = [];
        for (let c = 0; c < M.Gm.N; c++) if (M.Gm.land[c] && M.farm[c] <= age && M.farm[c] < Infinity) v.push(A.variety[c]);
        console.log(`  crops a farming place grows at ${w}: median ${q(v, 0.5)} · p90 ${q(v, 0.9)} · max ${Math.max(...v)}`);
    }
    // (patchiness: the share of each crop's land in patches without a home of its own)
    for (const [age, wd] of [[10000, '10,000 years'], [Infinity, 'full spread']]) {
        const P = cropPatches(minorOf(E.fin, 0, false), age);
        console.log(`  patchiness at ${wd}: median ${q(P.map(x => x.patches), 0.5)} patches a crop · land in patches with no home: median ${(100 * q(P.map(x => x.leak), 0.5)).toFixed(0)} %, p90 ${(100 * q(P.map(x => x.leak), 0.9)).toFixed(0)} %`);
        if (args.includes('--patchy')) for (const K of KINDS) { const L = P.filter(x => MINOR[x.I.m].kind === K.key); if (L.length) console.log(`    ${K.word.padEnd(22)} leak median ${(100 * q(L.map(x => x.leak), 0.5)).toFixed(0)} % · patches ${q(L.map(x => x.patches), 0.5)}`); }
    }
    const sorted = [...S].sort((a, b) => b.k10 - a.k10);
    console.log(`  the widest at 10,000 years: ${sorted.slice(0, 15).map(e => `${e.I.label} ${(100 * e.k10).toFixed(0)} %`).join(' · ')}`);
    console.log(`  the narrowest: ${sorted.slice(-15).map(e => `${e.I.label} ${(100 * e.k10).toFixed(1)} %`).join(' · ')}`);
    if (only) for (const e of sorted.filter(e => MINOR[e.I.m].kind === only || MINOR[e.I.m].key === only)) console.log(`    ${e.I.label.padEnd(28)} ${pc(e.k10)} ${pc(e.full)} · homes ${e.homes.toFixed(1)} · pop ${e.I.pop.toFixed(2)}`);
}
