// Earth likenesses for a world's crops and animals (plans/V2_FOOD_PLAN.md §4.5–4.6, F5a; ported from the mock-up's
// names.js): each place crops or beasts were first tamed is "like" one of Earth's regions where farming began, chosen by
// its climate and pulled toward what nearby places are like; each crop or animal tamed there is named "X-like" from the
// catalogue of Earth's — a different world: likenesses, never claims.
// Each entry: its Earth home regions, its own climate where unlike its home's (T °C mean, W wetness — the aridity index,
// P/PET — E height km), and two rough judgements, 0…1: pop, how widely grown or kept and loved on Earth (FAO output, how
// many cuisines rely on it); nut, how much it feeds. w: the Wikipedia article where the plain name would land elsewhere.

export const PKG = {
    FC: { name: 'the Fertile Crescent', lat: 36, lon: 40, T: 16, W: 0.35, E: 0.6, ws: 0.8, world: 'O' },
    MED: { name: 'the Mediterranean', lat: 38, lon: 20, T: 16, W: 0.5, E: 0.3, ws: 0.8, world: 'O' },
    EU: { name: 'temperate Europe', lat: 49, lon: 10, T: 9, W: 1.1, E: 0.3, ws: 0.5, world: 'O' },
    CAS: { name: 'Central Asia', lat: 40, lon: 66, T: 12, W: 0.3, E: 0.8, ws: 0.65, world: 'O' },
    YR: { name: 'the Yellow River', lat: 35, lon: 110, T: 12, W: 0.55, E: 0.5, ws: 0.15, world: 'O' },
    YZ: { name: 'the Yangtze', lat: 30, lon: 115, T: 17, W: 1.2, E: 0.1, ws: 0.3, world: 'O' },
    YUN: { name: 'Yunnan–Assam', lat: 25, lon: 100, T: 16, W: 1.2, E: 1.6, ws: 0.15, world: 'O' },
    GA: { name: 'the Ganges', lat: 25, lon: 85, T: 25, W: 0.8, E: 0.1, ws: 0.1, world: 'O' },
    SIN: { name: 'South India', lat: 10, lon: 77, T: 27, W: 1.3, E: 0.3, ws: 0.3, world: 'O' },
    MOL: { name: 'the Moluccas', lat: -3, lon: 128, T: 27, W: 2.2, E: 0.1, ws: 0.45, world: 'O' },
    NG: { name: 'New Guinea', lat: -6, lon: 145, T: 22, W: 2.0, E: 1.0, ws: 0.5, world: 'O' },
    SWA: { name: 'the Sahel', lat: 13, lon: 0, T: 28, W: 0.35, E: 0.3, ws: 0.05, world: 'O' },
    WAF: { name: 'the West African forest', lat: 7, lon: -3, T: 26, W: 1.1, E: 0.2, ws: 0.2, world: 'O' },
    ET: { name: 'the Ethiopian highlands', lat: 9, lon: 39, T: 17, W: 0.9, E: 2.2, ws: 0.15, world: 'O' },
    TIB: { name: 'the Tibetan plateau', lat: 32, lon: 90, T: 2, W: 0.5, E: 4.2, ws: 0.15, world: 'O' },
    SIB: { name: 'the northern taiga', lat: 62, lon: 100, T: -6, W: 1.0, E: 0.4, ws: 0.3, world: 'O' },
    MA: { name: 'Mesoamerica', lat: 18, lon: -97, T: 21, W: 0.7, E: 1.2, ws: 0.1, world: 'N' },
    AN: { name: 'the Andes', lat: -13, lon: -72, T: 10, W: 0.7, E: 3.3, ws: 0.15, world: 'N' },
    AM: { name: 'Amazonia', lat: -10, lon: -63, T: 26, W: 1.3, E: 0.2, ws: 0.15, world: 'N' },
    ENA: { name: 'eastern North America', lat: 37, lon: -88, T: 13, W: 1.0, E: 0.2, ws: 0.45, world: 'N' },
};
export const KEYS = Object.keys(PKG);
const NK = KEYS.length;
const I = (n, p, x) => ({ n, p: p.split(' '), ...(x || {}) });
/** The crops, by kind: \`staple\` a list for each crop group (farming.js CROPS: paddy grains, cool-season grains, warm-season
 *  grains, roots and tubers, tree and palm crops); the others for the later layers (pulses, orchards, spices, gardens,
 *  drinks and fibres — F5b). */
export const CAT = {
    staple: [
        [I('japonica rice', 'YZ', { pop: 1, nut: 0.8, w: 'Japonica rice' }), I('indica rice', 'GA', { pop: 1, nut: 0.8, w: 'Indica rice' }), I('African rice', 'SWA', { W: 0.6, pop: 0.4, nut: 0.75, w: 'Oryza glaberrima' }),
            I('Manchurian wild rice', 'YZ', { T: 15, W: 1.3, pop: 0.25, nut: 0.7, w: 'Zizania latifolia' }), I('northern wild rice', 'ENA', { T: 7, pop: 0.3, nut: 0.8, w: 'Zizania palustris' })],
        [I('bread wheat', 'FC CAS', { pop: 1, nut: 0.85, w: 'Common wheat' }), I('durum wheat', 'FC MED', { pop: 0.7, nut: 0.85 }), I('emmer', 'FC', { pop: 0.6, nut: 0.8 }), I('einkorn', 'FC', { E: 0.9, pop: 0.4, nut: 0.8, w: 'Einkorn wheat' }),
            I('barley', 'FC', { W: 0.3, pop: 0.9, nut: 0.8 }), I('rye', 'EU', { T: 7, pop: 0.7, nut: 0.8 }), I('oats', 'EU', { W: 1.2, pop: 0.75, nut: 0.85, w: 'Oat' }), I('spelt', 'EU', { pop: 0.5, nut: 0.8 }),
            I('teff', 'ET', { E: 2.2, pop: 0.4, nut: 0.85 }), I('quinoa', 'AN', { E: 3.3, pop: 0.55, nut: 0.9 }), I('kañiwa', 'AN', { E: 3.8, pop: 0.2, nut: 0.85, w: 'Chenopodium pallidicaule' }),
            I('buckwheat', 'YUN', { T: 12, E: 1.8, pop: 0.5, nut: 0.8 }), I('naked barley', 'TIB CAS', { E: 3.5, pop: 0.4, nut: 0.8, w: 'Hordeum vulgare var. nudum' })],
        [I('maize', 'MA', { pop: 1, nut: 0.8 }), I('foxtail millet', 'YR', { pop: 0.6, nut: 0.8 }), I('broomcorn millet', 'YR', { W: 0.4, pop: 0.55, nut: 0.8, w: 'Proso millet' }),
            I('sorghum', 'SWA ET', { pop: 0.85, nut: 0.8, w: 'Sorghum bicolor' }), I('pearl millet', 'SWA', { W: 0.25, pop: 0.7, nut: 0.8 }), I('finger millet', 'ET', { pop: 0.5, nut: 0.8 }),
            I('fonio', 'SWA WAF', { pop: 0.3, nut: 0.75, w: 'Digitaria exilis' }), I('little millet', 'SIN', { pop: 0.25, nut: 0.75, w: 'Panicum sumatrense' }), I('browntop millet', 'SIN', { pop: 0.15, nut: 0.7, w: 'Urochloa ramosa' }),
            I('goosefoot', 'ENA', { pop: 0.15, nut: 0.8, w: 'Chenopodium berlandieri' }), I('maygrass', 'ENA', { pop: 0.1, nut: 0.7, w: 'Phalaris caroliniana' }), I('grain amaranth', 'MA', { pop: 0.35, nut: 0.85, w: 'Amaranth grain' }),
            I('sauwi millet', 'MA', { W: 0.3, pop: 0.1, nut: 0.7, w: 'Panicum sonorum' }), I('Job’s tears', 'YUN', { pop: 0.2, nut: 0.75, w: 'Coix lacryma-jobi' })],
        [I('potato', 'AN', { E: 3.3, pop: 1, nut: 0.75 }), I('oca', 'AN', { E: 3.3, pop: 0.3, nut: 0.6, w: 'Oxalis tuberosa' }), I('ulluco', 'AN', { E: 3.5, pop: 0.25, nut: 0.55 }),
            I('mashua', 'AN', { E: 3.5, pop: 0.15, nut: 0.55, w: 'Tropaeolum tuberosum' }), I('sweet potato', 'AM MA', { pop: 0.9, nut: 0.8 }), I('cassava', 'AM', { pop: 0.95, nut: 0.6 }),
            I('Guinea yam', 'WAF', { pop: 0.6, nut: 0.65, w: 'Dioscorea rotundata' }), I('greater yam', 'NG MOL', { pop: 0.5, nut: 0.65, w: 'Dioscorea alata' }), I('taro', 'NG', { pop: 0.65, nut: 0.65 }),
            I('arrowroot', 'AM', { pop: 0.25, nut: 0.55, w: 'Maranta arundinacea' }), I('konjac', 'YUN', { pop: 0.25, nut: 0.4 }), I('Jerusalem artichoke', 'ENA', { pop: 0.25, nut: 0.6 }),
            I('tannia', 'AM', { pop: 0.3, nut: 0.6, w: 'Xanthosoma sagittifolium' }), I('maca', 'AN', { E: 4, pop: 0.2, nut: 0.6, w: 'Lepidium meyenii' })],
        [I('banana', 'NG', { pop: 1, nut: 0.7 }), I('plantain', 'NG', { pop: 0.8, nut: 0.7, w: 'Cooking banana' }), I('breadfruit', 'MOL', { pop: 0.45, nut: 0.7 }), I('sago palm', 'NG', { W: 2.5, pop: 0.35, nut: 0.55, w: 'Metroxylon sagu' }),
            I('date palm', 'FC', { W: 0.08, T: 25, pop: 0.75, nut: 0.75 }), I('enset', 'ET', { pop: 0.25, nut: 0.6, w: 'Ensete ventricosum' }), I('peach palm', 'AM', { pop: 0.25, nut: 0.7, w: 'Bactris gasipaes' }),
            I('coconut', 'MOL', { pop: 0.9, nut: 0.75 }), I('chestnut', 'MED', { T: 12, pop: 0.45, nut: 0.7, w: 'Castanea sativa' })],
    ],
};
/** The animals, by beast (beasts.js BEASTS: 1 great grazer … 8 wallowing buffalo) — each tamed one named "X-like": Earth's
 *  own domestic animals, and the wild beasts that would have been tamed on a world like another of Earth's regions (the
 *  bison of the plains, the peccary of the Americas, the moose of the taiga). */
export const ANIMALS = [
    [],
    [I('cattle', 'FC EU', { pop: 1, nut: 0.95 }), I('zebu', 'GA SIN', { pop: 0.85, nut: 0.9 }), I('sanga cattle', 'ET SWA', { pop: 0.4, nut: 0.85, w: 'Sanga cattle' }),
        I('Bali cattle', 'MOL', { pop: 0.3, nut: 0.85 }), I('gayal', 'YUN', { pop: 0.2, nut: 0.8 }), I('bison', 'ENA', { pop: 0.25, nut: 0.85, w: 'American bison' }), I('eland', 'SWA', { W: 0.5, pop: 0.1, nut: 0.8, w: 'Common eland' })],
    [I('sheep', 'FC CAS', { pop: 1, nut: 0.85 }), I('goat', 'FC ET', { pop: 0.95, nut: 0.85 }), I('fat-tailed sheep', 'CAS SWA', { W: 0.25, pop: 0.45, nut: 0.85 }),
        I('cashmere goat', 'TIB CAS', { pop: 0.35, nut: 0.75 }), I('mouflon', 'MED', { pop: 0.15, nut: 0.75 }), I('bighorn sheep', 'ENA AN', { W: 0.4, E: 1.8, pop: 0.1, nut: 0.75 })],
    [I('horse', 'CAS EU', { pop: 1, nut: 0.6 }), I('donkey', 'ET SWA', { pop: 0.8, nut: 0.4 }), I('onager', 'FC', { W: 0.25, pop: 0.2, nut: 0.4 }), I('kiang', 'TIB', { pop: 0.1, nut: 0.4 }),
        I('Przewalski’s horse', 'CAS', { T: 4, pop: 0.15, nut: 0.6, w: 'Przewalski\'s horse' })],
    [I('dromedary', 'FC SWA', { W: 0.08, T: 25, pop: 0.8, nut: 0.7 }), I('Bactrian camel', 'CAS', { W: 0.15, T: 8, pop: 0.5, nut: 0.7 }), I('guanaco', 'AN', { W: 0.25, E: 1.5, pop: 0.15, nut: 0.6 })],
    [I('yak', 'TIB', { pop: 0.6, nut: 0.8, w: 'Domestic yak' }), I('llama', 'AN', { pop: 0.55, nut: 0.6 }), I('alpaca', 'AN', { E: 4, pop: 0.5, nut: 0.55 }), I('takin', 'YUN', { E: 2.5, pop: 0.05, nut: 0.6 })],
    [I('reindeer', 'SIB EU', { pop: 0.5, nut: 0.75 }), I('caribou', 'ENA', { T: -6, pop: 0.2, nut: 0.75 }), I('moose', 'SIB EU', { T: -2, W: 1.2, pop: 0.1, nut: 0.75 })],
    [I('pig', 'FC EU', { pop: 1, nut: 0.85, w: 'Domestic pig' }), I('Chinese pig', 'YR YZ', { pop: 0.8, nut: 0.85, w: 'Meishan pig' }), I('peccary', 'AM MA', { pop: 0.15, nut: 0.75 }),
        I('babirusa', 'MOL', { pop: 0.05, nut: 0.7 }), I('bushpig', 'WAF', { pop: 0.05, nut: 0.7 })],
    [I('river buffalo', 'GA SIN', { pop: 0.8, nut: 0.9, w: 'Water buffalo' }), I('swamp buffalo', 'YZ MOL', { pop: 0.6, nut: 0.85, w: 'Water buffalo' }), I('African buffalo', 'WAF SWA', { pop: 0.1, nut: 0.8 }),
        I('anoa', 'MOL', { pop: 0.05, nut: 0.7 })],
];

const gc = (a1, o1, a2, o2) => { const r = Math.PI / 180, x = Math.sin(a1 * r) * Math.sin(a2 * r) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.cos((o1 - o2) * r); return 6371 * Math.acos(Math.min(1, Math.max(-1, x))); };
/** How near two of Earth's regions are (1 within 1,500 km, 0 past 6,000 km). */
const NEAR = KEYS.map(a => KEYS.map(b => (a === b ? 1 : Math.max(0, Math.min(1, (6000 - gc(PKG[a].lat, PKG[a].lon, PKG[b].lat, PKG[b].lon)) / 4500)))));
const KI = Object.fromEntries(KEYS.map((k, i) => [k, i]));
/** How alike two climates are (0…1): mean °C, wetness (on a log scale), height, winter share of the rain (a rough one on
 *  the page: January's and July's — so a wide match). */
export const climFit = (h, c) => Math.exp(-0.5 * (((h.T - c.T) / 6) ** 2 + (Math.log(Math.max(0.03, h.W) / Math.max(0.03, c.W)) / 0.6) ** 2 + ((h.E - c.E) / 1.0) ** 2 + ((h.ws - c.ws) / 0.3) ** 2));
/** An entry's own climate: its home regions' mean, where it does not give its own. */
export const itemClim = it => { const ps = it.p.map(k => PKG[k]); const avg = f => ps.reduce((s, P) => s + P[f], 0) / ps.length; return { T: it.T ?? avg('T'), W: it.W ?? avg('W'), E: it.E ?? avg('E'), ws: it.ws ?? avg('ws') }; };
/** How near an entry's Earth homes are to a site's likenesses (its own, then its runner-up at 0.7). */
const nearItem = (it, pkg, pkg2) => { let v = 0; for (const k of it.p) { const q = KI[k]; v = Math.max(v, NEAR[pkg][q], pkg2 >= 0 ? 0.7 * NEAR[pkg2][q] : 0); } return v; };
const sameWorld = (it, pkg) => it.p.some(k => PKG[k].world === PKG[KEYS[pkg]].world);
/** An entry's Wikipedia link (a search that lands on the article where its title is exact). */
export const wiki = it => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(it.w || it.n)}&go=Go`;
/** Its Earth home in words ("the Fertile Crescent and temperate Europe"). */
export const earthHome = it => it.p.map(k => PKG[k].name).join(' and ');
/** How hard nearby sites pull toward one another's likenesses: free (none), regional (the default) or strict (Old and New
 *  World never mix among neighbours). */
export const PULL = { free: { lam: 0, pen: 0 }, regional: { lam: 1.4, pen: 0.35 }, strict: { lam: 3.2, pen: 2 } };
const gumbel = (h01, seed, stream, id) => -Math.log(-Math.log(h01(seed, stream, id)));

/** Each site's Earth likeness (an index into KEYS, and a runner-up or −1) — sites [{ lat, lon, mass, t, h: { T, W, E, ws } }]:
 *  its climate (weighed `clim`), a seeded nudge (h01(seed, stream, id): a uniform draw in (0, 1)), and the pull toward what
 *  nearby sites are like — near on Earth and on Earth's same side of the oceans — settled over a few sweeps, the earliest
 *  site first. (The page's worlds have a hundred sites or more where the mock-up's had a few dozen: the climate weighed
 *  more, the nudge less, so a hot wet hearth is not pulled to temperate Europe.) */
export function choosePackages(sites, pull, seed, h01, noise = 0.3, clim = 2.6) {
    const P = PULL[pull] ?? PULL.regional, n = sites.length;
    const base = sites.map((s, i) => KEYS.map((k, p) => clim * climFit(s.h, PKG[k]) + noise * gumbel(h01, seed, 11, i * 64 + p)));
    const W = sites.map(s => sites.map(t => (s === t ? 0 : Math.exp(-((gc(s.lat, s.lon, t.lat, t.lon) / 2200) ** 2)) * (s.mass === t.mass ? 1 : 0.5))));
    const cur = base.map(row => row.indexOf(Math.max(...row))), second = new Array(n).fill(-1);
    const order = sites.map((_, i) => i).sort((a, b) => sites[a].t - sites[b].t);
    for (let sweep = 0; sweep < 6; sweep++) {
        let changed = false;
        for (const i of order) {
            let wsum = 0;
            for (let j = 0; j < n; j++) wsum += W[i][j];
            let b1 = -1, v1 = -Infinity, b2 = -1, v2 = -Infinity;
            for (let p = 0; p < NK; p++) {
                let coh = 0;
                for (let j = 0; j < n; j++) { if (W[i][j] < 0.01) continue; const q = cur[j]; coh += W[i][j] * (NEAR[p][q] + (PKG[KEYS[p]].world === PKG[KEYS[q]].world ? 0.25 : -P.pen)); }
                const v = base[i][p] + P.lam * coh / Math.max(0.6, wsum);
                if (v > v1) { b2 = b1; v2 = v1; b1 = p; v1 = v; } else if (v > v2) { b2 = p; v2 = v; }
            }
            if (b1 !== cur[i]) { cur[i] = b1; changed = true; }
            second[i] = v2 > v1 - 0.35 ? b2 : -1;
        }
        if (!changed) break;
    }
    return { pkg: cur, second };
}
/** A tamed crop's or animal's name at a site: the catalogue's entry most like the site's Earth regions, suited to its
 *  climate, from Earth's same side of the oceans unless the pull is free, weighted by how popular and how nourishing it is
 *  (R: the realism's weights) — each once where it can be, then II, III. Returns { label, item }. */
export function chooseItem(list, h, pkg, pkg2, used, pull, seed, h01, gid, R = { pop: 1, nut: 0.5, noise: 0.35 }) {
    const P = PULL[pull] ?? PULL.regional;
    let best = null, bv = -Infinity;
    list.forEach((it, i) => {
        const v = 1.6 * nearItem(it, pkg, pkg2) + 0.7 * climFit(h, itemClim(it)) - (sameWorld(it, pkg) ? 0 : 2 * P.pen) + 0.8 * R.pop * ((it.pop ?? 0.5) - 0.5) + 0.5 * R.nut * ((it.nut ?? 0.5) - 0.5)
            + R.noise * gumbel(h01, seed, 23, gid * 64 + i) - 3 * (used.get(it.n) || 0);
        if (v > bv) { bv = v; best = it; }
    });
    const nth = (used.get(best.n) || 0) + 1;
    used.set(best.n, nth);
    return { label: `${best.n}-like${nth > 1 ? ` ${['', '', 'II', 'III', 'IV', 'V'][nth] || nth}` : ''}`, item: best };
}
