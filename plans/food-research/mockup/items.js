// Every crop of the catalogue as its own crop: whether this world grew it (by how popular and how nourishing it is on Earth,
// against the realism setting's randomness), where it was first grown (a farmed region that suits it and is like its Earth
// home), and how far it spread — each by itself, so a farming place can grow dozens.
(function (root) {
'use strict';
const F = root.FoodWorld, NM = root.FoodNames;
// realism: how much popularity, nourishment and Earth's geography decide which crops a world grows and where — against chance
const REAL = {
    earth: { pop: 1.6, nut: 0.8, coh: 1.8, noise: 0.3, twice: 0.25, exist: 1.7 },
    balanced: { pop: 1.0, nut: 0.5, coh: 1.1, noise: 0.6, twice: 0.45, exist: 2.0 },
    wild: { pop: 0.12, nut: 0.08, coh: 0.25, noise: 1.4, twice: 0.65, exist: 2.0 },
};
// first grown this long after farming came to its home (years: at least, plus a mean wait)
const DELAY = { pulse: [300, 900], garden: [500, 1200], orchard: [2000, 1500], spice: [1800, 1800], stimulant: [1800, 1800], fibre: [800, 1500] };
const SPEED = { pulse: 0.6, garden: 1.0, orchard: 0.7, spice: 0.3, stimulant: 0.4, fibre: 0.8 };
const PEN = { free: 0, regional: 0.35, strict: 2 };

/** The catalogue's crops (all but the staples), each with its climate fit on the history grid (a byte a cell) — once per world. */
function prepare(Mn) {
    const items = []; let id = 0;
    F.MINOR.forEach((M, m) => (NM.CAT[M.key] || []).forEach(it => {
        const c0 = NM.itemClim(it), own = it.T != null || it.W != null || it.E != null, fit8 = new Uint8Array(F.HN), fm = Mn.fit[m];
        for (let c = 0; c < F.HN; c++) {
            const f = fm[c]; if (!(f > 0.04)) continue;
            let a = 1;
            if (own) { const dT = (Mn.clim.T[c] - c0.T) / 6, dW = Math.log(Math.max(0.03, Mn.clim.W[c]) / Math.max(0.03, c0.W)) / 0.6, dE = (Mn.clim.E[c] - c0.E) / 1.4; a = 0.4 + 0.6 * Math.exp(-0.5 * (dT * dT + dW * dW + dE * dE)); }
            fit8[c] = Math.min(255, Math.round(255 * f * a));
        }
        items.push({ id: id++, m, M, it, kind: M.kind, name: it.n, label: `${it.n}-like`, pop: it.pop ?? 0.5, nut: it.nut ?? 0.5, fit8 });
    }));
    return items;
}

/**
 * Which crops this world grew, where each was first grown and when each place got it.
 * ctx { G, Hs, sites: farmed regions [{region, cells, pkg, pkg2, mass}], seed }; opts { real, pull }.
 * Each item gains: exists, noland (nowhere farmed suits it), homes [{cell, site, t}], arrive (Uint16, years ÷ 10; 65535 never).
 */
function build(items, ctx, opts) {
    const { G, Hs, sites, seed } = ctx, R = REAL[opts.real], pen = PEN[opts.pull], h01 = F.hash01, HN = F.HN, farm = Hs.farmTime;
    const gum = (s, i) => -Math.log(-Math.log(h01(seed, s, i)));
    const { land, river, coast, seaNear } = G;
    for (const I of items) {
        I.homes = []; I.arrive = null; I.exists = false; I.noland = false;
        const cands = [];
        sites.forEach((S, si) => {
            let f = 0, at = -1;
            for (const c of S.cells) if (I.fit8[c] > f) { f = I.fit8[c]; at = c; }
            if (f < 80) return;
            const near = NM.nearItem(I.it, S.pkg, S.pkg2), same = NM.sameWorld(I.it, S.pkg);
            cands.push({ S, si, at, sc: Math.log(f / 255) + R.coh * (near - (same ? 0 : pen)) + R.noise * gum(47, I.id * 512 + si) });
        });
        if (!cands.length) { I.noland = true; continue; }
        // (grown at all: likelier the more popular and nourishing it is on Earth, as the realism weighs them)
        const ex = 1 / (1 + Math.exp(-(R.exist + R.pop * (I.pop - 0.5) * 3 + R.nut * (I.nut - 0.5) * 2)));
        if (!(h01(seed, 43, I.id) < ex)) continue;
        I.exists = true;
        cands.sort((a, b) => b.sc - a.sc);
        const picks = [cands[0]], twin = cands.find(c => c.S.mass !== cands[0].S.mass && c.sc > cands[0].sc - 0.9);
        if (twin && h01(seed, 53, I.id) < R.twice) picks.push(twin);
        const [d0, dm] = DELAY[I.kind];
        I.homes = picks.map((c, j) => ({ cell: c.at, site: c.si, t: c.S.t + d0 + -Math.log(h01(seed, 59, I.id * 4 + j)) * dm }));
        // (the spread: carried between farmers across land it would not grow on — all but the spices, kept near home;
        // a popular crop a little faster)
        const kind = I.kind, spice = kind === 'spice', f8 = I.fit8, base = SPEED[kind] * (1 + 0.6 * Math.min(1, R.pop) * (I.pop - 0.5));
        const sp = (v, t) => {
            if (!land[v]) return seaNear[v] < 280 ? 5 : 0;
            const f = f8[v] / 255, farmed = farm[v] <= t;
            if (farmed && !spice) { let x = base * (kind === 'orchard' ? 5 : 3) * (0.35 + 0.65 * F.sm(0.15, 0.55, f)); if (river[v] || coast[v]) x *= 2; return x; }
            if (f < 0.15) return farm[v] === Infinity ? 0 : (kind === 'pulse' && farmed ? 0.05 : 0.02);
            let x = base * F.sm(0.15, 0.55, f) * (farmed ? 3 : kind === 'pulse' ? 0.8 : 0.12);
            if (river[v] || coast[v]) x *= 2;
            return x;
        };
        const arr = F.spreadFrom(I.homes.map(h => ({ cell: h.cell, t: h.t })), sp, spice ? 900 : Infinity);
        const a16 = new Uint16Array(HN);
        for (let c = 0; c < HN; c++) { const t = arr[c]; a16[c] = t === Infinity ? 65535 : Math.min(65534, Math.max(0, Math.round(t / 10))); }
        I.arrive = a16;
    }
}
root.FoodItems = { prepare, build, REAL };
})(typeof window !== 'undefined' ? window : globalThis);
