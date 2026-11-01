(function () {
'use strict';
const F = window.FoodWorld, { W, H, HW, N, sm } = F;
const SEEDS = [7, 23, 42, 11, 5, 99];
const st = {
    seedI: 0, view: 'farmland', sub: { farmland: 'farmland', calendar: 'harvest', origins: 'when', crops: 'fields' },
    tech: { flood: true, canal: true, terrace: true, raised: true }, classes: false, watered: false,
    only: { staple: 0, animals: -1, larder: -1, life: 0, crop: -1, minor: -1, home: -1, item: -1 }, pull: 'regional', real: 'balanced', nameRoll: 0, place: -1, simple: false, best: false, full: false, years: 10000, roll: 0, scarce: true,
};
let L, G, Hs, D, shade, Mn, Cr, VBA = [[], [], [], [], []];
const ARCH_SHORT = ['paddy grain', 'cool-season grain', 'warm-season grain', 'root crop', 'tree crop'];
const LIKES = [
    [['japonica-like', h => sm(23, 17, h.T)], ['indica-like', h => sm(20, 25, h.T) * sm(0.7, 1.1, h.W)], ['African-rice-like', h => 0.9 * sm(1.0, 0.6, h.W)]],
    [['barley-like', h => 0.4 + 0.6 * sm(0.7, 0.35, h.W)], ['emmer-like', h => sm(0.45, 0.62, h.ws)], ['einkorn-like', h => 0.5 * sm(10, 4, h.Tc)], ['rye-like', h => sm(0, -8, h.Tc)], ['oat-like', h => sm(0.8, 1.3, h.W) * sm(10, 2, h.Tc)], ['teff-like', h => sm(1.4, 2.2, h.E)]],
    [['foxtail-millet-like', h => sm(14, 24, h.tr)], ['sorghum-like', h => sm(21, 25, h.T) * sm(0.9, 0.5, h.W)], ['maize-like', h => sm(0.5, 1.1, h.E)], ['pearl-millet-like', h => sm(0.5, 0.25, h.W) * sm(22, 26, h.T)], ['fonio-like', () => 0.25]],
    [['yam-like', h => sm(2.5, 4.5, h.dry)], ['cassava-like', h => sm(22, 25, h.T) * sm(0.7, 1.2, h.W)], ['potato-like', h => sm(1.5, 2.4, h.E)], ['taro-like', h => sm(1.1, 1.8, h.W)], ['sweet-potato-like', () => 0.3]],
    [['banana-like', h => sm(1.1, 1.6, h.W)], ['breadfruit-like', h => h.coast], ['sago-like', h => sm(1.6, 2.4, h.W)], ['date-palm-like', h => sm(0.3, 0.1, h.W)], ['enset-like', h => sm(1.3, 2.0, h.E)]],
];
const traitsOf = h => [h.Tc < -3 && 'frost-hardy', h.W < 0.5 && 'drought-hardy', h.warm >= 10 && 'long-season', h.warm < 6 && 'quick-ripening', h.E > 1.8 && 'highland'].filter(Boolean);
/** Each staple variant: a name by its home's climate (each name once per archetype), its traits, and how at home it is everywhere. */
function nameVariants() {
    VBA = [[], [], [], [], []];
    Cr.variants.forEach((V, i) => { VBA[V.a].push(i); V.match = new Float32Array(F.HN); for (let c = 0; c < F.HN; c++) if (Mn.cnt[c]) V.match[c] = F.homeMatch(V.home, Mn, c); });
    for (let a = 0; a < 5; a++) {
        VBA[a].sort((x, y) => Cr.variants[x].t0 - Cr.variants[y].t0).forEach(i => {
            const V = Cr.variants[i];
            V.traits = traitsOf(V.home);
            const C = Hs.centres[V.centre]; V.where = C.primary ? `hearth ${centreLabel(C)}` : 'a secondary centre';
        });
    }
    assignNames();
}
/** The Earth likenesses and the crops: every farmed region is a site, like one of Earth's regions (by climate, pulled toward
 *  what its neighbours are like — st.pull — and nudged: st.nameRoll); the staples' variants named from there, and every other
 *  crop of the catalogue grown or not, first grown somewhere and spread (items.js), as the realism weighs it. */
let SITES = [], ITEMS = null;
const REALW = { earth: { pop: 1.6, nut: 0.8, noise: 0.2 }, balanced: { pop: 1, nut: 0.5, noise: 0.35 }, wild: { pop: 0.1, nut: 0.05, noise: 1.0 } };
const KINDS = [
    { key: 'pulse', sub: 'pulses', word: 'Pulses', rgb: [176, 150, 70] },
    { key: 'orchard', sub: 'fruit', word: 'Fruit & nuts', rgb: [186, 70, 84] },
    { key: 'garden', sub: 'veg', word: 'Vegetables & herbs', rgb: [64, 146, 78] },
    { key: 'spice', sub: 'spice', word: 'Spices', rgb: [204, 120, 40] },
    { key: 'stimulant', sub: 'other', word: 'Drinks & stimulants', rgb: [124, 82, 58] },
    { key: 'fibre', sub: 'other', word: 'Oil & fibre', rgb: [92, 126, 186] },
];
const KI = Object.fromEntries(KINDS.map((K, i) => [K.key, i])), KN = KINDS.length;
function regionCells(R) {
    const J = (R.cell / HW) | 0, I = R.cell - J * HW, cells = [];
    for (let dj = -3; dj <= 3; dj++) { const jj = J + dj; if (jj < 0 || jj >= F.HH) continue; const span = Math.min(HW / 2, Math.round(3 / Math.max(0.2, Math.cos((90 - jj - 0.5) * Math.PI / 180)))); for (let di = -span; di <= span; di++) { const m = jj * HW + ((I + di + HW) % HW); if (G.land[m]) cells.push(m); } }
    return cells;
}
function assignNames() {
    const NM_ = window.FoodNames, seed = 3000017 + st.nameRoll * 7919, regionSite = new Map();
    const centreT = new Map(); for (const C of Hs.centres) if (!centreT.has(C.region) || C.t0 < centreT.get(C.region)) centreT.set(C.region, C.t0);
    SITES = G.regions.filter(R => (!R.beastOnly && Hs.farmTime[R.cell] < Infinity) || centreT.has(R.r)).map((R, i) => { regionSite.set(R.r, i); return { region: R, cells: regionCells(R), lat: R.lat, lon: R.lon, mass: R.mass, h: F.regionClimate(G, Mn, R), t: Math.min(Hs.farmTime[R.cell], centreT.get(R.r) ?? Infinity) }; });
    const { pkg, second } = NM_.choosePackages(SITES, st.pull, seed, F.hash01, st.real === 'wild' ? 1.2 : st.real === 'earth' ? 0.3 : 0.45);
    SITES.forEach((x, i) => { x.pkg = pkg[i]; x.pkg2 = second[i]; });
    for (const C of Hs.centres) C.site = regionSite.get(C.region);
    const usedMaps = new Map(), usedFor = l => { if (!usedMaps.has(l)) usedMaps.set(l, new Map()); return usedMaps.get(l); };
    [...Cr.variants].sort((a, b) => a.t0 - b.t0).forEach(V => {
        V.site = Hs.centres[V.centre].site; const x = SITES[V.site], list = NM_.CAT.staple[V.a];
        if (!x) { V.like = `${ARCH_SHORT[V.a]} ${V.strain}`; V.item = null; return; }
        const r = NM_.chooseItem(list, V.home, x.pkg, x.pkg2, usedFor(list), st.pull, seed, F.hash01, 1 + V.strain, REALW[st.real]); V.like = r.label; V.item = r.item;
    });
    if (!ITEMS) ITEMS = window.FoodItems.prepare(Mn);
    window.FoodItems.build(ITEMS, { G, Hs, sites: SITES, seed: 5000011 + st.nameRoll * 7919 + st.roll * 131 }, { real: st.real, pull: st.pull });
}
const likeOf = si => { if (si == null || !SITES[si]) return ''; const x = SITES[si], P = window.FoodNames.PKG, K = window.FoodNames.KEYS; return `like ${P[K[x.pkg]].name}${x.pkg2 >= 0 ? ` and ${P[K[x.pkg2]].name}` : ''}`; };
const wiki = it => window.FoodNames.wiki(it);
const earthHome = it => it.p.map(k => window.FoodNames.PKG[k].name).join(' and ');
const dots = v => '●●●●●'.slice(0, Math.max(1, Math.round(v * 5))) + '○○○○○'.slice(0, 5 - Math.max(1, Math.round(v * 5)));

// ── colours ──
const SEA = [24, 34, 62], ICE = [232, 236, 242], PALE = [226, 218, 202], NONE = [196, 192, 184];
const STAPLE_RGB = [PALE, [52, 152, 136], [216, 174, 70], [204, 110, 72], [132, 98, 164], [142, 158, 98], [74, 118, 186], [126, 92, 56], [196, 94, 120]];
const STAPLE_WORDS = ['Nothing', 'Paddy grains', 'Cool-season grains', 'Warm-season grains', 'Roots & tubers', 'Livestock', 'Fish', 'Wild foods', 'Tree & palm crops'];
const LIFE = [['Uninhabited', PALE, 0], ['Paddy farming', [52, 152, 136], 1], ['Irrigated valleys', [38, 168, 186], 1], ['Plough & flocks', [214, 170, 60], 1],
    ['Mixed farms', [112, 150, 72], 1], ['Hoe farming', [204, 110, 72], 1], ['Forest gardens', [40, 108, 72], 1], ['Highland farming', [124, 112, 176], 1],
    ['Grain & herds', [214, 148, 104], 1], ['Nomadic herding', [150, 160, 96], 2], ['Settled foragers', [74, 118, 186], 3], ['Mobile foragers', [126, 92, 56], 3]];
const LIFE_WHY = ['', 'paddy grains lead: warm, wet, level ground', 'arid by rain, farmed with river water', 'grain with a plough beast and flocks; winter rain or dry summers',
    'grain with a plough beast; humid, short summers', 'no plough beast here (none on this landmass, or the fly belt)', 'roots and trees in the wet tropics, long fallows',
    'terraces and cold-hardy crops in the tropical highlands', 'the dry margin: grain and herds side by side', 'pasture only', 'rich fish within reach: they settle and store', 'hunting and gathering'];
const SIMPLE = [['Uninhabited', PALE], ['Farming', [70, 148, 78]], ['Herding', [206, 160, 64]], ['Gathering', [128, 92, 176]]];
const BEAST_WORDS = ['Great grazer', 'Small stock', 'Steppe horse', 'Desert camel', 'High-country beast', 'Tundra deer', 'Forest pig', 'Wallowing buffalo'];
const BEAST_LIKE = ['like cattle', 'like sheep and goats', 'like the horse', 'like camels', 'like yak or llama', 'like reindeer', 'like pigs', 'like water buffalo'];
const BEAST_ROLE = ['plough · milk', 'milk · wool', 'mount · milk', 'pack · mount', 'pack · wool', 'sled · milk', 'meat', 'plough · milk'];
const BEAST_RGB = [[150, 92, 62], [196, 178, 112], [124, 84, 150], [214, 160, 80], [90, 112, 164], [92, 146, 146], [214, 124, 142], [58, 72, 96]];
const ARCH_WORDS = ['Paddy grains', 'Cool-season grains', 'Warm-season grains', 'Roots & tubers', 'Tree & palm crops', ...BEAST_WORDS];
const ARCH_RGB = [STAPLE_RGB[1], STAPLE_RGB[2], STAPLE_RGB[3], STAPLE_RGB[4], STAPLE_RGB[8], ...BEAST_RGB];
const HEARTH_RGB = [[226, 86, 62], [52, 138, 204], [236, 178, 40], [110, 184, 76], [168, 92, 190], [36, 176, 168], [232, 118, 168], [150, 108, 60], [92, 96, 206], [196, 196, 64], [70, 158, 110], [220, 138, 88], [108, 160, 222], [178, 60, 110], [96, 198, 198]];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RISK = [['Low risk', [204, 208, 196]], ['Drought', [204, 124, 60]], ['Failed rains', [222, 182, 80]], ['Frost', [104, 148, 214]], ['Flood', [44, 122, 150]]];
const FARM_RAIN = [[0, [212, 204, 188]], [0.12, [226, 214, 160]], [0.28, [196, 208, 124]], [0.45, [124, 176, 88]], [0.65, [52, 124, 64]], [1, [22, 86, 50]]];
const FARM_WATER = [[0, [212, 204, 188]], [0.12, [204, 230, 212]], [0.28, [150, 220, 194]], [0.45, [74, 198, 168]], [0.65, [26, 166, 146]], [1, [10, 128, 118]]];
const SOIL = [[0, [226, 210, 178]], [0.25, [216, 190, 140]], [0.5, [182, 136, 88]], [0.75, [124, 84, 54]], [1, [68, 46, 36]]];
const SEASON = [[0, [214, 206, 192]], [1.5, [232, 214, 150]], [3, [206, 214, 122]], [5, [140, 188, 98]], [8, [64, 148, 86]], [12, [22, 98, 72]]];
const PEOPLE = [[0, [216, 210, 198]], [1, [228, 220, 190]], [5, [228, 206, 154]], [20, [216, 170, 108]], [60, [186, 110, 74]], [150, [120, 50, 62]]].map(([v, c]) => [Math.log10(1 + v), c]);
const ARRIVE = [[0, [22, 74, 72]], [2000, [42, 120, 104]], [4000, [104, 162, 112]], [6000, [178, 196, 120]], [8000, [226, 210, 148]], [10000, [238, 222, 186]]];
const ORCH = [[0, [222, 216, 202]], [1, [214, 196, 150]], [2, [190, 150, 96]], [3, [150, 96, 70]], [4, [100, 56, 60]]];
const VARIETY_ALL = [[0, [226, 218, 202]], [3, [222, 214, 168]], [7, [176, 196, 120]], [12, [96, 156, 104]], [18, [40, 110, 96]], [24, [18, 70, 76]]];
const VARIETY = [[0, [226, 218, 202]], [1, [206, 210, 160]], [2, [150, 186, 116]], [3, [80, 144, 96]], [4, [34, 100, 80]]];
const LEAN = [[0, [204, 214, 196]], [1, [226, 210, 150]], [2, [214, 160, 96]], [3, [176, 92, 70]], [4, [120, 50, 62]]];
const CLASS_WORDS = ['Barren', 'Poor', 'Fair', 'Good', 'Excellent'], CLASS_V = [0.12, 0.35, 0.65, 1.25], CLASS_AT = [0.05, 0.22, 0.38, 0.55, 0.78];
const SOIL_WORDS = ['', 'river silt', '', 'sandy soil', 'clay soil', 'loam', 'volcanic ash'], MOD_WORDS = ['', 'black earth', 'leached red earth', 'acid podzol'];

const css = c => `rgb(${c.map(Math.round).join(',')})`;
function ramp(stops, v, out = [0, 0, 0]) {
    if (!(v > stops[0][0])) { out[0] = stops[0][1][0]; out[1] = stops[0][1][1]; out[2] = stops[0][1][2]; return out; }
    for (let s = 1; s < stops.length; s++) {
        if (v > stops[s][0] && s < stops.length - 1) continue;
        const [a, ca] = stops[s - 1], [b, cb] = stops[s], t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        for (let i = 0; i < 3; i++) out[i] = ca[i] + (cb[i] - ca[i]) * t;
        return out;
    }
    return out;
}
const gradient = (stops, from = stops[0][0], to = stops.at(-1)[0]) => `linear-gradient(90deg, ${stops.map(([v, c]) => `${css(c)} ${(100 * (v - from) / (to - from)).toFixed(0)}%`).join(', ')})`;
function hsl(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [255 * f(0), 255 * f(8), 255 * f(4)]; }
const MONTH_RGB = MONTHS.map((_, m) => hsl((220 - 30 * m + 720) % 360, 52, 54));
const ALLYEAR = [128, 160, 120];
const mix = (c, t) => [PALE[0] + (c[0] - PALE[0]) * t, PALE[1] + (c[1] - PALE[1]) * t, PALE[2] + (c[2] - PALE[2]) * t];
const farmIndexV = v => v / (v + 0.67);
const farmClass = f => (f >= farmIndexV(CLASS_V[3]) ? 4 : f >= farmIndexV(CLASS_V[2]) ? 3 : f >= farmIndexV(CLASS_V[1]) ? 2 : f >= farmIndexV(CLASS_V[0]) ? 1 : 0);
const pct = v => `${Math.round(100 * v)}%`;
const fmtY = y => (y === Infinity ? '—' : Math.round(y).toLocaleString('en-US'));

// ── the derived maps (per picture pixel), for the options ──
function cutoff() { return st.full ? Infinity : Hs.tFirst + st.years; }
/** Each history cell's competing variants of each staple: shares by how at home each is there, a later one handicapped
 *  (it must be clearly better to take over: incumbency, ~3,000 years); nearly winner-takes-all, a close second kept. */
function variantLeaders(T) {
    const out = { lead: [], share: [], second: [], share2: [] };
    for (let a = 0; a < 5; a++) {
        const lead = new Int16Array(F.HN).fill(-1), share = new Float32Array(F.HN), second = new Int16Array(F.HN).fill(-1), share2 = new Float32Array(F.HN), vs = VBA[a];
        for (let c = 0; c < F.HN; c++) {
            if (!Mn.cnt[c] || !vs.length) continue;
            let first = Infinity; for (const v of vs) { const t = Cr.variants[v].arrive[c]; if ((st.best || t <= T) && t < first) first = t; }
            if (first === Infinity) continue;
            let sum = 0, b1 = -1, w1 = 0, b2 = -1, w2 = 0;
            for (const v of vs) { const V = Cr.variants[v], t = V.arrive[c]; if (!(st.best ? t < Infinity : t <= T)) continue; const w = (V.match[c] * (st.best ? 1 : Math.exp(-(t - first) / 3000))) ** 6; sum += w; if (w > w1) { b2 = b1; w2 = w1; b1 = v; w1 = w; } else if (w > w2) { b2 = v; w2 = w; } }
            lead[c] = b1; share[c] = w1 / sum; second[c] = b2; share2[c] = w2 / sum;
        }
        out.lead.push(lead); out.share.push(share); out.second.push(second); out.share2.push(share2);
    }
    return out;
}
/** Which crops grow in each history cell by time T: how many of each kind and in all, each pulse slot's and the spices' leader. */
function cropCounts(T) {
    const t10 = T === Infinity ? 65534 : Math.floor(T / 10), HN = F.HN;
    const cnt = new Uint8Array(HN * KN), total = new Uint8Array(HN), pW = new Int16Array(HN).fill(-1), pC = new Int16Array(HN).fill(-1), sp = new Int16Array(HN).fill(-1);
    const pWv = new Uint8Array(HN), pCv = new Uint8Array(HN), spv = new Uint8Array(HN);
    for (const I of ITEMS) {
        if (!I.exists) continue;
        const A = I.arrive, f8 = I.fit8, k = KI[I.kind], cool = I.M.key === 'pulseCool', isP = I.kind === 'pulse', isS = I.kind === 'spice';
        for (let c = 0; c < HN; c++) {
            if (f8[c] < 77 || (st.best ? A[c] === 65535 : A[c] > t10)) continue;
            cnt[c * KN + k]++; total[c]++;
            if (isP) { if (cool) { if (f8[c] > pCv[c]) { pCv[c] = f8[c]; pC[c] = I.id; } } else if (f8[c] > pWv[c]) { pWv[c] = f8[c]; pW[c] = I.id; } }
            else if (isS && f8[c] > spv[c]) { spv[c] = f8[c]; sp[c] = I.id; }
        }
    }
    return { cnt, total, pW, pC, sp, t10 };
}
const itemAt = (I, hc) => I.exists && I.fit8[hc] >= 77 && (st.best ? I.arrive[hc] < 65535 : I.arrive[hc] <= D.CC.t10);
function derive() {
    const T = cutoff(), foods = new Float32Array(9), o = {}, beastK = new Float32Array(8);
    const d = D = {
        staple: new Uint8Array(N), second: new Uint8Array(N), score: new Float32Array(N), life: new Uint8Array(N), life2: new Uint8Array(N), beast: new Int8Array(N).fill(-1),
        people: new Float32Array(N), month: new Int8Array(N).fill(-1), lean: new Uint8Array(N), risk: new Uint8Array(N), farmV: new Float32Array(N), rainV: new Float32Array(N),
        water: new Float32Array(N), harv: new Float32Array(N), lineage: new Int16Array(N).fill(-1), lineCrop: new Int8Array(N).fill(-1), arrive: new Float32Array(N), foods: new Float32Array(9 * N),
        gather: new Float32Array(N), landP: new Float32Array(N), plough: new Uint8Array(N), T,
        fieldVar: new Int16Array(N).fill(-1), fieldShare: new Float32Array(N), field2: new Int16Array(N).fill(-1), slot2: new Int8Array(N).fill(-1), pulse: new Int8Array(N).fill(-1), pulse2: new Int8Array(N).fill(-1),
        staplesN: new Uint8Array(N), VL: variantLeaders(T),
    };
    for (let k = 0; k < N; k++) {
        if (L.ocean[k] || L.tW[k] < 0) continue;
        const j = (k / W) | 0, i = k - j * W, hc = (j >> 1) * HW + (i >> 1);
        let allow = 0, herdOK = 0;
        for (let a = 0; a < 5; a++) if (st.best || Hs.best[a][hc] <= T) allow |= 1 << a;
        for (const b of F.HERDING) if (st.best ? Hs.has[G.mass[hc] >= 0 ? G.mass[hc] : 0]?.[b] : Hs.best[5 + b][hc] <= T) { herdOK = 1; break; }
        const s = F.placeFood(L, k, st.tech, allow, herdOK, foods, o);
        for (let q = 0; q < 9; q++) d.foods[9 * k + q] = foods[q];
        const g = F.gatherAt(L, k), herdScore = foods[5] / 0.5;
        const landP = s === 5 ? 2 * herdScore : s ? 60 * o.cropV * F.croppedShare(L, k, st.tech.flood ? L.flood[k] : 0) : 0;
        d.farmV[k] = o.v; d.rainV[k] = o.rainV; d.water[k] = o.water; d.harv[k] = o.harv; d.gather[k] = g.people; d.landP[k] = landP;
        d.arrive[k] = Hs.farmTime[hc] - Hs.tFirst;
        // beasts here: the best kept of those that came (or, best possible, of the landmass's)
        let bb = -1, bv = 0.12; const home = larderPx(k).n;
        for (let b = 0; b < 8; b++) {
            const came = st.best ? !!Hs.has[G.mass[hc]]?.[b] : Hs.best[5 + b][hc] <= T;
            if (!came) continue;
            const kv = F.keepAt(L, k, b); if (kv < 0.15) continue;
            // (the beast most at home here leads: its wild range, then how well it is kept)
            const sc = 0.65 * home[5 + b] + 0.35 * kv * (b === 6 ? 0.8 : 1); beastK[b] = kv;
            if (sc > bv) { bv = sc; bb = b; }
        }
        d.beast[k] = bb;
        let plough = 0; for (const b of F.PLOUGH) if ((st.best ? !!Hs.has[G.mass[hc]]?.[b] : Hs.best[5 + b][hc] <= T) && F.keepAt(L, k, b) > 0.15) plough = 1;
        if (L.diseaseBelt[k] > 0.5) plough = 0;
        d.plough[k] = plough;
        // the way of life: gatherers hold unless farming or herding would feed ten times as many
        let staple, life, people, second = 0, life2 = 0;
        if (g.people >= 0.005 && g.people * 10 > landP) {
            staple = g.fish >= g.wild ? 6 : 7; people = g.people;
            life = g.fish >= 0.35 && L.et[k] >= 9.5 && L.et[k] <= 16.5 ? 10 : 11;
            if (landP >= 0.9 * 10 * g.people) { second = s; }
        } else if (s && landP >= 0.005) {
            staple = s; people = landP;
            const cropF = o.cropV;
            if (s === 5) life = cropF >= 0.5 * foods[5] && L.pAnn[k] > 250 && L.pAnn[k] < 850 ? 8 : 9;
            else if (s === 1) life = 1;
            else if (o.water > 0.4 && L.wet[k] < 0.3) life = 2;
            else if (L.elev[k] > 1.9 && Math.abs(F.LAT[j]) < 30) life = 7;
            else if ((s === 4 || s === 8) && L.tC[k] >= 16 && L.pAnn[k] >= 1300) life = 6;
            else if (!plough) life = 5;
            else if (foods[5] >= 0.6 * cropF && L.pAnn[k] > 250 && L.pAnn[k] < 850) life = 8;
            else if (L.winterShare[k] >= 0.5 || L.wet[k] < 0.7) life = 3;
            else life = 4;
            // a second food where it does nearly as well
            let sv = 0; for (let q = 1; q < 9; q++) if (q !== s && foods[q] > sv) { sv = foods[q]; second = q; }
            if (sv < 0.9 * foods[s]) second = 0;
            if (g.people * 10 >= 0.9 * landP) second = second || (g.fish >= g.wild ? 6 : 7);
        } else { staple = 0; life = 0; people = 0; }
        d.staple[k] = staple; d.second[k] = second; d.life[k] = life; d.people[k] = people;
        d.score[k] = staple >= 6 ? Math.sqrt(Math.min(1, (staple === 6 ? g.fish / 2.5 : g.wild / 0.38))) : staple === 5 ? herdScore : staple ? Math.min(1, foods[staple] / F.CK[F.CROPS[[0, 0, 1, 2, 3, 0, 0, 0, 4][staple]]].weight) : 0;
        // the lineage: which centre the leading crop's strain came from
        if (o.crop) { const a = [0, 0, 1, 2, 3, 0, 0, 0, 4][o.crop]; const s0 = Hs.lab[a][hc]; if (s0 >= 0 && !st.best) { d.lineage[k] = Hs.strains[s0].centre; d.lineCrop[k] = a; } }
        // (the crops: the field's leading variant and a second season's crop; pulses, orchards, spices and gardens stack)
        if (life >= 1 && life <= 8 && o.crop) {
            const a = [0, 0, 1, 2, 3, 0, 0, 0, 4][o.crop], VL = d.VL;
            d.fieldVar[k] = VL.lead[a][hc]; d.fieldShare[k] = VL.share[a][hc]; if (VL.share2[a][hc] >= 0.25) d.field2[k] = VL.second[a][hc];
            const arrived = q => st.best || Hs.best[q][hc] <= T;
            if (a !== 1 && a !== 4 && arrived(1) && foods[2] >= 0.22 && L.tC[k] >= -6 && L.warmM[k] >= 7) d.slot2[k] = 1;
            else if (a === 1 && L.warmM[k] >= 8) { let b = -1, bv = 0.25; for (const q of [0, 2]) if (arrived(q) && foods[F.CROP_STAPLE[q]] / F.CK[F.CROPS[q]].weight > bv) { bv = foods[F.CROP_STAPLE[q]] / F.CK[F.CROPS[q]].weight; b = q; } d.slot2[k] = b; }
            let staples = 0; for (let q = 0; q < 5; q++) if (arrived(q) && foods[F.CROP_STAPLE[q]] > 0.06) staples++;
            d.staplesN[k] = staples;
        }
        // the calendar: the leading crop's month, the lean months before it, the risk
        if (life >= 1 && life <= 8 && o.crop) {
            d.month[k] = o.month;
            const buffer = (foods[5] > 0.3 * o.cropV || g.fish > 0.3) ? 1 : 0;
            d.lean[k] = o.month === 12 || o.harv >= 1.6 ? 0 : Math.max(0, (o.crop === 4 || o.crop === 8 ? 1 : 3) - buffer);
            const drought = (1 - o.water) * sm(0.62, 0.3, L.wet[k]), failed = (1 - o.water) * sm(0.75, 1.15, L.seas[k]) * sm(0.3, 0.45, L.wet[k]) * sm(1.4, 1.0, L.wet[k]);
            const frost = Math.max(sm(6.5, 4.5, L.warmM[k]), sm(-1, -6, L.tC[k]) * sm(8, 6, L.warmM[k])), flood = Math.max(L.flood[k], L.wetland[k]) * 0.9;
            const r = [0.33, drought, failed, frost, flood]; let ri = 0; for (let q = 1; q < 5; q++) if (r[q] > r[ri]) ri = q;
            d.risk[k] = ri;
        }
    }
    // (the harvest month read over its neighbourhood, ~150 km: a circular mean on the year's wheel, so a region harvests
    // together rather than in confetti; "all year" where most of the neighbourhood is)
    const mo = d.month, out = new Int8Array(N).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x; if (mo[k] < 0) continue;
        let sx = 0, sy = 0, n = 0, all = 0;
        for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -2; dx <= 2; dx++) { const m = mo[yy * W + (x + dx + W) % W]; if (m < 0) continue; n++; if (m === 12) { all++; continue; } const a = m / 12 * 2 * Math.PI; sx += Math.cos(a); sy += Math.sin(a); } }
        out[k] = all * 2 > n ? 12 : ((Math.round(Math.atan2(sy, sx) / (2 * Math.PI) * 12) % 12) + 12) % 12;
    }
    d.month = out;
    d.CC = cropCounts(T);
    tallies();
}
// shares of the land (area-weighted) per view
let TL = {};
function tallies() {
    const t = { staple: new Float64Array(9), life: new Float64Array(12), simple: new Float64Array(4), beast: new Float64Array(9), month: new Float64Array(14), lean: new Float64Array(5), risk: new Float64Array(5), cls: new Float64Array(5), soil: new Float64Array(5), people: 0, land: 0, byLife: new Float64Array(4), arrived: 0, farmable: 0, belt: 0 };
    const kmPx = (F.LAT ? 6371 * Math.PI / 360 : 0) ** 2;
    for (let k = 0; k < N; k++) {
        if (L.ocean[k]) continue;
        const j = (k / W) | 0, a = F.COS[j];
        t.land += a;
        if (L.tW[k] < 0) { t.staple[0] += a; t.life[0] += a; t.simple[0] += a; continue; }
        t.staple[D.staple[k]] += a; t.life[D.life[k]] += a; t.simple[LIFE[D.life[k]][2]] += a; t.beast[D.beast[k] + 1] += a;
        t.month[D.month[k] + 1] += a; if (D.life[k] >= 1 && D.life[k] <= 8) t.lean[Math.min(4, D.lean[k])] += a; t.risk[D.risk[k]] += a * (D.life[k] >= 1 && D.life[k] <= 8 ? 1 : 0);
        t.cls[farmClass(D.farmV[k])] += a; const s = L.soil[k]; t.soil[s >= 0.75 ? 4 : s >= 0.5 ? 3 : s >= 0.3 ? 2 : s >= 0.12 ? 1 : 0] += a;
        t.people += a * kmPx * D.people[k]; t.byLife[LIFE[D.life[k]][2]] += a * kmPx * D.people[k];
        if (D.farmV[k] > 0.25) { t.farmable += a; if (D.arrive[k] <= (st.full ? Infinity : st.years)) t.arrived += a; }
        if (L.diseaseBelt[k] > 0.5) t.belt += a;
    }
    const nz = x => x / Math.max(1e-9, t.land);
    for (const key of ['staple', 'life', 'simple', 'beast', 'month', 'cls', 'soil']) t[key] = t[key].map(nz);
    const farmed = t.lean.reduce((s, v) => s + v, 0); t.lean = t.lean.map(v => v / Math.max(1e-9, farmed)); t.risk = t.risk.map(v => v / Math.max(1e-9, farmed));
    t.belt = nz(t.belt);
    // (the crops: each variant's share; each crop's share of the land; each kind's mean and most per farming place)
    t.var = new Float64Array(Cr.variants.length); t.farmed = 0;
    const hcW = new Float64Array(F.HN);
    for (let k = 0; k < N; k++) {
        if (L.ocean[k] || L.tW[k] < 0) continue;
        const a = F.COS[(k / W) | 0], j = (k / W) | 0, hc = (j >> 1) * HW + ((k - j * W) >> 1);
        if (D.fieldVar[k] >= 0) t.var[D.fieldVar[k]] += a;
        if (D.life[k] >= 1 && D.life[k] <= 8) { t.farmed += a; hcW[hc] += a; }
    }
    t.var = t.var.map(v => v / Math.max(1e-9, t.land));
    t.item = new Float64Array(ITEMS.length); t.kindMean = new Float64Array(KN); t.kindMax = new Uint8Array(KN); t.varietyMean = 0; t.varietyMax = 0;
    const CC = D.CC;
    for (const I of ITEMS) { if (!I.exists) continue; let sum = 0; for (let c = 0; c < F.HN; c++) if (hcW[c] > 0 && itemAt(I, c)) sum += hcW[c]; t.item[I.id] = sum / Math.max(1e-9, t.land); }
    for (let c = 0; c < F.HN; c++) { if (!(hcW[c] > 0)) continue; for (let q = 0; q < KN; q++) { const v = CC.cnt[c * KN + q]; t.kindMean[q] += hcW[c] * v; if (v > t.kindMax[q]) t.kindMax[q] = v; } }
    for (let q = 0; q < KN; q++) t.kindMean[q] /= Math.max(1e-9, t.farmed);
    for (let k = 0; k < N; k++) { if (!(D.life[k] >= 1 && D.life[k] <= 8)) continue; const j = (k / W) | 0, hc = (j >> 1) * HW + ((k - j * W) >> 1), v = D.staplesN[k] + CC.total[hc]; t.varietyMean += F.COS[j] * v; if (v > t.varietyMax) t.varietyMax = v; }
    t.varietyMean /= Math.max(1e-9, t.farmed);
    t.items = ITEMS.filter(I => I.exists).length; t.noland = ITEMS.filter(I => I.noland).length; t.passed = ITEMS.length - t.items - t.noland;
    TL = t;
}

// ── painting ──
const canvas = document.getElementById('map'), ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H);
const stripe = (x, y) => (x + y) % 6 < 2, hatch = (x, y) => (x - y + 720) % 7 === 0;
function paint() {
    const px = img.data, c = [0, 0, 0], tmp = [0, 0, 0], v = st.view, sub = st.sub[v], T = D.T, yrs = st.full ? Infinity : st.years;
    for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
        const o = 4 * k, sh = shade[k];
        if (L.ocean[k]) { px[o] = SEA[0] * sh; px[o + 1] = SEA[1] * sh; px[o + 2] = SEA[2] * sh; px[o + 3] = 255; continue; }
        if (L.tW[k] < 0) { const si = 0.92 + 0.08 * (sh - 0.9); px[o] = ICE[0] * si; px[o + 1] = ICE[1] * si; px[o + 2] = ICE[2] * si; px[o + 3] = 255; continue; }
        let col = c;
        if (v === 'farmland') {
            if (sub === 'soil') ramp(SOIL, L.soil[k], c);
            else if (sub === 'season') ramp(SEASON, st.watered ? L.warmM[k] : L.rainM[k], c);
            else {
                const fv = D.farmV[k], fr = D.rainV[k], share = fv > 0.02 ? Math.max(0, Math.min(1, (fv - fr) / fv)) : 0, xv = st.classes ? CLASS_AT[farmClass(fv)] : fv;
                ramp(FARM_RAIN, xv, c);
                if (share > 0) { ramp(FARM_WATER, xv, tmp); const t = st.classes ? (share >= 0.5 ? 1 : 0) : sm(0, 0.8, share); for (let i = 0; i < 3; i++) c[i] += (tmp[i] - c[i]) * t; }
            }
        } else if (v === 'calendar') {
            const life = D.life[k];
            if (!(life >= 1 && life <= 8)) col = PALE;
            else if (sub === 'harvest') col = D.month[k] === 12 ? ALLYEAR : D.month[k] >= 0 ? MONTH_RGB[D.month[k]] : NONE;
            else if (sub === 'lean') ramp(LEAN, D.lean[k], c);
            else col = RISK[D.risk[k]][1];
        } else if (v === 'origins') {
            if (sub === 'when') {
                const t = D.arrive[k];
                if (t === Infinity) col = hatch(x, y) ? [150, 146, 138] : NONE;
                else if (t > yrs) col = hatch(x, y) ? [176, 170, 156] : [226, 220, 206];
                else { ramp(ARRIVE, Math.floor(t / 1000) * 1000 + 500, c); }
            } else if (sub === 'from') {
                const id = D.lineage[k];
                if (st.best) col = NONE;
                else if (id < 0 || !(D.arrive[k] <= yrs)) col = D.staple[k] >= 6 || D.staple[k] === 5 ? PALE : [226, 220, 206];
                else { const C = Hs.centres[id], h = hearthCol[id]; col = C.primary ? mix(h, 0.85) : (stripe(x, y) ? mix(h, 0.85) : mix(h, 0.35)); }
            } else {
                const lar = larderPx(k);
                if (st.only.larder >= 0) { const a = st.only.larder; col = a === 5 ? (lar.beast >= 0 ? mix(BEAST_RGB[lar.beast], 0.3 + 0.6 * lar.bv) : PALE) : mix(ARCH_RGB[a], 0.9 * sm(0.1, 0.8, lar.n[a])); }
                else ramp(VARIETY, lar.variety, c);
            }
        } else if (v === 'crops') {
            const life = D.life[k], farmedHere = life >= 1 && life <= 8, hc = (y >> 1) * HW + (x >> 1), only = st.only, CC = D.CC;
            if (only.item >= 0 && sub !== 'fields') {
                const I = ITEMS[only.item], rgb = I.M.rgb || KINDS[KI[I.kind]].rgb, f = I.fit8[hc];
                col = !farmedHere ? PALE : itemAt(I, hc) ? mix(rgb, 0.35 + 0.55 * f / 255) : f >= 77 && hatch(x, y) ? mix(rgb, 0.45) : [222, 216, 202];
            } else if (sub === 'fields') {
                if (only.crop >= 0) {
                    const V = Cr.variants[only.crop], a = V.a, VL = D.VL;
                    const sh = VL.lead[a][hc] === only.crop ? VL.share[a][hc] : VL.second[a][hc] === only.crop ? VL.share2[a][hc] : 0;
                    const came = st.best ? V.arrive[hc] < Infinity : V.arrive[hc] <= T;
                    col = sh > 0.02 ? mix(STAPLE_RGB[[1, 2, 3, 4, 8][a]], 0.25 + 0.65 * sh) : !came && G.fit[a][hc] >= 0.3 && hatch(x, y) ? mix(STAPLE_RGB[[1, 2, 3, 4, 8][a]], 0.45) : PALE;
                } else if (!farmedHere || D.fieldVar[k] < 0) col = PALE;
                else {
                    const s2 = D.slot2[k];
                    col = s2 >= 0 && stripe(x, y) ? mix(STAPLE_RGB[[1, 2, 3, 4, 8][s2]], 0.8) : mix(STAPLE_RGB[D.staple[k] >= 1 && D.staple[k] <= 4 || D.staple[k] === 8 ? D.staple[k] : [1, 2, 3, 4, 8][Cr.variants[D.fieldVar[k]].a]], 0.88);
                }
            } else if (!farmedHere) col = PALE;
            else if (sub === 'pulses') {
                const p = CC.pC[hc] >= 0 && CC.pW[hc] >= 0 && stripe(x, y) ? CC.pC[hc] : CC.pW[hc] >= 0 ? CC.pW[hc] : CC.pC[hc];
                col = p >= 0 ? mix(ITEMS[p].M.rgb, 0.85) : [222, 216, 202];
            } else if (sub === 'spice') {
                const p = CC.sp[hc]; col = p >= 0 ? mix(ITEMS[p].M.rgb, 0.92) : [222, 216, 202];
            } else if (sub === 'variety') ramp(VARIETY_ALL, D.staplesN[k] + CC.total[hc], c);
            else {
                const ks = sub === 'other' ? [KI.stimulant, KI.fibre] : [KINDS.findIndex(K => K.sub === sub)];
                let n = 0, mx = 0; for (const q of ks) { n += CC.cnt[hc * KN + q]; mx += TL.kindMax ? TL.kindMax[q] : 8; }
                const rgb = sub === 'other' ? [110, 96, 150] : KINDS[ks[0]].rgb;
                col = n ? mix(rgb, 0.18 + 0.77 * Math.min(1, Math.sqrt(n / Math.max(3, mx)))) : [222, 216, 202];
            }
        } else if (v === 'staple') {        } else if (v === 'staple') {
            const only = st.only.staple;
            if (only) { const f = only >= 6 ? (only === 6 ? Math.sqrt(Math.min(1, F.gatherAt(L, k).fish / 2.5)) : Math.sqrt(Math.min(1, F.gatherAt(L, k).wild / 0.38))) : only === 5 ? D.foods[9 * k + 5] / 0.5 : Math.min(1, D.foods[9 * k + only] / [0, 1.4, 0.9, 1, 0.85, 0, 0, 0, 1.5][only]); col = mix(STAPLE_RGB[only], 0.9 * sm(0.04, 0.8, f) ** 0.8); }
            else { const s2 = D.second[k], s = s2 && stripe(x, y) ? s2 : D.staple[k]; col = mix(STAPLE_RGB[s], s ? 0.9 * sm(0.04, 0.8, s === D.staple[k] ? D.score[k] : 0.6) ** 0.8 : 0); }
        } else if (v === 'animals') {
            const b = D.beast[k], only = st.only.animals;
            if (only >= 0) { const came = st.best ? !!Hs.has[G.mass[((y >> 1) * HW + (x >> 1))]]?.[only] : Hs.best[5 + only][(y >> 1) * HW + (x >> 1)] <= T; const kv = F.keepAt(L, k, only); col = came ? mix(BEAST_RGB[only], 0.9 * sm(0.1, 0.7, kv)) : (kv > 0.3 && hatch(x, y) ? mix(BEAST_RGB[only], 0.5) : PALE); }
            else col = b >= 0 ? mix(BEAST_RGB[b], 0.4 + 0.5 * sm(0.2, 0.7, F.keepAt(L, k, b))) : PALE;
            if (L.diseaseBelt[k] > 0.5 && hatch(x, y)) col = [92, 70, 52];
        } else if (v === 'life') {
            const l = D.life[k];
            col = st.simple ? mix(SIMPLE[LIFE[l][2]][1], l ? 0.5 + 0.4 * sm(0, 1.5, Math.log10(1 + D.people[k])) : 0) : mix(LIFE[l][1], l ? 0.55 + 0.35 * sm(0, 1.5, Math.log10(1 + D.people[k])) : 0);
        } else if (v === 'people') ramp(PEOPLE, Math.log10(1 + D.people[k]), c);
        // (the rivers, faintly, on the land)
        let r = col[0], g = col[1], b = col[2];
        if (L.river[k] >= 2 && v !== 'origins' && v !== 'crops') { const t = L.river[k] === 3 ? 0.55 : 0.35; r += (70 - r) * t; g += (120 - g) * t; b += (170 - b) * t; }
        px[o] = Math.min(255, r * sh); px[o + 1] = Math.min(255, g * sh); px[o + 2] = Math.min(255, b * sh); px[o + 3] = 255;
    }
    // (the farming fronts: thin lines between the thousand-year bands)
    if (v === 'origins' && sub === 'when') {
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
            const k = y * W + x; if (L.ocean[k]) continue;
            const b0 = band(k, yrs), b1 = L.ocean[k + 1] ? b0 : band(k + 1, yrs), b2 = L.ocean[k + W] ? b0 : band(k + W, yrs);
            if (b0 !== b1 || b0 !== b2) { const o = 4 * k; px[o] *= 0.55; px[o + 1] *= 0.55; px[o + 2] *= 0.55; }
        }
    }
    if (v === 'crops' && sub === 'fields' && st.only.crop < 0) {
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
            const k = y * W + x, a = D.fieldVar[k]; if (a < 0) continue;
            const r = D.fieldVar[k + 1], b = D.fieldVar[k + W];
            if ((r >= 0 && r !== a && Cr.variants[r].a === Cr.variants[a].a) || (b >= 0 && b !== a && Cr.variants[b].a === Cr.variants[a].a)) { const o = 4 * k; px[o] *= 0.5; px[o + 1] *= 0.5; px[o + 2] *= 0.5; }
        }
    }
    ctx.putImageData(img, 0, 0);
    pins();
}
const band = (k, yrs) => { const t = D.arrive[k]; return t === Infinity ? -2 : t > yrs ? -1 : Math.floor(t / 1000); };
const larderCache = new Map();
function larderPx(k) {
    let r = larderCache.get(k); if (r) return r;
    const n = new Float32Array(F.NA); F.larderAt(L, k, n);
    let variety = 0; for (let a = 0; a < 5; a++) variety += sm(0.15, 0.45, n[a]);
    let beast = -1, bv = 0.3; for (let b = 0; b < 8; b++) if (n[5 + b] > bv) { bv = n[5 + b]; beast = b; }
    r = { n, variety, beast, bv }; larderCache.set(k, r); return r;
}
// primaries numbered 1… in order; secondaries a, b, c…
let primaryIds = [], hearthCol = [];
function setHistory(h) { Hs = h; primaryIds = Hs.centres.filter(c => c.primary).map(c => c.id); hearthCol = Hs.centres.map(C => HEARTH_RGB[hearthIndex(C.id) % HEARTH_RGB.length]); Cr = F.runCrops(L, G, Hs, Mn, st.roll, false); nameVariants(); }
function hearthIndex(id) { const i = primaryIds.indexOf(id); return i >= 0 ? i : primaryIds.length + Hs.centres.filter(c => !c.primary && c.id < id).length; }
function centreLabel(C) { if (C.primary) return String(primaryIds.indexOf(C.id) + 1); return '·'; }
function pins() {
    const box = document.getElementById('pins'); box.innerHTML = '';
    if (st.view === 'crops' && !st.best) {
        const yrs = st.full ? Infinity : st.years, sub = st.sub.crops;
        const homePin = (h, I) => { if (h.t - Hs.tFirst > yrs) return; const el = document.createElement('span'); el.className = 'pin pin-home'; const J = (h.cell / HW) | 0; el.style.left = `${((h.cell % HW) + 0.5) / HW * 100}%`; el.style.top = `${(J + 0.5) / F.HH * 100}%`; el.style.setProperty('--pin', css(I.M.rgb || KINDS[KI[I.kind]].rgb)); el.title = `${I.label}: first grown here, ~${fmtY(h.t - Hs.tFirst)} years after the first farming, ${likeOf(h.site)}`; box.appendChild(el); };
        if (st.only.item >= 0 && sub !== 'fields') { const I = ITEMS[st.only.item]; for (const h of I.homes) homePin(h, I); return; }
        if (sub === 'spice') { for (const I of ITEMS) if (I.exists && I.kind === 'spice') for (const h of I.homes) homePin(h, I); return; }
        if (sub === 'fields' || sub === 'variety') for (const C of Hs.centres) { if (!C.primary || C.t0 - Hs.tFirst > yrs) continue; const el = document.createElement('span'); el.className = C.founder ? 'pin pin-founder' : 'pin'; el.style.left = `${(C.lon + 180) / 360 * 100}%`; el.style.top = `${(90 - C.lat) / 180 * 100}%`; el.style.setProperty('--pin', css(hearthCol[C.id])); el.textContent = centreLabel(C); box.appendChild(el); }
        return;
    }
    if (st.view !== 'origins' || st.best) return;
    const yrs = st.full ? Infinity : st.years;
    for (const C of Hs.centres) {
        const t = C.t0 - Hs.tFirst; if (t > yrs) continue;
        if (!C.primary && (st.sub.origins !== 'from' || !C.items.some(it => it.a < 5 && it.t - Hs.tFirst <= yrs))) continue;
        const el = document.createElement('span'), h = hearthCol[C.id];
        el.className = C.primary ? (C.founder ? 'pin pin-founder' : 'pin') : 'pin pin-sec';
        el.style.left = `${(C.lon + 180) / 360 * 100}%`; el.style.top = `${(90 - C.lat) / 180 * 100}%`;
        el.style.setProperty('--pin', css(h));
        el.textContent = C.primary ? centreLabel(C) : '';
        el.title = `${C.primary ? `${C.founder ? 'Founder hearth' : 'Hearth'} ${centreLabel(C)}` : 'Secondary centre'}: ${C.items.filter(it => it.t - Hs.tFirst <= yrs).map(it => ARCH_WORDS[it.a].toLowerCase()).join(', ')}`;
        box.appendChild(el);
    }
}

// ── the legend ──
const chip = (act, label, on, title = '', sw = null) => `<button type="button" class="chip${on ? ' on' : ''}" data-act="${act}" aria-pressed="${on}"${title ? ` title="${title}"` : ''}>${sw ? `<i style="background:${css(sw)}"></i>` : ''}${label}</button>`;
const swatch = (c, label, share) => `<span class="sw"><i style="background:${css(c)}"></i>${label}${share != null ? ` <em>${pct(share)}</em>` : ''}</span>`;
const bar = (stops, label, from, to) => `<div class="bar"><i style="background:${gradient(stops, from, to)}"></i><span>${label}</span></div>`;
const head = t => `<div class="lg-head">${t}</div>`, note = t => `<p class="lg-note">${t}</p>`;
const techChips = () => [['flood', 'Flood farming'], ['canal', 'Canals'], ['terrace', 'Terraces'], ['raised', 'Raised fields']].map(([k, w]) => chip(`tech:${k}`, w, st.tech[k])).join('');
const bestChip = () => chip('best', 'Best possible', st.best, 'What the land alone would support, as if every crop and beast had come');
function legend() {
    const v = st.view, sub = st.sub[v], t = TL;
    if (v === 'farmland') {
        if (sub === 'soil') return head('Soil — how fertile the ground is (on flat ground)') + bar(SOIL, 'poor → rich') +
            `<div class="sws">${['Barren', 'Poor', 'Middling', 'Good', 'Rich'].map((w, i) => swatch(ramp(SOIL, [0.05, 0.2, 0.4, 0.62, 0.88][i]), w, t.soil[i])).reverse().join('')}</div>` +
            note('River silt richest, then volcanic ash; black earth under temperate grassland; leached in the hot wet tropics; acid under boreal conifers.');
        if (sub === 'season') return head(`Growing season — the months crops grow, ${st.watered ? 'watered' : 'by rain alone'}`) + `<div class="chips">${chip('watered', 'Watered', st.watered)}</div>` + bar(SEASON, '0 → 12 months') +
            note('A month counts when it is warm enough (from 5 °C, fully at 15) and wet enough: its rain, snowmelt and the soil’s stored water reach about half of what it could evaporate.');
        const cls = [4, 3, 2, 1].map(i => swatch(ramp(FARM_RAIN, CLASS_AT[i]), CLASS_WORDS[i], t.cls[i])).join('');
        return head('Farmland — what the land could grow') + `<div class="chips">${techChips()}${chip('classes', 'Classes', st.classes)}</div>` +
            (st.classes ? `<div class="sws">${cls}</div>` : bar(FARM_RAIN, 'by rain: little → much') + bar(FARM_WATER, 'only with water brought')) +
            note(`Good: one sure harvest a year. Excellent: two or three, off renewed ground. Good or excellent: ${pct(t.cls[3] + t.cls[4])} of the land.`);
    }
    if (v === 'calendar') {
        const top = `<div class="chips">${bestChip()}</div>`;
        if (sub === 'lean') return head('Lean months — the hungry gap before the harvest') + top +
            `<div class="sws">${['None', '1 month', '2 months', '3 months'].map((w, i) => swatch(ramp(LEAN, i), w, t.lean[i])).join('')}</div>` +
            note('Two or three months before a single yearly harvest, when last year’s grain runs out. None with two harvests a year; one where roots wait in the ground; one fewer where herds or fish fill the gap.');
        if (sub === 'risk') return head('Harvest risk — what most often ruins a harvest') + top +
            `<div class="sws">${RISK.map(([w, c], i) => swatch(c, w, t.risk[i])).join('')}</div>` +
            note('Drought at the dry edge, failed rains where the year’s rain comes in a few months, frost at the cold edge and on high ground, floods on the river plains. Shares are of the farmed land.');
        const ring = `<div class="ring">${MONTHS.map((m, i) => `<span style="--c:${css(MONTH_RGB[i])}">${m}</span>`).join('')}<span style="--c:${css(ALLYEAR)}">All year</span></div>`;
        return head('Harvest month — when the main crop comes in') + top + ring +
            note('The month the leading crop first ripens. The two hemispheres mirror each other, and monsoon harvests stand apart from winter-grain ones. “All year” where roots or tree crops can be taken any time. Herders and gatherers left pale.');
    }
    if (v === 'origins') {
        const ageChips = `<div class="chips">${chip('years10', '10,000 years', !st.full && st.years === 10000)}${chip('full', 'Full spread', st.full)}</div>`;
        const slider = '';
        if (sub === 'larder') {
            const ch = [...[0, 1, 2, 3, 4].map(a => chip(`larder:${a}`, ARCH_WORDS[a], st.only.larder === a, '', ARCH_RGB[a])), chip('larder:5', 'Herd beasts', st.only.larder === 5, '', [150, 120, 90])].join('');
            return head(st.only.larder >= 0 ? `Wild larder — ${st.only.larder === 5 ? 'the wild herd beasts' : `wild ${ARCH_WORDS[st.only.larder].toLowerCase()}`}` : 'Wild larder — how many kinds of wild ancestor grow here') + `<div class="chips">${ch}</div>` +
                (st.only.larder >= 0 ? '' : bar(VARIETY, '0 · 1 · 2 · 3 · 4 kinds', 0, 4)) +
                note('Where each archetype’s wild ancestor grows. That is its domestication niche, not where the crop later thrives: big-seeded grasses where winter rain is followed by a long summer drought, a wild paddy grass in seasonal wetlands, wild tubers on the forest–savanna edge. Hearths start where several overlap on strongly seasonal ground.');
        }
        const list = timeline();
        if (sub === 'from') return head('From which hearth — where each place’s leading crop came from') + `<div class="chips">${bestChip()}</div>` + ageChips + slider + list +
            note('Each colour is a hearth’s lineage. Striped areas grew a crop from a secondary centre: farmers arrived, and a local wild plant the newcomers lacked was domesticated there (as rye and oats were in Europe). Borders fall along deserts, mountains and open sea.');
        return head('When farming came — thousand-year bands from the first hearth') + ageChips + slider +
            bar(ARRIVE, '0 · 2,000 · 4,000 · 6,000 · 8,000 · 10,000+ years', 0, 10000) +
            `<div class="sws">${swatch([226, 220, 206], 'not yet', null)}${swatch(NONE, 'never: no crop of theirs grows there', null)}</div>` + list +
            note(`Every planet gets 2–4 <b>founder hearths</b> (ringed): far apart, each leading with a different staple where it can, all starting within ~1,500 years, and taking up more of their wild larder, so there are several rich, varied farming cores from early on. Farming reached ${pct(t.arrived / Math.max(1e-9, t.farmable))} of the farmable land by ${st.full ? 'the end' : `${fmtY(st.years)} years`}. Fronts run fast along coasts and rivers, slow through rich foragers’ land, and stall at a climate edge until another strain comes.`);
    }
    if (v === 'crops') {
        const pulls = [['free', 'Mix freely', 'Names by climate alone: neighbours may be like opposite ends of Earth'], ['regional', 'Regional', 'Neighbouring hearths lean toward Earth regions near each other'], ['strict', 'Keep worlds apart', 'Neighbours keep to one side of Earth’s oceans: no Old and New World mixing']];
        const reals = [['earth', 'Earth-like', 'Popular, nourishing crops much likelier; crops first grown where their Earth home would be'], ['balanced', 'Balanced', 'Popularity, nourishment and Earth’s geography lean, chance decides the rest'], ['wild', 'Anything goes', 'Chance decides: obscure crops as likely as staples, homes anywhere that suits them']];
        const seg = (label, opts, cur, act) => `<div class="likectl"><span>${label}</span><div class="seg" role="group" aria-label="${label}">${opts.map(([k, w, tt]) => `<button type="button" class="seg-b${cur === k ? ' on' : ''}" aria-pressed="${cur === k}" data-act="${act}:${k}" title="${tt}">${w}</button>`).join('')}</div></div>`;
        const controls = `<div class="chips">${bestChip()}${chip('renames', 'Re-roll crops', false, 'Draw the likenesses, names and other crops again; the staples’ history stays')}</div>${seg('Realism', reals, st.real, 'real')}${seg('Earth likeness', pulls, st.pull, 'pull')}`;
        const shareTxt = v => (v <= 0 ? 'not yet' : v < 0.01 ? `${(100 * v).toFixed(1)}%` : pct(v));
        const kindsOf = sub2 => (sub2 === 'variety' ? KINDS.map(K => K.key) : sub2 === 'other' ? ['stimulant', 'fibre'] : [KINDS.find(K => K.sub === sub2).key]);
        const finder = sub2 => { const ks = kindsOf(sub2), list = ITEMS.filter(I => I.exists && ks.includes(I.kind)).sort((a, b) => a.label.localeCompare(b.label)); return `<div class="finder"><label for="cropfind">Find a crop</label><input id="cropfind" list="cropnames" placeholder="${list.length} crops here — type a name…" autocomplete="off"><datalist id="cropnames">${list.map(I => `<option value="${I.label}"></option>`).join('')}</datalist></div>`; };
        const topChips = (sub2, n) => { const ks = kindsOf(sub2), list = ITEMS.filter(I => I.exists && ks.includes(I.kind) && t.item[I.id] > 0).sort((a, b) => t.item[b.id] - t.item[a.id]); return `<div class="chips">${list.slice(0, n).map(I => `<button type="button" class="chip${st.only.item === I.id ? ' on' : ''}" data-act="item:${I.id}" aria-pressed="${st.only.item === I.id}" title="${I.M.word}: first grown ${likeOf(I.homes[0]?.site)}"><i style="background:${css(I.M.rgb || KINDS[KI[I.kind]].rgb)}"></i>${I.label} <em>${shareTxt(t.item[I.id])}</em></button>`).join('')}${list.length > n ? `<em class="vmore">+${list.length - n} more: find them above</em>` : ''}</div>`; };
        const card = () => {
            const I = ITEMS[st.only.item]; if (!I) return '';
            const homes = I.homes.map(h => `~${fmtY(h.t - Hs.tFirst)} years after the first farming, at a place ${likeOf(h.site)}`).join('; and again ');
            return `<div class="card"><div class="card-h"><b>${I.label}</b><span>${KINDS[KI[I.kind]].word.toLowerCase()} · ${I.M.word.toLowerCase()}</span><button type="button" class="chip" data-act="item:${I.id}">Show all</button></div>
                <p>First grown ${homes} (the diamond${I.homes.length > 1 ? 's' : ''}). Grown on ${shareTxt(t.item[I.id])} of the land ${st.full ? 'in the end' : `by ${fmtY(st.years)} years`}; hatched where it would grow but never came.</p>
                <p>Like the real <b>${I.name}</b>, first grown in ${earthHome(I.it)}. <span class="meter">Popularity ${dots(I.pop)}</span> <span class="meter">Nourishment ${dots(I.nut)}</span></p>
                <a href="${wiki(I.it)}" target="_blank" rel="noopener">The real ${I.name} on Wikipedia ↗</a></div>`;
        };
        if (sub === 'fields') {
            const rows = [0, 1, 2, 3, 4].map(a => {
                const all = VBA[a].filter(i => t.var[i] > 0), vs = all.filter(i => t.var[i] >= 0.004 || st.only.crop === i).sort((x, y) => t.var[y] - t.var[x]), minor = all.length - vs.length;
                if (!vs.length) return '';
                return `<div class="vrow"><span class="vrow-l"><i style="background:${css(STAPLE_RGB[[1, 2, 3, 4, 8][a]])}"></i>${ARCH_WORDS[a]}</span><span class="chips">${vs.map(i => { const V = Cr.variants[i]; return `<button type="button" class="chip${st.only.crop === i ? ' on' : ''}" data-act="var:${i}" aria-pressed="${st.only.crop === i}" title="${V.like}, first grown at ${V.where}, ~${fmtY(V.t0 - Hs.tFirst)} years after the first farming${V.traits.length ? ' · ' + V.traits.join(', ') : ''}">${V.like} <em>${V.where.replace('hearth ', '#').replace('a secondary centre', '2°')} · ${pct(t.var[i])}</em></button>`; }).join('')}${minor > 0 ? `<em class="vmore">+${minor} local</em>` : ''}</span></div>`;
            }).join('');
            const likes = Hs.centres.filter(C => C.primary && C.site != null).map(C => `<span class="hl"><b style="background:${css(hearthCol[C.id])}">${centreLabel(C)}</b>${likeOf(C.site)}</span>`).join('');
            const V = st.only.crop >= 0 ? Cr.variants[st.only.crop] : null;
            const vcard = V && V.item ? `<div class="card"><div class="card-h"><b>${V.like}</b><span>${ARCH_SHORT[V.a]} from ${V.where}, ${likeOf(V.site)}</span></div><p>${V.traits.length ? `At home in its hearth’s climate: ${V.traits.join(', ')}. ` : ''}Like the real <b>${V.item.n}</b>, first grown in ${earthHome(V.item)}. <span class="meter">Popularity ${dots(V.item.pop ?? 0.5)}</span> <span class="meter">Nourishment ${dots(V.item.nut ?? 0.5)}</span></p><a href="${wiki(V.item)}" target="_blank" rel="noopener">The real ${V.item.n} on Wikipedia ↗</a></div>` : '';
            return head(V ? `${V.like} ${ARCH_SHORT[V.a]} from ${V.where}: its share of the fields (hatched: its kind grows there, this variant never came)` : 'Field crops: each place’s leading variant, and a second season’s crop striped') + controls + vcard +
                `<div class="hls">${likes}</div><div class="vrows">${rows}</div>` +
                note('Each hearth is like one or two of Earth’s regions where farming began, by its climate and, as Earth likeness sets, pulled toward what its neighbours are like; its crops are named from there, X-like. Realism sets how much a crop’s popularity and nourishment on Earth decide the names. Staples compete: one field and one season hold one leading variant, nearly winner-takes-all, a close second mixed in; a later arrival must be clearly better to take over. Thin lines mark where one variant of the same staple gives way to another. Summer and winter are two slots: the stripes show a winter grain after a summer crop, or the reverse. Click a variant for its card.');
        }
        const kindNote = {
            pulses: 'Pulses pair with whatever staple is there rather than competing with it. Each pulse’s range comes from the months: cool-season pulses (lentils, peas, chickpeas) are a winter crop in hot lands and a summer one in cold lands; warm-season beans reach cool-summer country; monsoon beans want warm, wet months; savanna peas want heat and stand drought. A summer pulse and a cool-season pulse do not compete: striped where a place grows both. Coloured by the leading pulse’s kind.',
            fruit: 'How many fruit and nut trees each farming place grows. Orchards come ~2,000 years after farming, then spread fast between farmers, strict about frost and winter chill.',
            veg: 'How many vegetables and herbs each farming place grows. Garden crops spread fastest of all, carried garden to garden; a landmass often domesticates its own.',
            spice: 'Spices barely spread: narrow niches on very wet tropical coasts and escarpments, dry slopes beside a monsoon, semi-arid hills, each kept within ~900 km of home (the diamonds). Each is a place’s specialty, an input for trade later.',
            other: 'Tea-, coffee- and cacao-like drinks and stimulants, and oil, fibre and dye crops (flax, hemp, cotton, indigo…): how many each farming place grows.',
            variety: `Every crop counted together, staples included: ${t.varietyMean.toFixed(1)} on average where farmed, ${t.varietyMax} at most. Richest near the old hearths and crossroads, thinning at frontiers and on far islands. This world grows ${t.items} of the catalogue’s ${ITEMS.length} crops; ${t.noland} have no farmed land that suits them, and ${t.passed} were passed over (realism: ${st.real === 'earth' ? 'popular crops kept' : st.real === 'wild' ? 'chance' : 'mostly popular'}).`,
        };
        const kindHead = { pulses: 'Pulses: the bean or pea grown beside the staple', fruit: 'Fruit & nuts: how many grow in each farming place', veg: 'Vegetables & herbs: how many grow in each farming place', spice: 'Spices: each grown only near where it was first grown (diamonds)', other: 'Drinks, stimulants, oil and fibre crops: how many grow in each place', variety: 'Variety: how many crops a farming place grows, of every kind' };
        const kindBars = sub === 'variety' ? `<div class="sws">${KINDS.map((K, q) => `<span class="sw"><i style="background:${css(K.rgb)}"></i>${K.word} <em>${t.kindMean[q].toFixed(1)} a place · ${t.kindMax[q]} at most</em></span>`).join('')}</div>` + bar(VARIETY_ALL, '0 · 3 · 7 · 12 · 18 · 24+ crops', 0, 24)
            : sub === 'pulses' || sub === 'spice' ? '' : `<div class="sws">${kindsOf(sub).map(k => `<span class="sw"><i style="background:${css(KINDS[KI[k]].rgb)}"></i>${KINDS[KI[k]].word} <em>${t.kindMean[KI[k]].toFixed(1)} a place · ${t.kindMax[KI[k]]} at most</em></span>`).join('')}</div>`;
        return head(st.only.item >= 0 ? `${ITEMS[st.only.item].label}: where it is grown` : kindHead[sub]) + controls + finder(sub) + card() + kindBars + topChips(sub, sub === 'variety' ? 24 : 16) + note(kindNote[sub] + ' Click the map for a place’s full list of crops.');
    }
    if (v === 'staple') {
        const only = st.only.staple, foods = [1, 2, 3, 4, 8, 5, 6, 7].map(s => `<button type="button" class="chip${only === s ? ' on' : ''}" data-act="staple:${s}" aria-pressed="${only === s}"><i style="background:${css(STAPLE_RGB[s])}"></i>${STAPLE_WORDS[s]} <em>${pct(t.staple[s])}</em></button>`).join('');
        return head(only ? `Staple food — ${STAPLE_WORDS[only].toLowerCase()} alone` : `Staple food — what each place lives on most${st.best ? ', best possible' : ', as it came'}`) + `<div class="chips">${bestChip()}</div><div class="chips">${foods}</div>` +
            bar([[0, PALE], [1, [150, 150, 150]]], 'paler where it feeds less well; striped where a second does nearly as well') +
            note('As it came: only the crops and herds that reached each place by then. <b>Tree & palm crops</b> are new: bananas, breadfruit, sago and dates as one archetype. They lead in the ever-wet tropics and at oases.');
    }
    if (v === 'animals') {
        const only = st.only.animals, ch = BEAST_WORDS.map((w, b) => `<button type="button" class="chip${only === b ? ' on' : ''}" data-act="beast:${b}" aria-pressed="${only === b}" title="${BEAST_LIKE[b]} — ${BEAST_ROLE[b]}"><i style="background:${css(BEAST_RGB[b])}"></i>${w} <em>${pct(t.beast[b + 1])}</em></button>`).join('');
        const lands = G.masses.filter(m => m.area > 2e6).sort((a, b) => b.area - a.area).slice(0, 4).map((m, i) => {
            const has = Hs.has[m.id], missing = BEAST_WORDS.filter((_, b) => !has[b] && [0, 2, 7].includes(b)).map(w => w.toLowerCase());
            const plough = [0, 2, 7].some(b => has[b]);
            return `<li><b>${'ABCD'[i]}</b> ${(m.area / 1e6).toFixed(0)} M km²: ${plough ? `plough by ${BEAST_WORDS.filter((_, b) => has[b] && [0, 7, 2].includes(b)).map(w => w.toLowerCase()).join(' or ')}` : '<b>no plough beast</b>: hoe farming'}${missing.length && plough ? `; no ${missing.join(', ')}` : ''}</li>`;
        }).join('');
        return head(only >= 0 ? `${BEAST_WORDS[only]} — ${BEAST_LIKE[only]}: where it was kept (hatched: could live there, never came)` : 'Animals — the leading herd or draft beast') +
            `<div class="chips">${bestChip()}${chip('scarce', 'Fewer gaps', !st.scarce, 'Make it less likely that a landmass lacks a beast')}</div><div class="chips">${ch}</div>` +
            `<div class="sws">${swatch([92, 70, 52], `fly belt (hatched): no cattle, horses or plough — ${pct(t.belt)} of the land`, null)}</div>` +
            `<ul class="lands">${lands}</ul>` +
            note('Which beasts a landmass has is luck: about 18 % of candidates were domesticated in Eurasia, 4 % in the Americas, and a small landmass grows no ox-sized beast. Shallow seas are ice-age land bridges and share their beasts. <b>Fewer gaps</b> makes a missing beast rarer.');
    }
    if (v === 'life') {
        const items = st.simple ? SIMPLE.slice(1).map(([w, c], i) => swatch(c, w, t.simple[i + 1])) : LIFE.slice(1).map(([w, c], i) => swatch(c, w, t.life[i + 1]));
        return head(`Way of life — how people could get their food${st.best ? ', best possible' : ', as it came'}`) + `<div class="chips">${bestChip()}${chip('simple', 'Farming · herding · gathering', st.simple)}</div>` +
            `<div class="sws cols">${items.join('')}</div>` +
            note('What the land and the arrivals allow, not a culture. Hoe farming wherever no plough beast came. Settled foragers where rich fish lets people store food. Gatherers keep their way unless farming or herding would feed ten times as many.');
    }
    const by = [1, 2, 3].map(i => `${SIMPLE[i][0].toLowerCase()} ${mil(t.byLife[i])}`).join(', ');
    return head(`People — how many the land could feed, pre-industrial${st.best ? ', best possible' : ', as it came'}`) + `<div class="chips">${bestChip()}${techChips()}</div>` +
        bar(PEOPLE, '1 · 5 · 20 · 60 · 150+ a km²', 0, Math.log10(151)) +
        note(`About ${mil(t.people)} in all (${by}). Later this view draws on everything here: the calendar’s lean months, the fly belt, the plough. For now it follows the way of life.`);
}
const mil = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `${Math.round(v / 1e6)} million` : `${Math.round(v / 1e3)} thousand`);
function timeline() {
    const yrs = st.full ? Infinity : st.years, prim = Hs.centres.filter(c => c.primary), maxT = Math.max(12000, Math.min(26000, ...prim.map(c => c.items.at(-1).t - Hs.tFirst)));
    const w = 300, rowH = 15, left = 26, h = prim.length * rowH + 22, X = t => left + (w - left - 6) * Math.min(1, t / maxT);
    let s = `<svg class="tl" viewBox="0 0 ${w} ${h}" role="img" aria-label="Each hearth's domestications over time">`;
    for (let g = 0; g <= maxT; g += 4000) s += `<line x1="${X(g)}" x2="${X(g)}" y1="2" y2="${h - 16}" class="tl-grid"/><text x="${X(g)}" y="${h - 4}" class="tl-tick">${g / 1000}k</text>`;
    prim.forEach((C, r) => {
        const y = 10 + r * rowH, hc = hearthCol[C.id], t0 = C.t0 - Hs.tFirst;
        s += `${C.founder ? `<circle cx="10" cy="${y}" r="7.5" fill="none" stroke="#fff" stroke-width="1.2"/>` : ''}<circle cx="10" cy="${y}" r="6" fill="${css(hc)}"/><text x="10" y="${y + 3.5}" class="tl-n">${r + 1}</text>`;
        s += `<line x1="${X(t0)}" x2="${X(Math.min(maxT, C.items.at(-1).t - Hs.tFirst))}" y1="${y}" y2="${y}" class="tl-run"/>`;
        for (const it of C.items) { const tt = it.t - Hs.tFirst; if (tt > maxT) continue; const beast = it.a >= 5, cx = X(tt), col = css(ARCH_RGB[it.a]); s += beast ? `<rect x="${cx - 3.5}" y="${y - 3.5}" width="7" height="7" fill="${col}" class="tl-dot" transform="rotate(45 ${cx} ${y})"><title>${ARCH_WORDS[it.a]} at ${fmtY(tt)} years</title></rect>` : `<circle cx="${cx}" cy="${y}" r="4.2" fill="${col}" class="tl-dot"><title>${ARCH_WORDS[it.a]} at ${fmtY(tt)} years</title></circle>`; }
    });
    if (yrs < maxT) s += `<line x1="${X(yrs)}" x2="${X(yrs)}" y1="0" y2="${h - 16}" class="tl-now"/>`;
    s += '</svg>';
    const sec = Hs.centres.filter(c => !c.primary && c.items.some(it => it.a < 5 && it.t - Hs.tFirst <= yrs)).length;
    return `<div class="tl-box"><div class="tl-cap">Each hearth's domestications (circles: crops; diamonds: beasts). After its first crop, the next come faster. Ringed: founder hearths.</div>${s}<div class="tl-cap">${prim.filter(c => c.t0 - Hs.tFirst <= yrs).length} hearths and ${sec} secondary crop centres by ${st.full ? 'the end' : `${fmtY(st.years)} years`}.</div></div>`;
}

// ── the notes beside the mock-up ──
const NOTES = {
    crops: ['New', 'Each hearth’s own <b>variants</b> of the staples, and some two hundred crops that grow beside them, each its own: first grown at one place (sometimes two), spreading by itself. Realism sets how much a crop’s popularity and nourishment on Earth decide whether this world grows it; Earth likeness sets how alike neighbours are. Click the map for a place’s list, every crop linked to Wikipedia. Staples compete for a field and a season: one variant leads, a later one must be clearly better to take over, and summer and winter are separate slots. Everything else stacks (the core–fringe–legume pattern of farming diets): pulses travel with their staple’s package, garden crops spread fast between farmers, orchards come thousands of years late, spices stay near home. Every crop is named X-like from the Earth region its home is like, the pull between neighbours set by the Earth likeness control (Mix freely · Regional · Keep worlds apart, where neighbours never mix Earth’s Old and New Worlds).', 'Each strain’s own spread at home in its hearth’s climate; the minor crops’ climate niches (frost, chill, dry seasons, heat); where and when farming came.'],
    farmland: ['Changed', 'Farmland, Soil and Growing season in one view, switched by its picker. The model behind them stays as it is today: harvests by degree-days, soils from the rocks, water from the rivers, the four techniques.', 'Today’s Farmland, Soil and Growing season (folded together). Everything else here reads it.'],
    calendar: ['New', 'When the main harvest comes in, the hungry months before it, and what most often ruins it. All of it comes from the twelve months the crop model already walks. The finish keeps three more bytes a place (data added; no version bump).', 'The crop model’s monthly runs; the farming techniques; herds and fish as buffers.'],
    origins: ['New', 'The history in three pictures. <b>Wild larder</b>: where each archetype’s wild ancestor grows. <b>When farming came</b>: thousand-year bands from the hearths, with a time slider and the full spread. <b>From which hearth</b>: each region’s lineage. Hearths start at random dates set by their odds: seasonality, how many wild ancestors grow nearby, productive land, hills close by, water, and foragers who are not too rich. Once a place has its first crop, it domesticates its other wild ancestors faster. A place farming reaches first adopts rather than invents. That is what spaces the hearths.', 'The land’s climate (seasonality, warmth, rain, dry months), relief, rivers and coasts; the crop model’s fit for each archetype; the foragers’ richness.'],
    staple: ['Changed', 'Today’s Staple food, but by default only what came by the age chosen. <b>Best possible</b> shows today’s map. Tree & palm crops are a new archetype (staple code 8, appended).', 'Farmland’s harvests per crop group; what reached each place; pasture; fish and wild foods.'],
    animals: ['New', 'Today’s “Livestock” split into eight archetypes, each with its roles: plough, mount, pack, milk. A landmass may lack a beast, and with no plough beast its farmers use the hoe. The fly belt (hatched) keeps cattle and horses out of the hot, wet, wooded lowlands, as the tsetse does in Africa.', 'Each beast’s habitat from the climate and the height; the landmasses (joined across shallow shelves); what spread where.'],
    life: ['Changed', 'Lifestyle widened to eleven food systems. Each is still farming, herding or gathering underneath (the chip shows those three). It says what the land and the arrivals allow, nothing cultural.', 'Staple food; whether a plough beast came; water brought; height; the warmth index (Binford’s ET) and the sea’s fish for the foragers.'],
    people: ['Kept', 'How many the land could feed, as today, but counted as it came. Later it should also weigh the lean months, the fly belt and the plough.', 'Way of life, its food, fallow.'],
};
function placeList() {
    const hc = st.place, groups = KINDS.map(K => ({ K, list: ITEMS.filter(I => I.kind === K.key && itemAt(I, hc)).sort((a, b) => b.fit8[hc] - a.fit8[hc]) })).filter(g => g.list.length);
    const J = (hc / HW) | 0, lat = (90 - J - 0.5).toFixed(0), lon = (-180 + (hc % HW) + 0.5).toFixed(0);
    const fields = VBA.flat().filter(i => Cr.variants[i].arrive[hc] <= D.T || st.best).map(i => Cr.variants[i]).filter(V => (D.VL.lead[V.a][hc] === Cr.variants.indexOf(V)) || (D.VL.second[V.a][hc] === Cr.variants.indexOf(V)));
    const link = it => (it ? ` <a href="${wiki(it)}" target="_blank" rel="noopener" title="The real ${it.n} on Wikipedia">↗</a>` : '');
    const total = fields.length + groups.reduce((s, g) => s + g.list.length, 0);
    return `<div class="nt-status nt-new">A place</div><h3>${total} crops at ${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}</h3>
        ${fields.length ? `<h4>Field crops</h4><p class="plist">${fields.map(V => `<span>${V.like}${link(V.item)}</span>`).join('')}</p>` : ''}
        ${groups.map(g => `<h4>${g.K.word} · ${g.list.length}</h4><p class="plist">${g.list.map(I => `<span>${I.label}${link(I.it)}</span>`).join('')}</p>`).join('')}
        ${total ? '' : '<p>Nothing farmed here yet.</p>'}<button type="button" class="chip" data-act="placeclear">Back to the notes</button>`;
}
function notes() {
    if (st.view === 'crops' && st.place >= 0 && D) { document.getElementById('notes').innerHTML = placeList(); return; }
    const [status, what, reads] = NOTES[st.view];
    document.getElementById('notes').innerHTML = `<div class="nt-status nt-${status.toLowerCase()}">${status}</div><h3>${TABS.find(t => t[0] === st.view)[1]}</h3><p>${what}</p><h4>Reads</h4><p>${reads}</p>`;
}

// ── the hover readout ──
const SOILG = s => (s >= 0.75 ? 'rich' : s >= 0.5 ? 'good' : s >= 0.3 ? 'middling' : s >= 0.12 ? 'poor' : 'barren');
function readout(k) {
    if (L.ocean[k]) return null;
    const j = (k / W) | 0, i = k - j * W, hc = (j >> 1) * HW + (i >> 1), lines = [], Lb = (a, b) => lines.push(`<span class="ro-l">${a}</span> ${b}`);
    const lat = F.LAT[j], lon = -180 + (i + 0.5) / 2;
    if (L.tW[k] < 0) { Lb('Land', 'ice'); return lines; }
    const life = D.life[k];
    Lb('Way of life', `<b>${LIFE[life][0]}</b>${LIFE_WHY[life] ? ` · ${LIFE_WHY[life]}` : ''}`);
    if (D.staple[k]) Lb('Staple food', `<b>${STAPLE_WORDS[D.staple[k]]}</b>${D.second[k] ? ` · then ${STAPLE_WORDS[D.second[k]].toLowerCase()}` : ''}`);
    if (!st.best) {
        const t = D.arrive[k];
        if (t === Infinity) Lb('Farming', 'never came: no crop of theirs grows here');
        else {
            const id = D.lineage[k], C = id >= 0 ? Hs.centres[id] : null;
            const when = t <= (st.full ? Infinity : st.years) ? `came ~${fmtY(t)} years after the first` : `not yet: comes at ~${fmtY(t)} years`;
            Lb('Farming', `${when}${C ? ` · its ${ARCH_WORDS[D.lineCrop[k]].toLowerCase()} from ${C.primary ? `hearth ${centreLabel(C)}` : 'a secondary centre'}${C.primary ? ` (${Math.round(gcKm(lat, lon, C.lat, C.lon)).toLocaleString('en-US')} km)` : ''}` : ''}`);
        }
    }
    const b = D.beast[k];
    Lb('Animals', `${b >= 0 ? `<b>${BEAST_WORDS[b]}</b> (${BEAST_LIKE[b]}) · ${BEAST_ROLE[b]}` : 'no herd beast'}${L.diseaseBelt[k] > 0.5 ? ' · in the fly belt' : ''}${life >= 1 && life <= 8 ? (D.plough[k] ? ' · ploughed' : ' · hoe, no plough') : ''}`);
    if (life >= 1 && life <= 8 && D.month[k] >= 0) {
        const m = D.month[k], lean = D.lean[k];
        Lb('Calendar', m === 12 ? 'harvested all year round' : `harvested ${MONTHS[m]}${lean ? ` · lean ${MONTHS[(m - lean + 12) % 12]}–${MONTHS[(m + 11) % 12]}` : ' · no lean months'}${D.risk[k] ? ` · risk: ${RISK[D.risk[k]][0].toLowerCase()}` : ''}`);
    }
    if (st.view === 'crops' && D.fieldVar[k] >= 0) {
        const V = Cr.variants[D.fieldVar[k]], V2 = D.field2[k] >= 0 ? Cr.variants[D.field2[k]] : null, j2 = D.slot2[k];
        Lb('Fields', `<b>${V.like}</b> ${ARCH_SHORT[V.a]} from ${V.where}, ${likeOf(V.site)} (${Math.round(100 * D.fieldShare[k])}%)${V2 ? ` · ${V2.like} from ${V2.where} (${Math.round(100 * (1 - D.fieldShare[k]))}%)` : ''}${j2 >= 0 ? ` · then a ${ARCH_SHORT[j2]} in the other season` : ''}`);
        const by = KINDS.map((K, q) => [K, D.CC.cnt[hc * KN + q]]).filter(([, n]) => n).map(([K, n]) => `${n} ${K.word.toLowerCase()}`).join(', ');
        Lb('Crops here', `${D.staplesN[k] + D.CC.total[hc]} in all${by ? ` (${by})` : ''} · click for the list`);
    }
    Lb('People', D.people[k] < 0.005 ? 'too few to count' : `could feed ~${D.people[k] < 10 ? D.people[k].toFixed(D.people[k] < 1 ? 2 : 1) : Math.round(D.people[k])} a km²`);
    Lb('Farmland', `<b>${CLASS_WORDS[farmClass(D.farmV[k])]}</b>${D.water[k] > 0.3 ? ' · with river water' : ''}`);
    const kind = L.soilKind[k] & 15, mod = L.soilKind[k] >> 4;
    Lb('Soil', `${SOIL_WORDS[kind] || 'soil'}${mod ? ` · ${MOD_WORDS[mod]}` : ''} — ${SOILG(L.soil[k])}`);
    Lb('Climate', `${L.tAnn[k].toFixed(0)} °C · ${Math.round(L.pAnn[k]).toLocaleString('en-US')} mm · ${Math.round(L.rainM[k])} months by rain · ET ${L.et[k].toFixed(1)}`);
    return lines;
}
function gcKm(a1, o1, a2, o2) { const r = Math.PI / 180, x = Math.sin(a1 * r) * Math.sin(a2 * r) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.cos((o1 - o2) * r); return 6371 * Math.acos(Math.min(1, Math.max(-1, x))); }

// ── the bars and wiring ──
const TABS = [['farmland', 'Farmland', 'changed'], ['calendar', 'Calendar', 'new'], ['origins', 'Origins', 'new'], ['crops', 'Crops', 'new'], ['staple', 'Staple food', 'changed'], ['animals', 'Animals', 'new'], ['life', 'Way of life', 'changed'], ['people', 'People', '']];
const SUBS = { farmland: [['farmland', 'Farmland'], ['soil', 'Soil'], ['season', 'Season']], calendar: [['harvest', 'Harvest month'], ['lean', 'Lean months'], ['risk', 'Harvest risk']], origins: [['when', 'When farming came'], ['from', 'From which hearth'], ['larder', 'Wild larder']], crops: [['fields', 'Field crops'], ['pulses', 'Pulses'], ['fruit', 'Fruit & nuts'], ['veg', 'Vegetables'], ['spice', 'Spices'], ['other', 'Drinks & fibres'], ['variety', 'Variety']] };
function bars() {
    document.getElementById('tabs').innerHTML = TABS.map(([k, w, b]) => `<button type="button" role="tab" class="tab${st.view === k ? ' on' : ''}" aria-selected="${st.view === k}" data-tab="${k}">${w}${b ? `<sup class="badge b-${b}">${b}</sup>` : ''}</button>`).join('');
    const subs = SUBS[st.view];
    document.getElementById('sub').innerHTML = subs ? `<div class="seg" role="group" aria-label="Picker">${subs.map(([k, w]) => `<button type="button" class="seg-b${st.sub[st.view] === k ? ' on' : ''}" aria-pressed="${st.sub[st.view] === k}" data-sub="${k}">${w}</button>`).join('')}</div>` : '<div class="seg-none">One view</div>';
    const age = document.getElementById('age');
    age.innerHTML = `<span class="age-l">Farming began</span>${chip('years10', '10,000 years ago', !st.full && st.years === 10000)}${chip('full', 'Full spread', st.full)}`;
}
function timebar() {
    const tb = document.getElementById('timebar'), on = (st.view === 'origins' && st.sub.origins !== 'larder') || st.view === 'crops';
    tb.hidden = !on; if (!on) return;
    const s = document.getElementById('yrs'); if (document.activeElement !== s) s.value = st.full ? 20000 : st.years;
    document.getElementById('yrsv').textContent = st.full ? 'all (full spread)' : fmtY(st.years);
}
function render() { bars(); timebar(); paint(); document.getElementById('legend').innerHTML = legend(); notes(); }
let slideReq = 0;
document.getElementById('yrs').addEventListener('input', e => {
    const v = +e.target.value; st.full = v >= 20000; st.years = st.full ? 20000 : v;
    if (slideReq) return;
    slideReq = requestAnimationFrame(() => { slideReq = 0; derive(); bars(); timebar(); paint(); document.getElementById('legend').innerHTML = legend(); });
});
function act(a) {
    const [k, v] = a.split(':');
    if (k === 'tech') st.tech[v] = !st.tech[v];
    else if (k === 'classes') st.classes = !st.classes;
    else if (k === 'watered') st.watered = !st.watered;
    else if (k === 'best') st.best = !st.best;
    else if (k === 'simple') st.simple = !st.simple;
    else if (k === 'years10') { st.full = false; st.years = 10000; }
    else if (k === 'full') { st.full = !st.full; if (!st.full) st.years = 10000; }
    else if (k === 'scarce') { st.scarce = !st.scarce; setHistory(F.runHistory(G, st.roll, st.scarce)); }
    else if (k === 'staple') st.only.staple = st.only.staple === +v ? 0 : +v;
    else if (k === 'beast') st.only.animals = st.only.animals === +v ? -1 : +v;
    else if (k === 'larder') st.only.larder = st.only.larder === +v ? -1 : +v;
    else if (k === 'var') st.only.crop = st.only.crop === +v ? -1 : +v;
    else if (k === 'minor') st.only.minor = st.only.minor === +v ? -1 : +v;
    else if (k === 'home') st.only.home = st.only.home === +v ? -1 : +v;
    else if (k === 'pull') { st.pull = v; assignNames(); }
    else if (k === 'real') { st.real = v; assignNames(); }
    else if (k === 'renames') { st.nameRoll++; assignNames(); }
    else if (k === 'item') st.only.item = st.only.item === +v ? -1 : +v;
    else if (k === 'placeclear') { st.place = -1; notes(); return; }
    derive(); render();
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (b) { act(b.dataset.act); return; }
    const t = e.target.closest('[data-tab]'); if (t) { st.view = t.dataset.tab; render(); return; }
    const s = e.target.closest('[data-sub]'); if (s) { st.sub[st.view] = s.dataset.sub; st.only.minor = -1; st.only.crop = -1; st.only.home = -1; st.only.item = -1; render(); return; }
});
document.getElementById('reroll').addEventListener('click', () => { st.roll++; st.only.crop = -1; st.only.home = -1; st.only.item = -1; setHistory(F.runHistory(G, st.roll, st.scarce)); derive(); render(); });
document.getElementById('newworld').addEventListener('click', () => { st.seedI = (st.seedI + 1) % SEEDS.length; st.roll = 0; st.only.crop = -1; st.only.minor = -1; st.only.home = -1; build(); });
document.addEventListener('change', e => {
    if (e.target.id !== 'cropfind') return;
    const q = e.target.value.trim().toLowerCase(), I = ITEMS.find(x => x.exists && (x.label.toLowerCase() === q || x.name.toLowerCase() === q)) || ITEMS.find(x => x.exists && x.label.toLowerCase().startsWith(q));
    if (I) { st.only.item = I.id; render(); }
});
const wrap = document.getElementById('mapwrap'), ro = document.getElementById('readout');
function showReadout(ev) {
    if (!D) return;
    const r = canvas.getBoundingClientRect(), u = (ev.clientX - r.left) / r.width, v = (ev.clientY - r.top) / r.height;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) { ro.hidden = true; return; }
    const k = Math.floor(v * H) * W + Math.floor(u * W), lines = readout(k);
    if (!lines) { ro.hidden = true; return; }
    ro.innerHTML = lines.join('<br>'); ro.hidden = false;
    const wr = wrap.getBoundingClientRect(), x = ev.clientX - wr.left, y = ev.clientY - wr.top, rw = ro.offsetWidth, rh = ro.offsetHeight;
    ro.style.left = `${Math.max(4, Math.min(wr.width - rw - 4, x + 14 + rw > wr.width ? x - rw - 14 : x + 14))}px`;
    ro.style.top = `${Math.max(4, Math.min(wr.height - rh - 4, y - rh / 2))}px`;
}
canvas.addEventListener('pointermove', showReadout);
canvas.addEventListener('pointerdown', showReadout);
canvas.addEventListener('click', ev => {
    if (st.view !== 'crops' || !D) return;
    const r = canvas.getBoundingClientRect(), u = (ev.clientX - r.left) / r.width, v = (ev.clientY - r.top) / r.height;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return;
    const k = Math.floor(v * H) * W + Math.floor(u * W); if (L.ocean[k]) return;
    st.place = (Math.floor(v * H) >> 1) * HW + (Math.floor(u * W) >> 1); notes();
});
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ro.hidden = true; });
function computeShade() {
    shade = new Float32Array(N);
    for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
        if (L.ocean[k]) { shade[k] = 0.92; continue; }
        const e = L.elev, xe = e[y * W + (x + 1) % W], xw = e[y * W + (x + W - 1) % W], ys = e[Math.min(H - 1, y + 1) * W + x], yn = e[Math.max(0, y - 1) * W + x];
        const d = (Math.max(0, xe) - Math.max(0, xw)) + (Math.max(0, ys) - Math.max(0, yn));
        shade[k] = Math.max(0.66, Math.min(1.04, 0.9 + 0.32 * d - 0.02 * Math.max(0, e[k])));
    }
}
function build() {
    const ld = document.getElementById('loading'); ld.hidden = false;
    setTimeout(() => {
        L = F.buildLand(SEEDS[st.seedI]); G = F.buildGround(L); Mn = F.buildMinor(L, G); ITEMS = null; st.place = -1; st.only.item = -1; setHistory(F.runHistory(G, st.roll, st.scarce)); larderCache.clear();
        computeShade(); derive(); render(); ld.hidden = true;
        document.getElementById('worldname').textContent = `Toy planet ${st.seedI + 1} of ${SEEDS.length}`;
    }, 30);
}
build();
window.__foodDebug = { readout: k => readout(k), D: () => D, Cr: () => Cr, TL: () => TL, ITEMS: () => ITEMS, place: hc => { st.place = hc; notes(); } };
})();
