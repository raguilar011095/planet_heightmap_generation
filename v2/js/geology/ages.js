// Resources by technological age (plans/V2_GEOLOGY_PLAN.md G5; Madeline James's Part 12: one map per age — "what a people of
// that age could actually reach"): Stone, Copper, Bronze, Iron, Industrial, and Fuel. Each age reads the finished moment's
// deposits (deposits.js: each kind's richness on the finish's grid) through its technology — its REACH (the surface only
// at first; pits and shafts to ~100 m; then deeper; a kilometre down and bulk low-grade ore in the Industrial Age) and its
// CUT-OFF (an early age wants rich ore: only the part of a deposit's richness above its cut-off counts). So the same
// porphyry copper is nothing to the Copper Age, its enriched cap a little to the Bronze Age, and a rich mine to the
// Industrial. And her two potentials: where bronze could be made (copper, tin or arsenic within reach, wood to burn) and
// iron (ore beside fuel). Her gems (G7) and building stone are two more maps of the same kind. Everything here works on
// the deposits' grid — the page and the checks alike.

import { DEPOSITS, DEPOSIT_INDEX, METALS } from './deposits.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const SALT = { id: 'salt', name: 'Salt', rgb: [244, 238, 250], from: [['salt', 1]] };
const BITUMEN = { id: 'bitumen', name: 'Bitumen', rgb: [110, 86, 64], from: [['bitumen', 1], ['oil', 0.5, 0.5]] };

/** The ages. Each resource: [the kind of deposit (or 'm:' and a metal: all its sources), its weight, its cut-off]. */
export const AGES = [
    { id: 'stone', name: 'Stone Age', words: 'stone for tools and edges — flint, obsidian, jade, agate — salt, and bitumen to haft them', resources: [
        { id: 'flint', name: 'Flint', rgb: [92, 140, 214], from: [['flint', 1]] },
        { id: 'obsidian', name: 'Obsidian', rgb: [96, 72, 132], from: [['obsidian', 1]] },
        { id: 'jade', name: 'Jade', rgb: [90, 176, 120], from: [['jade', 1]] },
        { id: 'agate', name: 'Agate', rgb: [210, 124, 90], from: [['agate', 1]] },
        SALT, BITUMEN] },
    { id: 'copper', name: 'Copper Age', words: 'only what lies at the surface: native copper, the green and rusty caps of ore bodies, gold in the rivers', resources: [
        { id: 'copper', name: 'Copper', rgb: [226, 128, 56], from: [['nativeCopper', 1], ['supergene', 0.9, 0.25], ['gossan', 0.5, 0.3]] },
        { id: 'gold', name: 'Gold', rgb: [246, 206, 64], from: [['placerGold', 1], ['gossan', 0.6, 0.3], ['epithermal', 0.5, 0.4]] },
        { id: 'silver', name: 'Silver', rgb: [196, 206, 224], from: [['gossan', 0.6, 0.3], ['supergene', 0.4, 0.4], ['epithermal', 0.4, 0.4]] },
        SALT, BITUMEN] },
    { id: 'bronze', name: 'Bronze Age', words: 'pits and shafts to a hundred metres, rich ore only — copper from sea-floor sulfides first; tin where it can be found, or arsenic', resources: [
        { id: 'copper', name: 'Copper', rgb: [226, 128, 56], from: [['vms', 1, 0.3], ['supergene', 1, 0.2], ['skarn', 0.8, 0.3], ['nativeCopper', 0.8], ['sedex', 0.4, 0.4], ['porphyry', 0.6, 0.45], ['iocg', 0.5, 0.45]] },
        { id: 'tin', name: 'Tin', rgb: [80, 200, 210], from: [['placerTin', 1], ['tin', 0.8, 0.2]] },
        { id: 'arsenic', name: 'Arsenic', rgb: [176, 196, 120], from: [['epithermal', 0.6, 0.3], ['vms', 0.5, 0.3], ['porphyry', 0.4, 0.4], ['skarn', 0.4, 0.3]] },
        { id: 'leadSilver', name: 'Lead and silver', rgb: [140, 148, 214], from: [['mvt', 1, 0.3], ['sedex', 1, 0.3], ['epithermal', 0.6, 0.3], ['gossan', 0.4, 0.3]] },
        { id: 'gold', name: 'Gold', rgb: [246, 206, 64], from: [['placerGold', 1], ['epithermal', 0.8, 0.3], ['orogenicGold', 0.6, 0.35], ['gossan', 0.5, 0.3]] },
        SALT],
        potential: { id: 'bronze', name: 'Bronze', rgb: [214, 150, 70], words: 'copper here, tin (or, poorer, arsenic) within ~600 km, wood to burn' } },
    { id: 'iron', name: 'Iron Age', words: 'iron where it lies in bogs, beds and crusts — what an Iron Age needs is fuel; the other metals from deeper workings', resources: [
        { id: 'iron', name: 'Iron', rgb: [200, 84, 60], from: [['bogIron', 1], ['ironstone', 1, 0.15], ['ironLaterite', 1, 0.15], ['skarn', 0.6, 0.3], ['bif', 0.5, 0.3]] },
        { id: 'copper', name: 'Copper', rgb: [226, 128, 56], from: [['vms', 1, 0.2], ['supergene', 1, 0.15], ['skarn', 0.8, 0.2], ['porphyry', 0.7, 0.35], ['sedex', 0.5, 0.3], ['iocg', 0.6, 0.35], ['nativeCopper', 0.8]] },
        { id: 'tin', name: 'Tin', rgb: [80, 200, 210], from: [['placerTin', 1], ['tin', 0.9, 0.15]] },
        { id: 'leadZinc', name: 'Lead, zinc and silver', rgb: [140, 148, 214], from: [['mvt', 1, 0.2], ['sedex', 1, 0.2], ['vms', 0.5, 0.3], ['epithermal', 0.5, 0.25]] },
        { id: 'gold', name: 'Gold', rgb: [246, 206, 64], from: [['placerGold', 1], ['epithermal', 1, 0.2], ['orogenicGold', 0.8, 0.25], ['greenstoneGold', 0.7, 0.3]] },
        SALT],
        potential: { id: 'iron', name: 'Ironworking', rgb: [168, 92, 72], words: 'iron ore here, wood or coal to burn within ~150 km' } },
    { id: 'industrial', name: 'Industrial Age', words: 'a kilometre down and low-grade ore in bulk — porphyry copper, banded iron, bauxite, nickel, oil and gas', resources: [
        ...['iron', 'copper', 'gold', 'silver', 'tin', 'leadZinc', 'aluminium', 'nickel', 'platinum', 'diamonds'].map(id => { const m = METALS.find(x => x.id === id); return { id, name: m.name, rgb: m.rgb, from: [['m:' + id, 1]] }; }),
        { id: 'coal', name: 'Coal', rgb: [64, 58, 58], from: [['m:coal', 1]] },
        { id: 'oilGas', name: 'Oil and gas', rgb: [90, 120, 170], from: [['m:oilGas', 1]], offshore: true }] },
    { id: 'fuel', name: 'Fuel', words: 'wood for fire and charcoal, peat, and coal where erosion bares its seams', resources: [
        { id: 'wood', name: 'Wood', rgb: [70, 140, 70], from: [['wood', 1]] },
        { id: 'peat', name: 'Peat', rgb: [130, 104, 70], from: [['peat', 1]] },
        { id: 'coal', name: 'Coal', rgb: [64, 58, 58], from: [['coal', 1, 0.2]] }] },
    // (G7: her gems — kimberlite, pegmatite, metamorphic, sedimentary and placer gems; and her building stone)
    { id: 'gems', name: 'Gems', words: 'diamonds from kimberlite pipes; gems of pegmatites, of marble and schist, of basalts and the dry country — and the river gravels below them', resources: [
        { id: 'diamonds', name: 'Diamonds', rgb: [232, 240, 250], from: [['kimberlite', 1], ['placerDiamond', 1]] },
        { id: 'rubySapphire', name: 'Rubies and sapphires', rgb: [214, 40, 90], from: [['corundum', 1], ['basaltGems', 0.8], ['gemPlacer', 0.8]] },
        { id: 'emerald', name: 'Emeralds', rgb: [40, 180, 100], from: [['emerald', 1]] },
        { id: 'pegmatite', name: 'Aquamarine, tourmaline, topaz', rgb: [120, 170, 240], from: [['pegmatite', 1], ['gemPlacer', 0.4]] },
        { id: 'opal', name: 'Opal', rgb: [246, 160, 96], from: [['opal', 1]] },
        { id: 'turquoise', name: 'Turquoise', rgb: [56, 196, 176], from: [['turquoise', 1]] },
        { id: 'lapis', name: 'Lapis lazuli', rgb: [50, 70, 190], from: [['lapis', 1]] },
        { id: 'amethyst', name: 'Amethyst', rgb: [160, 90, 210], from: [['amethyst', 1]] },
        { id: 'jade', name: 'Jade', rgb: [150, 196, 140], from: [['jade', 1]] },
        { id: 'garnet', name: 'Garnet', rgb: [128, 28, 36], from: [['garnet', 1], ['gemPlacer', 0.5]] }] },
    { id: 'building', name: 'Building stone', words: 'stone to build with — limestone (and lime for mortar), sandstone, granite, marble, slate — and clay for brick where stone is scarce', resources: [
        { id: 'limestone', name: 'Limestone', rgb: [130, 170, 220], from: [['stoneLimestone', 1]] },
        { id: 'sandstone', name: 'Sandstone', rgb: [222, 182, 112], from: [['stoneSandstone', 1]] },
        { id: 'granite', name: 'Granite', rgb: [214, 120, 120], from: [['stoneGranite', 1]] },
        { id: 'marble', name: 'Marble', rgb: [240, 238, 230], from: [['stoneMarble', 1]] },
        { id: 'slate', name: 'Slate', rgb: [96, 106, 128], from: [['stoneSlate', 1]] },
        { id: 'clay', name: 'Clay', rgb: [190, 100, 70], from: [['clay', 1]] }] },
];

/** A source's row in the deposits' grid ('m:' and a metal: its row after the systems). */
const rowOf = id => (id.startsWith('m:') ? DEPOSITS.length + METALS.findIndex(m => m.id === id.slice(2)) : DEPOSIT_INDEX[id]);

/** One resource of an age per kept grid cell (0…1): its sources through the age's cut-offs, the richest of them plus a
 *  little where several overlap (as a metal's are). */
export function resourceField(Dp, res) {
    const K = Dp.cells.length, out = new Float32Array(K), src = res.from.map(([id, w, cut = 0]) => [rowOf(id), w, cut]);
    for (let j = 0; j < K; j++) {
        let mx = 0, sum = 0;
        for (const [r, w, cut] of src) {
            const x = Dp.data[r * K + j] / 255, v = w * (x > cut ? (x - cut) / (1 - cut) : 0);
            if (v > mx) mx = v;
            sum += v;
        }
        out[j] = Math.min(1, mx + 0.15 * (sum - mx));
    }
    return out;
}

/** A field's share of the land poor / moderate / rich, weighing each grid cell by its land. */
export function landShares(Dp, field, grades) {
    const s = [0, 0, 0];
    let all = 0;
    for (let j = 0; j < field.length; j++) {
        const L = Dp.land[j];
        if (!L) continue;
        all += L;
        const v = field[j];
        if (v >= grades[2]) s[2] += L; else if (v >= grades[1]) s[1] += L; else if (v >= grades[0]) s[0] += L;
    }
    return s.map(x => x / Math.max(1, all));
}

/** The richest a field is within `km` of each kept grid cell (a max filter over the grid, its east–west reach widening
 *  toward the poles) — what a people can reach by trade or haul. */
export function within(Dp, field, km) {
    const { w, h, step, cells } = Dp, full = new Float32Array(w * h), tmp = new Float32Array(w * h);
    for (let j = 0; j < cells.length; j++) full[cells[j]] = field[j];
    const ry = Math.max(1, Math.round(km / (111.2 * step)));
    for (let y = 0; y < h; y++) {                                // along the rows (wrapping), by latitude
        const lat = 90 - (y + 0.5) * step, rx = Math.min(w >> 1, Math.max(1, Math.round(km / (111.2 * step * Math.max(0.05, Math.cos(lat * Math.PI / 180))))));
        const o = y * w;
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let d = -rx; d <= rx; d++) { const v = full[o + (x + d + w) % w]; if (v > m) m = v; }
            tmp[o + x] = m;
        }
    }
    const out = new Float32Array(cells.length);
    for (let j = 0; j < cells.length; j++) {                       // then the columns, at the kept cells only
        const g = cells[j], y = Math.floor(g / w), x = g % w;
        let m = 0;
        for (let d = -ry; d <= ry; d++) { const yy = y + d; if (yy < 0 || yy >= h) continue; const v = tmp[yy * w + x]; if (v > m) m = v; }
        out[j] = m;
    }
    return out;
}

/** An age's potential per kept grid cell (0…1), or null if it has none: bronze — copper here × tin (or arsenic, poorer)
 *  within ~600 km × wood within ~100 km; ironworking — iron ore here × wood or coal within ~150 km. */
export function potentialField(Dp, age) {
    if (!age.potential) return null;
    const res = id => resourceField(Dp, age.resources.find(r => r.id === id));
    const wood = resourceField(Dp, { from: [['wood', 1]] }), fuelOf = f => smooth(0.1, 0.5, f);
    if (age.id === 'bronze') {
        const cu = res('copper'), tin = within(Dp, res('tin'), 600), as = within(Dp, res('arsenic'), 300), fuel = within(Dp, wood, 100);
        return cu.map((c, j) => c * Math.max(smooth(0.1, 0.5, tin[j]), 0.6 * smooth(0.1, 0.5, as[j])) * fuelOf(fuel[j]));
    }
    const fe = res('iron'), coal = resourceField(Dp, { from: [['coal', 1, 0.2]] }), fuel = within(Dp, wood.map((v, j) => Math.max(v, coal[j])), 150);
    return fe.map((v, j) => v * fuelOf(fuel[j]));
}
