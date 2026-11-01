// A toy planet for the Food tab mock-ups: a stand-in climate, the real crop model (ported from v2/js/farming/farming.js,
// with a tree-crop group added), soils, rivers, pasture, fish — then the proposed history: wild larder, hearths that
// ignite at random dates by their odds (sped up once farming is there), crops and beasts spreading in years.
(function (root) {
'use strict';
const W = 720, H = 360, N = W * H;          // the picture, 0.5°
const HW = 360, HH = 180, HN = HW * HH;     // the history grid, 1°
const R_KM = 6371, DEG_KM = R_KM * Math.PI / 180;

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => sm(r[0], r[1], x);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash01(seed, stream, id) {
    let h = Math.imul(seed | 0, 0x9E3779B1) ^ Math.imul(stream | 0, 0x85EBCA77) ^ Math.imul((id | 0) + 0x632BE5AB, 0xC2B2AE3D);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
    return ((h >>> 0) + 0.5) / 4294967296;
}
function makeNoise(rng) {
    const p = new Uint8Array(512), perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a);
    const grad = (h, x, y, z) => { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
    return (x, y, z) => {
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z), X = fx & 255, Y = fy & 255, Z = fz & 255;
        x -= fx; y -= fy; z -= fz;
        const u = fade(x), v = fade(y), w = fade(z);
        const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        return lerp(lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
            lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    };
}
function fbm(n, x, y, z, oct) { let s = 0, a = 1, f = 1, norm = 0; for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f, z * f); norm += a; a *= 0.5; f *= 2.03; } return s / norm; }

// ── a min-heap on (key, payload) ──
class Heap {
    constructor(cap = 1 << 16) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
    push(key, val) {
        if (this.n === this.k.length) { const k = new Float64Array(this.n * 2), v = new Int32Array(this.n * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
        let i = this.n++; const K = this.k, V = this.v;
        while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
        K[i] = key; V[i] = val;
    }
    pop() { // returns payload; key in this.top
        const K = this.k, V = this.v, topK = K[0], topV = V[0], n = --this.n;
        if (n > 0) {
            const key = K[n], val = V[n]; let i = 0;
            for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= key) break; K[i] = K[c]; V[i] = V[c]; i = c; }
            K[i] = key; V[i] = val;
        }
        this.top = topK; return topV;
    }
}

function gcKm(a1, o1, a2, o2) { const r = Math.PI / 180, x = Math.sin(a1 * r) * Math.sin(a2 * r) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.cos((o1 - o2) * r); return R_KM * Math.acos(Math.min(1, Math.max(-1, x))); }
// ── grid geometry ──
const LAT = new Float32Array(H), COS = new Float32Array(H);
for (let j = 0; j < H; j++) { LAT[j] = 90 - (j + 0.5) * 180 / H; COS[j] = Math.cos(LAT[j] * Math.PI / 180); }
const HLAT = new Float32Array(HH), HCOS = new Float32Array(HH);
for (let j = 0; j < HH; j++) { HLAT[j] = 90 - (j + 0.5) * 180 / HH; HCOS[j] = Math.cos(HLAT[j] * Math.PI / 180); }
const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
function nbr(w, h, k, d) { const j = (k / w) | 0, i = k - j * w, jj = j + DJ[d]; if (jj < 0 || jj >= h) return -1; let ii = i + DI[d]; if (ii < 0) ii += w; else if (ii >= w) ii -= w; return jj * w + ii; }
function stepKm(cosRow, nsKm, d) { const ew = nsKm * cosRow; return d < 2 ? ew : d < 4 ? nsKm : Math.hypot(ew, nsKm); }

/** Distance (km) from the source cells through the allowed ones, over a w×h equirectangular grid. */
function distance(w, h, nsKm, cosRows, isSource, allowed, maxKm = 1e9) {
    const n = w * h, dist = new Float32Array(n).fill(Infinity), heap = new Heap();
    for (let k = 0; k < n; k++) if (isSource(k)) { dist[k] = 0; heap.push(0, k); }
    while (heap.n) {
        const k = heap.pop(), d0 = heap.top;
        if (d0 > dist[k] || d0 > maxKm) continue;
        const cr = cosRows[(k / w) | 0];
        for (let d = 0; d < 8; d++) {
            const m = nbr(w, h, k, d); if (m < 0 || !allowed(m)) continue;
            const nd = d0 + stepKm(cr, nsKm, d);
            if (nd < dist[m]) { dist[m] = nd; heap.push(nd, m); }
        }
    }
    return dist;
}

// ═════════════════════════ the crop model (farming.js, ported) ═════════════════════════
const CROPS = ['rice', 'wheat', 'maize', 'roots', 'tree'];
const CK = {
    rice: { weight: 1.4, soil: 1, level: 1.5, kinds: [{ base: 12, opt: 26, hot: [35, 40], wet: [0.8, 1.4], cycle: 3.8, paddy: true, share: 1 }] },
    wheat: { weight: 0.9, soil: 0.65, level: 1, kinds: [{ base: 0, opt: 16, hot: [19, 25], wet: [0.15, 0.5], soggy: [200, 400], cycle: 4, dormant: true, max: 1, share: 1 }] },
    maize: { weight: 1, soil: 0.65, level: 1, kinds: [{ base: 10, opt: 24, hot: [34, 40], wet: [0.35, 0.8], soggy: [120, 260], cycle: 3.8, share: 1 },
        { base: 12, opt: 28, hot: [38, 44], wet: [0.15, 0.45], soggy: [50, 150], cycle: 2.8, share: 0.75 }] },
    roots: { weight: 0.85, soil: 0.25, level: 1, kinds: [{ base: 12, opt: 25, hot: [36, 40], wet: [0.3, 0.7], soggy: [150, 300], cycle: 6, share: 1 },
        { base: 5, opt: 16, hot: [21, 26], wet: [0.3, 0.7], soggy: [100, 220], cycle: 3.2, max: 1, share: 0.8 }] },
    // (new: tree & palm crops — perennial, a year-round run (≤ ~2 dry months: the vegeculture of the wet tropics), slopes
    // no bar, poor soil enough; with water brought, the oasis palms)
    tree: { weight: 1.5, soil: 0.15, level: 0.3, kinds: [{ base: 14, opt: 26, hot: [38, 44], wet: [0.5, 1.0], soggy: [450, 800], cycle: 9.5, max: 1, share: 1 }] },
};
const KINDS = []; CROPS.forEach((nm, g) => CK[nm].kinds.forEach(c => KINDS.push({ g, c })));
const K = { harvestBreak: 0.15, dormantKillC: -15, harvestTurn: 0.75, harvestRamp: 0.35, maxHarvests: 3, relayAt: 0.15, multiSoil: [0.45, 0.9],
    farmHalf: 0.67, seasonRisk: 0.2, riskSeason: [0.5, 1], riskWet: [1, 0.5], waterSupplyMm: 60, rainReliable: [0.12, 0.3],
    slopeLoss: [8, 40], terraceLoss: [30, 90], slopeMaxLoss: 0.92, wetlandLoss: 0.6, stapleMin: 0.06 };

const ws = { avail: new Float64Array(12), pet: new Float64Array(12), rate: KINDS.map(() => new Float64Array(12)), pause: KINDS.map(() => new Uint8Array(12)),
    therm: KINDS.map(() => new Float64Array(12)), can: new Uint8Array(KINDS.length), h: new Float64Array(KINDS.length), mon: new Int8Array(KINDS.length), free: new Uint8Array(12) };
function growingSeason(T, P, out) {
    const pet = ws.pet;
    for (let m = 0; m < 12; m++) pet[m] = Math.max(5, 15 + 4.5 * T[m]);
    let swe = 0, soil = 0, rain = 0, warm = 0;
    for (let cyc = 0; cyc < 3; cyc++) for (let m = 0; m < 12; m++) {
        const p = Math.max(0, P[m]), snow = p * sm(1, -1, T[m]);
        swe += snow;
        const melt = Math.min(swe, 4 * Math.max(0, T[m])); swe = Math.max(0, swe - melt);
        const liquid = p - snow + melt, avail = (liquid + soil) / pet[m];
        soil = Math.min(100, Math.max(0, soil + liquid - pet[m]));
        if (cyc < 2) continue;
        const w = sm(5, 15, T[m]); warm += w; rain += w * sm(0.25, 0.6, avail); ws.avail[m] = avail;
    }
    let Py = 0, Ey = 0, si = 0;
    for (let m = 0; m < 12; m++) { Py += Math.max(0, P[m]); Ey += pet[m]; }
    for (let m = 0; m < 12; m++) si += Math.abs(Math.max(0, P[m]) - Py / 12);
    out.rain = rain; out.warm = warm; out.wetness = Py / Ey; out.seasonality = Py > 0 ? si / Py : 0; out.Py = Py; out.Ey = Ey;
    return out;
}
function kindWarmth(c, T, therm) {
    let sum = 0;
    for (let m = 0; m < 12; m++) { const w = Math.max(0, Math.min(1, (T[m] - c.base) / (c.opt - c.base))); therm[m] = w > 0 ? w * sm(c.hot[1], c.hot[0], T[m]) : 0; sum += therm[m]; }
    return sum > (1 - K.harvestRamp) * c.cycle;
}
function kindRates(c, T, therm, avail, pet, brought, rate, pause) {
    for (let m = 0; m < 12; m++) {
        if (!(therm[m] > 0)) { rate[m] = 0; pause[m] = c.dormant && T[m] < c.base + 4 && T[m] > K.dormantKillC ? 1 : 0; continue; }
        const a0 = avail[m], a = brought > 0 && a0 < c.wet[1] ? Math.min(a0 + brought / pet[m], c.wet[1]) : a0;
        rate[m] = therm[m] * S(c.wet, a) * (c.paddy ? 1 : sm(c.soggy[1], c.soggy[0], (a - 1) * pet[m]));
        pause[m] = c.dormant && rate[m] < K.harvestBreak && T[m] < c.base + 4 && T[m] > K.dormantKillC ? 1 : 0;
    }
}
function harvestSteps(L, cycle, max) {
    let h = 0;
    for (let j = 1; j <= max; j++) { const at = j * cycle + (j - 1) * K.harvestTurn, s = sm(at - K.harvestRamp * cycle, at, L); if (!(s > 0)) break; h += s; }
    return h;
}
/** Harvests a year, and (into ws.month) the month the longest run first ripens: 0…11, 12 the year round, -1 none. */
function kindHarvests(rate, pause, c, free) {
    const brk = K.harvestBreak, max = c.max ?? K.maxHarvests;
    let start = -1;
    for (let m = 0; m < 12; m++) if ((free && !free[m]) || (rate[m] < brk && !pause[m])) { start = m; break; }
    if (start < 0) { let L = 0; for (let m = 0; m < 12; m++) L += rate[m]; const h = harvestSteps(L, c.cycle, max); kindHarvests.month = h > 0 ? 12 : -1; return h; }
    let h = 0, L = 0, ripe = -1, bestL = 0, bestM = -1, last = -1;
    for (let i = 1; i <= 12; i++) {
        const m = (start + i) % 12, gap = (free && !free[m]) || (rate[m] < brk && !pause[m]);
        if (gap) {
            if (L > 0) { const hs = harvestSteps(L, c.cycle, max); h += hs; if (hs > 0 && L > bestL) { bestL = L; bestM = ripe >= 0 ? ripe : last; } }
            L = 0; ripe = -1;
        } else { L += rate[m]; last = m; if (ripe < 0 && L >= c.cycle * (1 - 0.5 * K.harvestRamp)) ripe = m; }
    }
    kindHarvests.month = bestM;
    return Math.min(h, max);
}
/** Each group's harvests by rain and watered (out[2g], out[2g+1]) and the month its lead kind first ripens (mon[2g], mon[2g+1]). */
function cropYields(T, season, out, mon) {
    const A = ws.avail, E = ws.pet, { rate, pause, therm, can, h } = ws, free = ws.free, km = ws.mon;
    const reliable = S(K.rainReliable, season.wetness) * (1 - K.seasonRisk * S(K.riskSeason, season.seasonality) * S(K.riskWet, season.wetness));
    for (let i = 0; i < KINDS.length; i++) {
        can[i] = kindWarmth(KINDS[i].c, T, therm[i]) ? 1 : 0;
        let thirsty = 0;
        if (can[i]) for (let m = 0; m < 12; m++) if (therm[i][m] > 0 && A[m] < KINDS[i].c.wet[1]) { thirsty = 1; break; }
        if (!thirsty) can[i] |= 2;
    }
    for (let w = 0; w < 2; w++) {
        const brought = w ? K.waterSupplyMm : 0;
        for (let i = 0; i < KINDS.length; i++) {
            if (!can[i]) { h[i] = 0; km[i] = -1; rate[i].fill(0); continue; }
            if (w && can[i] & 2) continue;
            kindRates(KINDS[i].c, T, therm[i], A, E, brought, rate[i], pause[i]);
            h[i] = KINDS[i].c.share * kindHarvests(rate[i], pause[i], KINDS[i].c, null); km[i] = kindHarvests.month;
        }
        for (let g = 0; g < CROPS.length; g++) {
            let lead = -1;
            for (let i = 0; i < KINDS.length; i++) if (KINDS[i].g === g && (lead < 0 || h[i] > h[lead])) lead = i;
            let e = h[lead];
            if (e > 0.05) {
                let any = 0;
                for (let m = 0; m < 12; m++) { free[m] = rate[lead][m] < K.relayAt ? 1 : 0; any += free[m]; }
                let relay = 0;
                if (any) for (let i = 0; i < KINDS.length; i++) {
                    if (KINDS[i].g === g || !(h[i] > 0.05)) continue;
                    const r = KINDS[i].c.share * kindHarvests(rate[i], pause[i], KINDS[i].c, free) * CK[CROPS[KINDS[i].g]].weight / CK[CROPS[g]].weight;
                    if (r > relay) relay = r;
                }
                e += Math.min(relay, e);
            }
            if (w) { out[2 * g + 1] = Math.max(e, out[2 * g]); mon[2 * g + 1] = e >= out[2 * g] ? km[lead] : mon[2 * g]; }
            else { out[2 * g] = e * reliable; mon[2 * g] = km[lead]; }
        }
    }
}

// ═════════════════════════ the land ═════════════════════════
function buildLand(seed) {
    const rng = mulberry32(seed * 7919 + 13), n1 = makeNoise(rng), n2 = makeNoise(rng), n3 = makeNoise(rng), n4 = makeNoise(rng);
    const raw = new Float32Array(N), belt = new Float32Array(N), xyz = new Float32Array(3 * N);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, phi = LAT[j] * Math.PI / 180, lam = (-180 + (i + 0.5) * 360 / W) * Math.PI / 180;
        const x = Math.cos(phi) * Math.cos(lam), y = Math.cos(phi) * Math.sin(lam), z = Math.sin(phi);
        xyz[3 * k] = x; xyz[3 * k + 1] = y; xyz[3 * k + 2] = z;
        const wx = 0.35 * fbm(n2, 1.7 * x + 9, 1.7 * y, 1.7 * z, 3), wy = 0.35 * fbm(n2, 1.7 * x, 1.7 * y + 7, 1.7 * z, 3);
        raw[k] = fbm(n1, 1.15 * x + wx + 3.1, 1.15 * y + wy - 1.3, 1.15 * z + 0.7, 6) - 0.10 * Math.abs(z) ** 3;
        const b = fbm(n3, 1.5 * x - 2, 1.5 * y + 4, 1.5 * z, 3);
        belt[k] = 1 - sm(0, 0.085, Math.abs(b));
    }
    const sorted = Float32Array.from(raw).sort(), sea = sorted[Math.floor(0.705 * N)];
    const elev = new Float32Array(N), ocean = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
        const x = xyz[3 * k], y = xyz[3 * k + 1], z = xyz[3 * k + 2], d = raw[k] - sea;
        if (d <= 0) { ocean[k] = 1; elev[k] = -0.2 + 14 * d; continue; }
        const rd = (1 - Math.abs(n4(4.2 * x, 4.2 * y, 4.2 * z))) ** 2.2, hill = 0.5 + 0.5 * fbm(n1, 6 * x, 6 * y, 6 * z, 3);
        elev[k] = 0.05 + 2.4 * d + belt[k] * sm(0, 0.035, d) * (0.6 + 2.5 * rd) + 0.35 * hill * sm(0.0, 0.06, d);
    }
    const nsKm = DEG_KM * 0.5;
    const distSea = distance(W, H, nsKm, COS, k => ocean[k] === 1, k => !ocean[k]);
    const distLand = distance(W, H, nsKm, COS, k => !ocean[k], k => ocean[k] === 1, 2000);
    // upwind distances along each row (west: the westerlies'; east: the trades'), and the highest ground between
    const westKm = new Float32Array(N), eastKm = new Float32Array(N), upW = new Float32Array(N), upE = new Float32Array(N), seaEastKm = new Float32Array(N).fill(1e4);
    for (let j = 0; j < H; j++) {
        const ew = nsKm * COS[j], row = j * W;
        let s0 = -1; for (let i = 0; i < W; i++) if (ocean[row + i]) { s0 = i; break; }
        if (s0 < 0) { for (let i = 0; i < W; i++) { westKm[row + i] = eastKm[row + i] = 1e4; } continue; }
        let acc = 0, mx = 0;
        for (let t = 1; t <= W; t++) { const i = (s0 + t) % W, k = row + i; if (ocean[k]) { acc = 0; mx = 0; } else { acc += ew; mx = Math.max(elev[k], mx - ew / 500); westKm[k] = acc; upW[k] = mx; } }
        acc = 0; mx = 0;
        for (let t = 1; t <= W; t++) { const i = (s0 - t + 2 * W) % W, k = row + i; if (ocean[k]) { acc = 0; mx = 0; } else { acc += ew; mx = Math.max(elev[k], mx - ew / 500); eastKm[k] = acc; upE[k] = mx; } }
        // (each sea cell's distance east to land: an eastern-boundary current's cold upwelling off a west coast)
        let l0 = -1; for (let i = 0; i < W; i++) if (!ocean[row + i]) { l0 = i; break; }
        if (l0 >= 0) { acc = 1e4; for (let t = 0; t < W; t++) { const i = (l0 - t + 2 * W) % W, k = row + i; if (!ocean[k]) acc = 0; else { acc += ew; seaEastKm[k] = acc; } } }
    }
    // ── the climate: twelve months ──
    const T12 = new Float32Array(12), P12 = new Float32Array(12);
    const tAnn = new Float32Array(N), pAnn = new Float32Array(N), tW = new Float32Array(N), tC = new Float32Array(N), et = new Float32Array(N), wet = new Float32Array(N);
    const rainM = new Float32Array(N), warmM = new Float32Array(N), seas = new Float32Array(N), winterShare = new Float32Array(N), dryM = new Float32Array(N), maxP = new Float32Array(N);
    const tSeasM = new Float32Array(N), pSeasM = new Float32Array(N), npp = new Float32Array(N), petAnn = new Float32Array(N), frostM = new Float32Array(N);
    const pCool = new Float32Array(N), pWarm = new Float32Array(N), pWet = new Float32Array(N), pHot = new Float32Array(N), pCoolWinter = new Float32Array(N);
    const harv = new Float32Array(N * 10), hmon = new Int8Array(N * 10), sst = new Float32Array(N), upwell = new Float32Array(N), seaIce = new Uint8Array(N);
    const season = {}, y = new Float64Array(10), mon = new Int8Array(10);
    for (let j = 0; j < H; j++) {
        const phi = LAT[j], aphi = Math.abs(phi), sg = phi >= 0 ? 1 : -1, tBase = 27 - 49 * (aphi / 90) ** 1.6;
        for (let i = 0; i < W; i++) {
            const k = j * W + i;
            if (ocean[k]) {
                const cur = upW[k]; // (unused)
                const coldCur = seaEastKm[k] < 900 && aphi > 10 && aphi < 42 ? sm(900, 200, seaEastKm[k]) : 0;
                sst[k] = tBase + 1.5 - 5 * coldCur; upwell[k] = coldCur * sm(8, 16, aphi) * sm(44, 34, aphi); seaIce[k] = sst[k] < -1 ? 1 : 0;
                continue;
            }
            const e = Math.max(0, elev[k]), cont = 1 - Math.exp(-distSea[k] / 700);
            const Ta = tBase - 6.5 * e, A = (0.8 + 28 * (aphi / 90) ** 1.1) * (0.2 + 0.8 * cont);
            const shift = 4 + 10 * cont, wWest = sm(24, 40, aphi);
            const moistW = Math.exp(-westKm[k] / 1300) * Math.exp(-Math.max(0, upW[k] - e - 0.4) / 0.9);
            const moistE = Math.exp(-eastKm[k] / 1100) * Math.exp(-Math.max(0, upE[k] - e - 0.4) / 0.9);
            const moistA = Math.exp(-distSea[k] / 1900), oro = 1 + 0.35 * Math.min(2.5, e) * Math.max(moistW * wWest, moistE * (1 - wWest));
            let pa = 0, ta = 0, wmax = -99, cmin = 99, winter = 0;
            for (let m = 0; m < 12; m++) {
                const sea12 = Math.sin(2 * Math.PI * (m - 3) / 12), summer = Math.max(0, sea12 * sg);
                const T = Ta + A * Math.cos(2 * Math.PI * (m - 6) / 12) * sg;
                const psi = phi - shift * sea12, track = 47 + 6 * sea12 * sg;
                const itcz = 240 * Math.exp(-((psi / 8.5) ** 2));
                const westerly = 74 * Math.exp(-(((aphi - track) / 11) ** 2));
                const trade = 75 * Math.exp(-(((aphi - 15) / 10) ** 2)) * (1 + 0.8 * summer);
                const P = (itcz * (0.3 + 0.7 * Math.max(moistA, 0.75 * moistE + 0.25 * moistW)) + westerly * (0.2 + 0.8 * moistW) + trade * moistE * (1 - wWest) + 12 * moistA) * oro;
                T12[m] = T; P12[m] = P; pa += P; ta += T;
                if (T > wmax) wmax = T; if (T < cmin) cmin = T;
            }
            // (the cold half's share of the rain: winter-rain lands)
            for (let m = 0; m < 12; m++) if (T12[m] <= ta / 12) winter += P12[m];
            tAnn[k] = ta / 12; pAnn[k] = pa; tW[k] = wmax; tC[k] = cmin; winterShare[k] = pa > 0 ? winter / pa : 0;
            et[k] = (18 * wmax - 10 * cmin) / (wmax - cmin + 8);
            let dry = 0, pmx = 0, pmn = 1e9, fr = 0;
            for (let m = 0; m < 12; m++) { if (T12[m] > 0) dry += sm(1.3, 0.7, P12[m] / Math.max(1, 2 * T12[m])); pmx = Math.max(pmx, P12[m]); pmn = Math.min(pmn, P12[m]); fr += sm(1, -1, T12[m]); }
            dryM[k] = dry; maxP[k] = pmx; frostM[k] = fr;
            // (Matranga's seasonality: warmest and coldest quarter cut off at 0 °C; rain's wettest − driest over the mean)
            tSeasM[k] = Math.max(wmax - 0.15 * A, 0) - Math.max(cmin + 0.15 * A, 0); pSeasM[k] = pa > 0 ? (pmx - pmn) / (pa / 12) : 0;
            npp[k] = Math.min(3000 / (1 + Math.exp(1.315 - 0.119 * tAnn[k])), 3000 * (1 - Math.exp(-0.000664 * pa)));
            growingSeason(T12, P12, season);
            rainM[k] = season.rain; warmM[k] = season.warm; seas[k] = season.seasonality; wet[k] = season.wetness; petAnn[k] = season.Ey;
            // (the pulses' seasons, in months: cool — lentils and peas, the winter of a hot land or the summer of a cold one, on
            // the soil's stored water; warm — beans, a frost-free run warm enough; warm and wet — soy, mung; hot — cowpeas, drought-hardy)
            { let c = 0, cw = 0, wa = 0, we = 0, ho = 0; const mean = ta / 12;
              for (let m = 0; m < 12; m++) { const T = T12[m], av = ws.avail[m];
                  const cm = sm(3, 7, T) * sm(27, 21, T) * sm(0.1, 0.32, av); c += cm; if (T < mean) cw += cm;
                  wa += sm(12.5, 16, T) * sm(33, 29, T) * sm(0.3, 0.6, av); we += sm(16, 20, T) * sm(0.6, 1.0, av); ho += sm(20, 24, T) * sm(0.18, 0.42, av); }
              pCool[k] = c; pCoolWinter[k] = c > 0 ? cw / c : 0; pWarm[k] = wa; pWet[k] = we; pHot[k] = ho; }
            cropYields(T12, season, y, mon);
            for (let q = 0; q < 10; q++) { harv[k * 10 + q] = y[q]; hmon[k * 10 + q] = mon[q]; }
        }
    }
    // ── rivers: a priority flood from the sea; each land cell drains to the cell that reached it ──
    const down = new Int32Array(N).fill(-1), order = new Int32Array(N), seen = new Uint8Array(N), fill = new Float32Array(N), heap = new Heap();
    let no = 0;
    for (let k = 0; k < N; k++) {
        if (ocean[k]) continue;
        for (let d = 0; d < 8; d++) { const m = nbr(W, H, k, d); if (m >= 0 && ocean[m]) { seen[k] = 1; fill[k] = elev[k]; down[k] = m; heap.push(elev[k], k); break; } }
    }
    while (heap.n) {
        const k = heap.pop(); order[no++] = k;
        for (let d = 0; d < 8; d++) {
            const m = nbr(W, H, k, d); if (m < 0 || ocean[m] || seen[m]) continue;
            seen[m] = 1; fill[m] = Math.max(elev[m], fill[k] + 1e-4); down[m] = k; heap.push(fill[m], m);
        }
    }
    const q = new Float32Array(N);
    for (let t = no - 1; t >= 0; t--) {
        const k = order[t], j = (k / W) | 0, area = nsKm * nsKm * COS[j];
        q[k] += Math.max(0, pAnn[k] - 0.6 * petAnn[k]) * area * 1000 / 3.156e7;
        if (down[k] >= 0 && !ocean[down[k]]) q[down[k]] += q[k];
    }
    // ── ground: slope (m per km), relief; soils; water brought ──
    const slope = new Float32Array(N), relief = new Float32Array(N);
    for (let k = 0; k < N; k++) {
        if (ocean[k]) continue;
        const j = (k / W) | 0; let g = 0, r = 0;
        for (let d = 0; d < 8; d++) { const m = nbr(W, H, k, d); if (m < 0 || ocean[m]) continue; const dz = Math.abs(elev[m] - elev[k]); g = Math.max(g, 1000 * dz / stepKm(COS[j], nsKm, d)); r = Math.max(r, dz); }
        slope[k] = g * 0.6; relief[k] = r;
    }
    const water = new Float32Array(N), flood = new Float32Array(N), canal = new Float32Array(N), river = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
        if (ocean[k] || q[k] < 15) continue;
        if (q[k] >= 250) river[k] = q[k] >= 1500 ? 3 : q[k] >= 600 ? 2 : 1;
        const f = sm(250, 1200, q[k]) * sm(30, 8, slope[k]), c = sm(15, 150, q[k]);
        flood[k] = Math.max(flood[k], f); canal[k] = Math.max(canal[k], c);
        for (let d = 0; d < 8; d++) { const m = nbr(W, H, k, d); if (m < 0 || ocean[m]) continue; if (elev[m] - elev[k] < 0.15) { flood[m] = Math.max(flood[m], 0.5 * f); canal[m] = Math.max(canal[m], 0.65 * c); } }
    }
    const soil = new Float32Array(N), soilKind = new Uint8Array(N), wetland = new Float32Array(N), pasture = new Float32Array(N), tree = new Float32Array(N);
    for (let k = 0; k < N; k++) {
        if (ocean[k]) continue;
        const x = xyz[3 * k], y = xyz[3 * k + 1], z = xyz[3 * k + 2], w = wet[k];
        let parent = clamp(0.48 + 0.55 * fbm(n3, 7 * x + 3, 7 * y, 7 * z, 3), 0.18, 0.82), kind = parent < 0.4 ? 3 : parent > 0.62 ? 4 : 5;
        const silt = sm(0.25, 0.8, flood[k]); if (silt > 0.3) kind = 1;
        const volc = belt[k] * sm(1.4, 2.8, elev[k]) * (0.5 + 0.5 * n2(9 * x, 9 * y, 9 * z)); if (volc > 0.45) kind = 6;
        parent = Math.max(parent, silt, 0.9 * volc);
        const black = sm(0.3, 0.55, w) * sm(1.35, 0.9, w) * sm(15, 21, tW[k]) * sm(15, 5, tC[k]);
        const leach = sm(0.6, 1.3, w) * sm(14, 22, tAnn[k]) * (1 - Math.max(0.85 * silt, 0.8 * (kind === 6 ? 1 : 0)));
        const pod = sm(0, -8, tC[k]) * sm(21, 17, tW[k]) * sm(0.6, 1.0, w);
        soil[k] = clamp(parent * (1 - 0.6 * leach) * (1 + 0.3 * black) * (1 - 0.4 * pod), 0, 1);
        soilKind[k] = kind | ((leach >= 0.45 ? 2 : black >= 0.5 ? 1 : pod >= 0.5 ? 3 : 0) << 4);
        wetland[k] = sm(6, 2, slope[k]) * sm(1.2, 2.2, w) * (0.5 + 0.5 * flood[k]);
        tree[k] = sm(0.5, 1.05, w) * sm(1.5, 5, warmM[k]);
        pasture[k] = Math.min(sm(0.08, 0.35, sm(0.5, 5, warmM[k])), sm(0.03, 0.3, w)) * (1 - 0.7 * tree[k]);
    }
    // ── the sea's fish: shelf within reach, colder or upwelling the richer ──
    const shelfRich = new Float32Array(N);
    for (let k = 0; k < N; k++) if (ocean[k] && distLand[k] < 160) shelfRich[k] = (0.3 + 0.7 * Math.max(sm(24, 12, sst[k]), sm(0.1, 0.8, upwell[k]))) * (1 - 0.9 * seaIce[k]);
    const fishRich = new Float32Array(N);
    for (let k = 0; k < N; k++) {
        if (ocean[k] || distSea[k] > 90) continue;
        let r = 0, nS = 0; const j = (k / W) | 0, i = k - j * W;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const jj = j + dj; if (jj < 0 || jj >= H) continue; const m = jj * W + ((i + di + W) % W); if (ocean[m]) { r += shelfRich[m]; nS++; } }
        fishRich[k] = nS ? (r / 25) * sm(90, 20, distSea[k]) : 0;
    }
    return { seed, W, H, pCool, pWarm, pWet, pHot, pCoolWinter, elev, ocean, xyz, distSea, distLand, belt, tAnn, pAnn, tW, tC, et, wet, rainM, warmM, seas, winterShare, dryM, maxP, tSeasM, pSeasM, npp, frostM,
        harv, hmon, sst, upwell, seaIce, q, river, slope, relief, flood, canal, soil, soilKind, wetland, pasture, tree, fishRich };
}

// ═════════════════════════ a place's food (farmPlace, ported) ═════════════════════════
const STAPLE = { NONE: 0, RICE: 1, WHEAT: 2, MAIZE: 3, ROOTS: 4, HERD: 5, FISH: 6, WILD: 7, TREE: 8 };
const CROP_STAPLE = [1, 2, 3, 4, 8];
const TECH_ALL = { flood: true, canal: true, terrace: true, raised: true };
/** Food per staple (into foods[9]) at land cell k with techniques `tech`, crops allowed by `allow` (bitmask of CROPS; 31 all),
 *  herds by `herdOK` (0…1). Returns the best staple; out.v, out.rainV (farmland by rain), out.harv, out.month, out.water. */
function placeFood(L, k, tech, allow, herdOK, foods, out) {
    const sl = L.slope[k], slopeRain = 1 - K.slopeMaxLoss * S(K.slopeLoss, sl);
    const ground = tech.terrace ? Math.max(slopeRain, 1 - K.slopeMaxLoss * S(K.terraceLoss, sl)) : slopeRain;
    const wetRain = 1 - K.wetlandLoss * L.wetland[k], wetTech = tech.raised ? 1 : wetRain;
    const water = Math.max(tech.flood ? L.flood[k] : 0, tech.canal ? L.canal[k] : 0), more = S(K.multiSoil, L.soil[k]);
    const eff = h => Math.min(1, h) + more * Math.max(0, h - 1);
    let best = 0, bv = K.stapleMin, bh = 0, bm = -1, rv = 0;
    for (let s = 0; s < 9; s++) foods[s] = 0;
    for (let g = 0; g < 5; g++) {
        const c = CK[CROPS[g]], er = L.harv[k * 10 + 2 * g], ew = L.harv[k * 10 + 2 * g + 1], soilF = 1 - c.soil + c.soil * L.soil[k];
        const paddy = !!c.kinds[0].paddy, ht = eff(er + water * Math.max(0, ew - er)), hr = eff(er);
        const v = ht * soilF * ground ** c.level * (paddy ? 1 : wetTech) * c.weight, vr = hr * soilF * slopeRain ** c.level * (paddy ? 1 : wetRain) * c.weight;
        if (vr > rv) rv = vr;
        if (!(allow & (1 << g))) continue;
        foods[CROP_STAPLE[g]] = v;
        if (v > bv) { bv = v; best = CROP_STAPLE[g]; bh = ht; bm = water > 0.3 && ew > er ? L.hmon[k * 10 + 2 * g + 1] : L.hmon[k * 10 + 2 * g]; }
    }
    const herd = L.pasture[k] * (1 - 0.8 * water) * herdOK;
    foods[5] = herd * 0.5;
    out.cropV = best ? bv : 0; out.crop = best; out.harv = bh; out.month = bm; out.water = water;
    out.v = best ? bv / (bv + K.farmHalf) : 0; out.rainV = rv / (rv + K.farmHalf);
    if (foods[5] > bv) best = 5;
    return best;
}
function croppedShare(L, k, flood) {
    const need = (1 - sm(0.3, 0.65, L.soil[k])) * (0.5 + 0.5 * sm(9.5, 11.5, L.warmM[k]));
    const R = 1 - 0.85 * need; return R + (1 - R) * flood;
}
function gatherAt(L, k) {
    const sumr = sm(1, 4, L.warmM[k]);
    const fish = 2.5 * sm(0.05, 0.42, L.fishRich[k]) * sumr + 0.5 * Math.max(L.flood[k], 0.5 * L.canal[k]) * sumr;
    const wild = 0.3 * sm(0.5, 9, L.rainM[k]) + 0.08 * L.pasture[k];
    return { fish, wild, people: fish + wild };
}

// ═════════════════════════ the history ═════════════════════════
// plants' archetypes (the crop groups) and the beasts
const BEASTS = ['grazer', 'smallstock', 'horse', 'camel', 'highland', 'deer', 'pig', 'buffalo'];
const NA = 5 + BEASTS.length;           // archetypes: 0–4 crops (CROPS' order), 5… beasts
const BIG = new Set([0, 2, 3, 4, 7]);   // (beasts by BEASTS index needing a big landmass)
const DIRECTED = new Set([2, 3, 5]);    // horse, camel, tundra deer: domesticated late, at the herders' fringe
const PLOUGH = new Set([0, 2, 7]);      // grazer, horse, buffalo pull a plough
const HERDING = new Set([0, 1, 2, 3, 4, 5]);

/** Each place's wild ancestors (domestication niches, 0…1) — plants and beasts — and where beasts can be kept, per picture cell. */
function larderAt(L, k, out) {
    const T = L.tAnn[k], P = L.pAnn[k], Tw = L.tW[k], Tc = L.tC[k], w = L.wet[k], dry = L.dryM[k], e = Math.max(0, L.elev[k]), ws = L.winterShare[k];
    const aphi = Math.abs(LAT[(k / W) | 0]), hill = sm(0.05, 0.35, L.relief[k]), flat = sm(12, 4, L.slope[k]), riv = Math.max(L.flood[k], 0.6 * L.canal[k]);
    const tr = Tw - Tc, belt = L.diseaseBelt ? L.diseaseBelt[k] : 0;
    // cool-season grains: winter rain and a long summer drought; mild winters; hills
    out[1] = sm(0.44, 0.62, ws) * sm(1, 3, dry) * sm(-5, 0, Tc) * sm(15, 10, Tc) * sm(180, 300, P) * sm(1300, 850, P) * sm(2.4, 1.7, e) * (0.55 + 0.45 * hill);
    // paddy grains: seasonal wetlands and floodplains, hot summers
    const wetl = Math.max(L.wetland[k], 0.8 * L.flood[k], sm(170, 260, L.maxP[k]) * flat * sm(0.7, 1.1, w));
    const rice = sm(15.5, 18, T) * sm(23, 26.5, Tw) * sm(34, 27, aphi) * wetl * sm(2, 4, dry + 2 * L.seas[k]);
    // warm-season grains: monsoon millets, savanna grains, a grass of seasonally dry tropical hills
    const millet = sm(0.36, 0.2, ws) * sm(250, 420, P) * sm(1000, 750, P) * sm(12, 22, tr) * sm(4, 10, T);
    const savanna = sm(19, 23, T) * sm(3, 5, dry) * sm(9.5, 7.5, dry) * sm(220, 380, P) * sm(1200, 900, P);
    const hillMaize = sm(0.4, 0.7, e) * sm(2.2, 1.8, e) * sm(4, 6, dry) * sm(14, 18, T) * sm(26, 20, aphi);
    out[2] = Math.max(millet, savanna, hillMaize);
    // roots & tubers: the forest–savanna edge; cold tropical highlands
    const edge = sm(2, 3.2, dry) * sm(6, 4.8, dry) * sm(19, 22, T) * sm(800, 1050, P);
    const tall = sm(1.9, 2.5, e) * sm(4.5, 3.8, e) * sm(28, 18, aphi) * sm(-2, 3, Tc);
    out[3] = Math.max(edge, tall);
    out[0] = rice;
    // tree & palm crops: the ever-wet tropics; oasis palms
    out[4] = Math.max(sm(2.6, 1.4, dry) * sm(21, 24, T) * sm(1500, 2100, P) * sm(1.6, 1.0, e), sm(0.2, 0.08, w) * sm(21, 25, T) * riv);
    // beasts' wild ranges
    const b = 5;
    out[b + 0] = sm(0.3, 0.5, w) * sm(1.45, 1.0, w) * sm(4, 9, T) * sm(29, 25, T) * (1 - 0.5 * L.tree[k]) * (1 - 0.9 * belt);
    out[b + 1] = sm(0.25, 0.8, e) * sm(2.9, 2.2, e) * sm(0.12, 0.28, w) * sm(1.3, 0.85, w) * (0.4 + 0.6 * hill);
    out[b + 2] = sm(0.15, 0.25, w) * sm(0.7, 0.5, w) * sm(-6, -1, T) * sm(14, 10, T);
    out[b + 3] = sm(330, 190, P) * sm(10, 40, P) * sm(-4, 2, T);
    out[b + 4] = sm(2.7, 3.3, e) * sm(9, 3, T);
    out[b + 5] = sm(12.3, 11.2, L.et[k]) * sm(42, 52, aphi);
    out[b + 6] = sm(0.75, 1.15, w) * sm(9, 14, T) * L.tree[k];
    out[b + 7] = sm(20, 24, T) * Math.max(wetl, riv) * sm(0.8, 1.2, w);
}
function keepAt(L, k, b) {
    const T = L.tAnn[k], P = L.pAnn[k], w = L.wet[k], e = Math.max(0, L.elev[k]), belt = L.diseaseBelt[k];
    switch (b) {
        case 0: return sm(0.12, 0.3, w) * sm(2.4, 1.5, w) * sm(-8, -2, T) * (1 - 0.85 * belt);
        case 1: return sm(0.05, 0.18, w) * sm(2.6, 1.7, w) * sm(-10, -3, T) * (1 - 0.3 * belt);
        case 2: return sm(0.08, 0.2, w) * sm(1.3, 0.75, w) * sm(22, 16, T) * sm(-12, -5, T) * (1 - 0.95 * belt);
        case 3: return sm(0.45, 0.2, w) * sm(-8, -2, T) * (1 - 0.6 * sm(0.4, 0.8, w));
        case 4: return sm(2.2, 2.9, e) * sm(14, 8, T);
        case 5: return sm(12.8, 11.3, L.et[k]);
        case 6: return sm(0.5, 0.9, w) * sm(3, 9, T) * 0.85;
        case 7: return sm(18, 22, T) * Math.max(L.flood[k], L.wetland[k], sm(1.0, 1.6, w)) ;
    }
    return 0;
}

/** Everything the history grid holds, from the picture: land, each archetype's niche, fit and keep, richness, landmasses. */
function buildGround(L) {
    const n = HN, land = new Uint8Array(n), fit = Array.from({ length: NA }, () => new Float32Array(n)), niche = Array.from({ length: NA }, () => new Float32Array(n));
    const rich = new Float32Array(n), river = new Uint8Array(n), coast = new Uint8Array(n), elev = new Float32Array(n), seaNear = new Float32Array(n).fill(1e4), et = new Float32Array(n);
    const score = new Float32Array(n), tseas = new Float32Array(n), pseas = new Float32Array(n), npp = new Float32Array(n), relief = new Float32Array(n), waterNear = new Float32Array(n);
    // the disease belt (a tsetse-like fly: hot, wet-season, wooded, lowland, frost-free)
    L.diseaseBelt = new Float32Array(N);
    for (let k = 0; k < N; k++) if (!L.ocean[k]) L.diseaseBelt[k] = sm(18, 20.5, L.tAnn[k]) * sm(32.5, 30, L.tW[k]) * sm(550, 800, L.pAnn[k]) * sm(0.3, 0.6, L.tree[k] + 0.4 * sm(0.5, 0.9, L.wet[k])) * sm(2.1, 1.6, L.elev[k]) * sm(8, 13, L.tC[k]);
    const tmp = new Float32Array(NA), foods = new Float32Array(9), o = {};
    for (let J = 0; J < HH; J++) for (let I = 0; I < HW; I++) {
        const c = J * HW + I; let nl = 0;
        for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
            const k = (2 * J + dj) * W + 2 * I + di;
            if (L.ocean[k]) { seaNear[c] = Math.min(seaNear[c], L.distLand[k]); continue; }
            nl++;
            larderAt(L, k, tmp);
            for (let a = 0; a < NA; a++) niche[a][c] += tmp[a];
            placeFood(L, k, TECH_ALL, 31, 1, foods, o);
            for (let g = 0; g < 5; g++) fit[g][c] += sm(0.05, 0.4, foods[CROP_STAPLE[g]] / CK[CROPS[g]].weight);
            for (let b = 0; b < BEASTS.length; b++) fit[5 + b][c] += keepAt(L, k, b);
            const g = gatherAt(L, k); rich[c] += g.people;
            if (L.river[k]) river[c] = 1;
            if (L.distSea[k] < 40) coast[c] = 1;
            elev[c] += L.elev[k]; et[c] += L.et[k]; tseas[c] += L.tSeasM[k]; pseas[c] += L.pSeasM[k]; npp[c] += L.npp[k]; relief[c] = Math.max(relief[c], L.relief[k]);
            waterNear[c] = Math.max(waterNear[c], Math.max(L.flood[k], L.canal[k], L.distSea[k] < 30 ? 0.6 : 0));
        }
        if (nl >= 2) {
            land[c] = 1;
            for (let a = 0; a < NA; a++) { niche[a][c] /= nl; fit[a][c] /= nl; }
            rich[c] /= nl; elev[c] /= nl; et[c] /= nl; tseas[c] /= nl; pseas[c] /= nl; npp[c] /= nl;
        } else { for (let a = 0; a < NA; a++) { niche[a][c] = 0; fit[a][c] = 0; } rich[c] = 0; }
    }
    // landmasses: land joined across the shelves (sea within ~150 km of land on both sides: the ice ages' land bridges)
    const mass = new Int32Array(n).fill(-1), masses = [];
    for (let c = 0; c < n; c++) {
        if (!land[c] || mass[c] >= 0) continue;
        const id = masses.length, stack = [c]; mass[c] = id; let area = 0;
        while (stack.length) {
            const u = stack.pop(); const J = (u / HW) | 0; if (land[u]) area += DEG_KM * DEG_KM * HCOS[J];
            for (let d = 0; d < 8; d++) { const v = nbr(HW, HH, u, d); if (v < 0 || mass[v] >= 0) continue; if (land[v] || seaNear[v] < 120) { mass[v] = id; stack.push(v); } }
        }
        masses.push({ id, area });
    }
    // percentiles of the seasonality (Matranga: the more seasonal of the two, ranked among the land)
    const rank = arr => { const idx = []; for (let c = 0; c < n; c++) if (land[c]) idx.push(c); idx.sort((a, b) => arr[a] - arr[b]); const r = new Float32Array(n); idx.forEach((c, i) => { r[c] = i / Math.max(1, idx.length - 1); }); return r; };
    const rT = rank(tseas), rP = rank(pseas);
    const variety = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        const J = (c / HW) | 0, I = c - J * HW; let v = 0;
        for (let a = 0; a < NA; a++) { if (a === 10) continue; let mx = 0; for (let dj = -3; dj <= 3; dj++) { const jj = J + dj; if (jj < 0 || jj >= HH) continue; const span = Math.min(HW / 2, Math.round(3 / Math.max(0.2, HCOS[jj]))); for (let di = -span; di <= span; di++) { const m = jj * HW + ((I + di + HW) % HW); if (land[m] && niche[a][m] > mx) mx = niche[a][m]; } } v += (a < 5 ? 1 : 0.5) * sm(0.15, 0.45, mx); }
        variety[c] = v;
        const seasF = sm(0.55, 0.93, Math.max(rT[c], rP[c])), prod = sm(250, 900, npp[c]), hillF = 0.5 + 0.5 * sm(0.08, 0.5, relief[c]) * sm(3, 1.8, elev[c]);
        const richF = 1 - 0.6 * sm(0.4, 1.6, rich[c]);
        score[c] = (0.3 + 0.7 * sm(0.3, 2.4, v)) * seasF * prod * hillF * (0.55 + 0.45 * waterNear[c]) * richF * sm(52, 44, Math.abs(HLAT[J]));
    }
    // candidate regions: local maxima ~300 km apart
    let maxScore = 0; for (let c = 0; c < n; c++) if (score[c] > maxScore) maxScore = score[c];
    const cand = [], beastOnly = new Set();
    for (let c = 0; c < n; c++) {
        if (!land[c] || score[c] < 0.15 * maxScore) continue;
        const J = (c / HW) | 0, I = c - J * HW; let top = true;
        for (let dj = -5; dj <= 5 && top; dj++) { const jj = J + dj; if (jj < 0 || jj >= HH) continue; const span = Math.min(HW / 2, Math.round(5 / Math.max(0.2, HCOS[jj]))); for (let di = -span; di <= span; di++) { const m = jj * HW + ((I + di + HW) % HW); if (m !== c && score[m] > score[c] || (score[m] === score[c] && m < c)) { top = false; break; } } }
        if (top) cand.push(c);
    }
    // (and the heart of each wild beast's range away from them: where herders, not farmers, may tame it)
    for (let a = 5; a < NA; a++) for (let c = 0; c < n; c++) {
        if (!land[c] || niche[a][c] < 0.5) continue;
        const J = (c / HW) | 0, I = c - J * HW; let top = true;
        for (let dj = -6; dj <= 6 && top; dj++) { const jj = J + dj; if (jj < 0 || jj >= HH) continue; const span = Math.min(HW / 2, Math.round(6 / Math.max(0.2, HCOS[jj]))); for (let di = -span; di <= span; di++) { const m = jj * HW + ((I + di + HW) % HW); if (m !== c && (niche[a][m] > niche[a][c] || (niche[a][m] === niche[a][c] && m < c))) { top = false; break; } } }
        if (!top) continue;
        let near = false; for (const q of cand) { const dJ = ((q / HW) | 0) - J, dI = Math.abs((q % HW) - I); if (Math.abs(dJ) <= 3 && Math.min(dI, HW - dI) * HCOS[J] <= 3) { near = true; break; } }
        if (!near) { cand.push(c); beastOnly.add(c); }
    }
    const regionOf = new Int32Array(n).fill(-1), regions = cand.map((c, r) => ({ r, cell: c, lat: HLAT[(c / HW) | 0], lon: -180 + ((c % HW) + 0.5), score: beastOnly.has(c) ? 0 : score[c], beastOnly: beastOnly.has(c), mass: mass[c], niche: new Float32Array(NA) }));
    // (each region: the land within ~2 cells of its centre; its niche the best there)
    regions.forEach(R => {
        const J = (R.cell / HW) | 0, I = R.cell - J * HW, mean = new Float32Array(NA); let nR = 0;
        for (let dj = -3; dj <= 3; dj++) { const jj = J + dj; if (jj < 0 || jj >= HH) continue; const span = Math.min(HW / 2, Math.round(3 / Math.max(0.2, HCOS[jj]))); for (let di = -span; di <= span; di++) { const m = jj * HW + ((I + di + HW) % HW); if (!land[m]) continue; if (regionOf[m] < 0 && Math.abs(dj) <= 2 && Math.abs(di) <= Math.round(2 / Math.max(0.2, HCOS[jj]))) regionOf[m] = R.r; nR++; for (let a = 0; a < NA; a++) { R.niche[a] = Math.max(R.niche[a], niche[a][m]); mean[a] += niche[a][m]; } } }
        for (let a = 0; a < NA; a++) R.niche[a] = a < 5 ? 0.7 * R.niche[a] + 0.3 * mean[a] / Math.max(1, nR) : 0.3 * R.niche[a] + 0.7 * mean[a] / Math.max(1, nR);
    });
    return { land, fit, niche, rich, river, coast, elev, seaNear, et, score, variety, mass, masses, regions, regionOf, maxScore };
}

/** The history: domestication dates and the spread, in years. `roll` re-draws the dates; `scarce` false makes a gap in a landmass's beasts rarer. */
function runHistory(G, roll = 0, scarce = true) {
    const n = HN, { land, fit, rich, river, coast, seaNear, regions, regionOf, mass, masses } = G;
    const KUP = 5, C0 = 1 / 1500, seed = 1000003 + roll * 7919;
    // which beasts each landmass has (luck; ox-sized ones need a big landmass)
    const has = masses.map(M => BEASTS.map((_, b) => {
        let present = 0; for (let c = 0; c < n; c++) if (mass[c] === M.id && land[c] && G.niche[5 + b][c] > 0.45) { present++; if (present > 3) break; }
        if (present <= 3) return false;
        const big = BIG.has(b) ? sm(1.5e5, 1.2e6, M.area) : 1, p = (scarce ? 0.7 : 0.96) * big;
        return hash01(seed, 900 + b, M.id) < p;
    }));
    const best = Array.from({ length: NA }, () => new Float64Array(n).fill(Infinity)), lab = Array.from({ length: NA }, () => new Int16Array(n).fill(-1));
    const done = Array.from({ length: NA }, () => new Uint8Array(n)), farmTime = new Float64Array(n).fill(Infinity), beastTime = new Float64Array(n).fill(Infinity);
    const strains = [], heap = new Heap(1 << 18), NR = regions.length;
    const domT = Array.from({ length: NA }, () => new Float64Array(NR).fill(Infinity)), regFarm = new Float64Array(NR).fill(Infinity), regBeast = new Float64Array(NR).fill(Infinity), regCentre = new Int32Array(NR).fill(-1), centres = [];
    const bestN = R => Math.max(R.niche[0], R.niche[1], R.niche[2], R.niche[3], R.niche[4]);
    let rawSum = 0; const raw = regions.map(R => { const b = bestN(R); const v = b >= 0.25 ? (R.score / G.maxScore) ** 3 * b : 0; rawSum += v; return v; });
    const WORLD_RATE = (root.FoodTune?.rate ?? 45) / 8000, KNOW = 1 / 1200, BEAST = 1 / 1500, DIRECT = 1 / 2500;
    const lam = (a, R) => (rawSum > 0 ? raw[R.r] / rawSum * WORLD_RATE : 0) * (R.niche[a] / Math.max(1e-6, bestN(R))) ** 2;
    const STEP = 0, DOM = 1, enc = (type, a, idx) => (type << 24) | (a << 18) | idx;
    // founders (developer: "a couple of varied and far apart croplands that start relatively early … 2-4 minimum that are very
    // early"): the likeliest regions, nudged at random, each ≥ 3,500 km from the others and leading with a different staple
    // where it can; their first crop within ~1,500 years of the start, and a wider share of their wild larder taken up
    const landArea = masses.reduce((s, M) => s + M.area, 0), nF = Math.max(2, Math.min(4, Math.round(landArea / 4e7) + 1));
    const leadOf = R => { let b = 0; for (let a = 1; a < 5; a++) if (R.niche[a] > R.niche[b]) b = a; return b; };
    const cands = regions.filter(R => !R.beastOnly && raw[R.r] > 0).map(R => ({ R, v: Math.log(raw[R.r]) + 0.8 * -Math.log(-Math.log(hash01(seed, 700, R.r))), lead: leadOf(R) })).sort((p, q) => q.v - p.v);
    const founders = [];
    for (const varied of [true, false]) for (const c of cands) {
        if (founders.length >= nF || founders.includes(c)) continue;
        if (founders.some(f => gcKm(f.R.lat, f.R.lon, c.R.lat, c.R.lon) < 3500)) continue;
        if (varied && founders.some(f => f.lead === c.lead)) continue;
        founders.push(c);
    }
    for (const R of regions) R.founder = false;
    for (const f of founders) f.R.founder = true;
    // the independent dates (crops only: beasts wait for farming)
    regions.forEach(R => { for (let a = 0; a < 5; a++) { if (R.niche[a] < 0.25 || !(lam(a, R) > 0)) continue; const t = -Math.log(hash01(seed, a + 1, R.r)) / lam(a, R); domT[a][R.r] = t; heap.push(t, enc(DOM, a, R.r)); } });
    // (a founder's first crop early: within ~1,500 years of the start)
    for (const f of founders) { const t = 100 + 1400 * hash01(seed, 710, f.R.r); if (t < domT[f.lead][f.R.r]) { domT[f.lead][f.R.r] = t; heap.push(t, enc(DOM, f.lead, f.R.r)); } }
    const farmingCame = (R, t) => {
        if (regFarm[R.r] <= t) return; regFarm[R.r] = t;
        for (let a = 0; a < 5; a++) { if (R.niche[a] < (R.founder ? 0.16 : 0.25)) continue; const tk = t + 200 + -Math.log(hash01(seed, 50 + a, R.r)) / (KNOW * Math.max(R.niche[a], R.founder ? 0.45 : 0) ** 2); if (tk < domT[a][R.r]) { domT[a][R.r] = tk; heap.push(tk, enc(DOM, a, R.r)); } }
        for (let b = 0; b < BEASTS.length; b++) {
            const a = 5 + b; if (DIRECTED.has(b) || R.niche[a] < 0.35 || !has[R.mass][b]) continue;
            const tb = t + 300 + -Math.log(hash01(seed, 100 + a, R.r)) / (BEAST * R.niche[a] ** 2); if (tb < domT[a][R.r]) { domT[a][R.r] = tb; heap.push(tb, enc(DOM, a, R.r)); }
        }
    };
    const beastsCame = (R, t) => {
        if (regBeast[R.r] <= t) return; regBeast[R.r] = t;
        for (const b of DIRECTED) {
            const a = 5 + b; if (R.niche[a] < 0.35 || !has[R.mass][b]) continue;
            const tb = t + 2000 + -Math.log(hash01(seed, 100 + a, R.r)) / (DIRECT * R.niche[a] ** 2); if (tb < domT[a][R.r]) { domT[a][R.r] = tb; heap.push(tb, enc(DOM, a, R.r)); }
        }
    };
    const CONTACT_KM = 700, CONTACT_YR = 400;
    const worldBegan = t => {
        for (const R of regions) for (const b of DIRECTED) {
            const a = 5 + b; if (R.niche[a] < 0.35 || !has[R.mass][b]) continue;
            const tb = t + 3500 + -Math.log(hash01(seed, 200 + a, R.r)) / (DIRECT * R.niche[a] ** 2); if (tb < domT[a][R.r]) { domT[a][R.r] = tb; heap.push(tb, enc(DOM, a, R.r)); }
        }
    };
    const speed = (a, v, t) => {
        if (!land[v]) return seaNear[v] < 280 ? 6 : 0;
        const f = fit[a][v]; let s = a < 5 ? (root.FoodTune?.base ?? 0.55) * (0.03 + 0.97 * sm(0.08, 0.45, f)) : 1.0 * (0.03 + 0.97 * sm(0.1, 0.45, f));
        if (f > 0.3 && (river[v] || coast[v])) s *= a < 5 ? (root.FoodTune?.rc ?? 2.5) : 1.8;
        s *= Math.sqrt(Math.max(0.05, 1 - 0.8 * sm(0.25, 1.4, rich[v])));
        if (farmTime[v] <= t) s *= a < 5 ? (root.FoodTune?.thru ?? 2) : 1.4;
        return s;
    };
    let tFirst = Infinity, events = 0;
    const T_CAP = 80000;
    while (heap.n) {
        const pay = heap.pop(), t = heap.top; if (t > T_CAP) break; events++;
        const type = pay >>> 24, a = (pay >>> 18) & 63, idx = pay & 0x3ffff;
        if (type === DOM) {
            const R = regions[idx];
            if (domT[a][idx] !== t) continue;                        // (stale: re-dated)
            if (done[a][R.cell] && best[a][R.cell] <= t) continue;    // (this archetype already came: adopted, not domesticated)
            if (a >= 5 && !has[R.mass][a - 5]) continue;
            if (regCentre[idx] < 0) { regCentre[idx] = centres.length; centres.push({ id: centres.length, region: idx, cell: R.cell, lat: R.lat, lon: R.lon, t0: t, primary: a < 5 && regFarm[idx] > t, founder: !!R.founder, items: [] }); }
            const C = centres[regCentre[idx]];
            C.items.push({ a, t });
            const s = strains.length; strains.push({ a, centre: C.id, t0: t });
            if (a < 5) {
                const fresh = regFarm[idx] > t;
                if (tFirst === Infinity) worldBegan(t); tFirst = Math.min(tFirst, t); farmingCame(R, t);
                if (fresh) for (const R2 of regions) if (R2 !== R && !R2.beastOnly && regFarm[R2.r] > t + CONTACT_YR && gcKm(R.lat, R.lon, R2.lat, R2.lon) < CONTACT_KM) farmingCame(R2, t + CONTACT_YR);
            } else beastsCame(R, t);
            if (t < best[a][R.cell]) { best[a][R.cell] = t; lab[a][R.cell] = s; heap.push(t, enc(STEP, a, R.cell)); }
            continue;
        }
        const v = idx;
        if (done[a][v] || t > best[a][v]) continue;
        done[a][v] = 1;
        if (land[v]) {
            if (a < 5 && fit[a][v] >= 0.25 && t < farmTime[v]) farmTime[v] = t;
            if (a >= 5 && fit[a][v] >= 0.25 && t < beastTime[v]) beastTime[v] = t;
            const r = regionOf[v];
            if (r >= 0) {
                if (a < 5 && fit[a][v] >= 0.25) farmingCame(regions[r], t);
                if (a >= 5) beastsCame(regions[r], t);
            }
        }
        const J = (v / HW) | 0, s = lab[a][v];
        for (let d = 0; d < 8; d++) {
            const m = nbr(HW, HH, v, d); if (m < 0 || done[a][m]) continue;
            const sp = speed(a, m, t); if (!(sp > 0)) continue;
            const jm = (m / HW) | 0, km = stepKm(Math.min(HCOS[J], HCOS[jm]) || 0.02, DEG_KM, d);
            const nt = t + km / sp;
            if (nt < best[a][m]) { best[a][m] = nt; lab[a][m] = s; heap.push(nt, enc(STEP, a, m)); }
        }
    }
    // (centres numbered in the order they began; the strains' times kept relative to the first farming)
    centres.sort((x, y) => x.t0 - y.t0);
    const renum = new Map(); centres.forEach((C, i) => { renum.set(C.id, i); C.id = i; C.items.sort((x, y) => x.t - y.t); });
    strains.forEach(s => { s.centre = renum.get(s.centre); });
    return { tFirst, strains, centres, best, lab, farmTime, beastTime, has, events, roll, scarce };
}


// ═════════════════════════ crops beyond the staples: variants, pulses, orchards, spices, gardens ═════════════════════════
// Field staples compete for one field and one season; the rest stack (Mintz's core–fringe–legume): pulses ride with their
// staple's package, garden crops spread fast between farmers, orchards come thousands of years late, spices stay home.
const MINOR = [
    { key: 'pulseCool', kind: 'pulse', word: 'Cool-season pulse', like: 'lentil- and pea-like', core: 1, rgb: [176, 150, 70] },
    { key: 'pulseWarm', kind: 'pulse', word: 'Warm-season bean', like: 'common-bean-like', core: 2, rgb: [170, 72, 60] },
    { key: 'pulseMonsoon', kind: 'pulse', word: 'Monsoon bean', like: 'soy- and mung-like', core: 0, rgb: [92, 150, 80] },
    { key: 'pulseSavanna', kind: 'pulse', word: 'Savanna pea', like: 'cowpea-like', core: 3, rgb: [196, 132, 150] },
    { key: 'olive', kind: 'orchard', word: 'Oil tree', like: 'olive-like', rgb: [128, 140, 64] },
    { key: 'vine', kind: 'orchard', word: 'Vine', like: 'grape-like', rgb: [128, 64, 120] },
    { key: 'date', kind: 'orchard', word: 'Oasis palm', like: 'date-like', rgb: [196, 140, 60] },
    { key: 'pome', kind: 'orchard', word: 'Chill fruit', like: 'apple- and pear-like', rgb: [200, 70, 70] },
    { key: 'nut', kind: 'orchard', word: 'Nut tree', like: 'chestnut- and walnut-like', rgb: [130, 92, 60] },
    { key: 'citrus', kind: 'orchard', word: 'Grove fruit', like: 'citrus-like', rgb: [236, 168, 40] },
    { key: 'bark', kind: 'spice', word: 'Bark spice', like: 'cinnamon-like', rgb: [190, 100, 50] },
    { key: 'berry', kind: 'spice', word: 'Pepper vine', like: 'black-pepper-like', rgb: [60, 60, 70] },
    { key: 'bud', kind: 'spice', word: 'Bud spice', like: 'clove- and nutmeg-like', rgb: [170, 60, 90] },
    { key: 'rhizome', kind: 'spice', word: 'Root spice', like: 'ginger- and turmeric-like', rgb: [230, 170, 30] },
    { key: 'seed', kind: 'spice', word: 'Seed spice', like: 'cumin- and coriander-like', rgb: [150, 120, 70] },
    { key: 'resin', kind: 'spice', word: 'Incense tree', like: 'frankincense-like', rgb: [210, 200, 160] },
    { key: 'allium', kind: 'garden', word: 'Bulbs', like: 'onion- and garlic-like' }, { key: 'brassica', kind: 'garden', word: 'Cole crops', like: 'cabbage-like' },
    { key: 'gourd', kind: 'garden', word: 'Gourds', like: 'squash-like' }, { key: 'chili', kind: 'garden', word: 'Hot pods', like: 'chili-like' },
    { key: 'melon', kind: 'garden', word: 'Melons', like: 'melon- and cucumber-like' }, { key: 'greens', kind: 'garden', word: 'Greens', like: 'leafy greens' },
    { key: 'nightshade', kind: 'garden', word: 'Fruiting vegetables', like: 'eggplant-like' }, { key: 'herbs', kind: 'garden', word: 'Herbs', like: 'thyme- and oregano-like' },
    { key: 'rootveg', kind: 'garden', word: 'Root vegetables', like: 'carrot- and turnip-like' },
    { key: 'brew', kind: 'stimulant', word: 'Leaf & bean drinks', like: 'tea- and coffee-like', rgb: [92, 128, 70] },
    { key: 'shade', kind: 'stimulant', word: 'Shade-tree stimulants', like: 'cacao- and kola-like', rgb: [128, 76, 52] },
    { key: 'fibre', kind: 'fibre', word: 'Oil & fibre crops', like: 'flax- and cotton-like', rgb: [96, 132, 190] },
];
const NM = MINOR.length;
/** Each minor crop's climate fit at a picture cell (0…1, into out). */
function minorNicheAt(L, k, out) {
    const T = L.tAnn[k], P = L.pAnn[k], Tw = L.tW[k], Tc = L.tC[k], w = L.wet[k], e = Math.max(0, L.elev[k]), ws = L.winterShare[k], sea = L.seas[k];
    const water = Math.max(L.flood[k], L.canal[k]), gs = 0.5 * (Tw + T), coast = sm(250, 60, L.distSea[k]);
    out[0] = sm(2.5, 4.5, L.pCool[k]) * sm(2.4, 1.6, w);
    out[1] = sm(2.4, 3.8, L.pWarm[k]);
    out[2] = sm(2.8, 4.3, L.pWet[k]);
    out[3] = sm(2.8, 4.3, L.pHot[k]) * sm(1.7, 1.1, w);
    out[4] = sm(1, 4, Tc) * sm(14, 10, Tc) * sm(19, 22, Tw) * sm(0.42, 0.58, ws) * sm(200, 300, P) * sm(1150, 800, P);
    out[5] = sm(11, 13, gs) * sm(24, 20.5, gs) * sm(-9, -3, Tc) * sm(1.5, 1.0, w) * sm(0.15, 0.3, w + water);
    out[6] = sm(24, 28, Tw) * sm(0.3, 0.12, w) * Math.max(sm(0.1, 0.35, water), 0.7 * sm(150, 40, L.distSea[k]));
    out[7] = sm(9, 4, Tc) * sm(-26, -16, Tc) * sm(15, 18, Tw) * sm(0.4, 0.6, w);
    out[8] = sm(4, 8, T) * sm(19, 15, T) * sm(0.6, 0.9, w) * sm(-22, -12, Tc);
    out[9] = sm(4, 9, Tc) * sm(15, 18, T) * sm(0.75, 1.05, w) * sm(25, 22, T);
    out[10] = sm(20, 22.5, Tc) * sm(1600, 2200, P) * coast;
    out[11] = sm(21.5, 23.5, T) * sm(1800, 2400, P) * sm(0.1, 0.35, e) * sm(1.8, 1.1, e);
    out[12] = sm(22.5, 24.5, T) * sm(1700, 2300, P) * sm(110, 30, L.distSea[k]);
    out[13] = sm(20, 23, T) * sm(1200, 1600, P) * sm(0.45, 0.7, sea);
    out[14] = sm(13, 17, T) * sm(25, 21, T) * sm(0.14, 0.24, w) * sm(0.6, 0.4, w);
    out[15] = sm(0.03, 0.08, w) * sm(0.35, 0.2, w) * sm(19, 23, T) * sm(0.05, 0.3, e) * sm(0.5, 0.85, sea);
    out[16] = sm(4, 8, T) * sm(25, 20, T) * sm(0.22, 0.38, w);
    out[17] = sm(2, 6, T) * sm(21, 16, T) * sm(0.45, 0.7, w);
    out[18] = sm(16, 19, Tw) * sm(0.3, 0.5, w + water);
    out[19] = sm(18, 22, T) * sm(0.5, 0.8, w);
    out[20] = sm(20, 24, Tw) * sm(0.15, 0.3, w + water) * sm(1.6, 1.1, w);
    out[21] = sm(-2, 4, T) * sm(26, 22, T) * sm(0.35, 0.6, w);
    out[22] = sm(18, 22, T) * sm(0.6, 0.9, w);
    out[23] = sm(0.42, 0.58, ws) * sm(11, 14, T) * sm(0.22, 0.38, w);
    out[24] = sm(0, 4, T) * sm(20, 15, T) * sm(0.4, 0.6, w);
    // (leaf and bean drinks: subtropical and tropical hills, wet; shade-tree stimulants: the wet tropical lowlands; oil and
    // fibre: farmland broadly — each crop's own climate narrows it)
    out[25] = sm(13, 16, T) * sm(27, 23.5, T) * sm(0.75, 1.1, w) * (0.35 + 0.65 * sm(0.15, 0.8, e)) * sm(-4, 2, Tc);
    out[26] = sm(20, 23, Tc) * sm(1300, 1800, P) * sm(1.4, 0.7, e);
    out[27] = sm(2, 7, T) * sm(0.18, 0.35, w + water);
}
/** Minor crops' fit per picture cell (bytes) and per history cell (means); each history cell's climate for a strain's home. */
function buildMinor(L, G) {
    const fitPx = new Uint8Array(N * NM), fit = Array.from({ length: NM }, () => new Float32Array(HN)), tmp = new Float32Array(NM);
    const clim = { T: new Float32Array(HN), W: new Float32Array(HN), Tc: new Float32Array(HN), E: new Float32Array(HN), dry: new Float32Array(HN), tr: new Float32Array(HN), ws: new Float32Array(HN), warm: new Float32Array(HN), coast: new Float32Array(HN) };
    const cnt = new Uint8Array(HN);
    for (let k = 0; k < N; k++) {
        if (L.ocean[k]) continue;
        minorNicheAt(L, k, tmp);
        const j = (k / W) | 0, i = k - j * W, c = (j >> 1) * HW + (i >> 1);
        for (let m = 0; m < NM; m++) { fitPx[k * NM + m] = Math.round(255 * tmp[m]); fit[m][c] += tmp[m]; }
        clim.T[c] += L.tAnn[k]; clim.W[c] += L.wet[k]; clim.Tc[c] += L.tC[k]; clim.E[c] += Math.max(0, L.elev[k]); clim.dry[c] += L.dryM[k]; clim.tr[c] += L.tW[k] - L.tC[k];
        clim.ws[c] += L.winterShare[k]; clim.warm[c] += L.warmM[k]; clim.coast[c] += L.distSea[k] < 200 ? 1 : 0; cnt[c]++;
    }
    for (let c = 0; c < HN; c++) { if (!cnt[c]) continue; for (let m = 0; m < NM; m++) fit[m][c] /= cnt[c]; for (const key in clim) clim[key][c] /= cnt[c]; }
    return { fitPx, fit, clim, cnt };
}
/** A region's climate: the mean of its land within ~2 cells. */
function regionClimate(G, Mn, R) {
    const J = (R.cell / HW) | 0, I = R.cell - J * HW, out = { T: 0, W: 0, Tc: 0, E: 0, dry: 0, tr: 0, ws: 0, warm: 0, coast: 0 }; let n = 0;
    for (let dj = -2; dj <= 2; dj++) { const jj = J + dj; if (jj < 0 || jj >= HH) continue; const span = Math.min(HW / 2, Math.round(2 / Math.max(0.2, HCOS[jj]))); for (let di = -span; di <= span; di++) { const m = jj * HW + ((I + di + HW) % HW); if (!Mn.cnt[m]) continue; n++; for (const key in out) out[key] += Mn.clim[key][m]; } }
    for (const key in out) out[key] /= Math.max(1, n);
    return out;
}
/** How well a variant from home climate `h` does at history cell c (0.55 … 1): variants are at home in climates like their hearth's. */
function homeMatch(h, Mn, c) {
    const dT = (Mn.clim.T[c] - h.T) / 7, dW = Math.log(Math.max(0.02, Mn.clim.W[c]) / Math.max(0.02, h.W)) / 0.7;
    return 0.55 + 0.45 * Math.exp(-(dT * dT + dW * dW));
}
/** One spread over the history grid from sources [{cell, t}] — speed(cell, t) km a year — capped at capKm from the source. */
function spreadFrom(sources, speed, capKm = Infinity, ownerOut = null) {
    const best = new Float64Array(HN).fill(Infinity), kmA = capKm < Infinity ? new Float32Array(HN) : null, done = new Uint8Array(HN), heap = new Heap(1 << 15), own = ownerOut || new Int8Array(HN).fill(-1);
    sources.forEach((s, i) => { if (s.t < best[s.cell]) { best[s.cell] = s.t; own[s.cell] = i; heap.push(s.t, s.cell); } });
    while (heap.n) {
        const v = heap.pop(), t = heap.top;
        if (done[v] || t > best[v]) continue;
        done[v] = 1;
        const J = (v / HW) | 0;
        for (let d = 0; d < 8; d++) {
            const m = nbr(HW, HH, v, d); if (m < 0 || done[m]) continue;
            const sp = speed(m, t); if (!(sp > 0)) continue;
            const jm = (m / HW) | 0, km = stepKm(Math.min(HCOS[J], HCOS[jm]) || 0.02, DEG_KM, d);
            if (kmA && kmA[v] + km > capKm) continue;
            const nt = t + km / sp;
            if (nt < best[m]) { best[m] = nt; own[m] = own[v]; if (kmA) kmA[m] = kmA[v] + km; heap.push(nt, m); }
        }
    }
    return Float32Array.from(best);
}
/** The crops beyond the first arrivals: each staple variant's own spread (so later, better-suited ones can compete), and the
 *  minor crops' homes and spreads. */
function runCrops(L, G, Hs, Mn, roll = 0, withMinors = true) {
    const seed = 2000003 + roll * 7919, { land, fit, river, coast, seaNear } = G, farm = Hs.farmTime;
    // each staple strain: its home's climate and its own spread (at home in climates like its hearth's)
    const variants = [];
    Hs.strains.forEach((s, i) => {
        if (s.a >= 5) return;
        const C = Hs.centres[s.centre], R = G.regions[C.region], home = regionClimate(G, Mn, R);
        const sp = (v, t) => {
            if (!land[v]) return seaNear[v] < 280 ? 6 : 0;
            const f = fit[s.a][v] * homeMatch(home, Mn, v); let x = 0.55 * (0.03 + 0.97 * sm(0.08, 0.45, f));
            if (f > 0.3 && (river[v] || coast[v])) x *= 2.5;
            if (farm[v] <= t) x *= 2;
            return x;
        };
        variants.push({ strain: i, a: s.a, centre: s.centre, t0: s.t0, home, arrive: spreadFrom([{ cell: C.cell, t: s.t0 }], sp) });
    });
    // minor crops: where each was first grown, and its spread by its kind's rules
    const regs = G.regions.filter(R => !R.beastOnly && Hs.farmTime[R.cell] < Infinity);
    const regBest = (m, R) => { const J = (R.cell / HW) | 0, I = R.cell - J * HW; let mx = 0, at = R.cell; for (let dj = -3; dj <= 3; dj++) { const jj = J + dj; if (jj < 0 || jj >= HH) continue; const span = Math.min(HW / 2, Math.round(3 / Math.max(0.2, HCOS[jj]))); for (let di = -span; di <= span; di++) { const q = jj * HW + ((I + di + HW) % HW); if (land[q] && Mn.fit[m][q] > mx) { mx = Mn.fit[m][q]; at = q; } } } return { f: mx, at }; };
    const regMax = (m, R) => regBest(m, R).f;
    const ex = (stream, id, mean) => -Math.log(hash01(seed, stream, id)) * mean;
    const minors = !withMinors ? [] : MINOR.map((M, m) => {
        let homes = [];
        if (M.kind === 'pulse') {
            for (const C of Hs.centres) { if (!C.primary) continue; const it = C.items.find(x => x.a === M.core); if (!it) continue; const R = G.regions[C.region]; if (regMax(m, R) < 0.3) continue; homes.push({ cell: regBest(m, R).at, t: it.t + 300 + ex(400 + m, C.id, 700), centre: C.id }); }
        }
        if (!homes.length) {
            const cands = regs.map(R => ({ R, f: regMax(m, R) })).filter(x => x.f >= (M.kind === 'spice' ? 0.4 : 0.45));
            const delay = M.kind === 'orchard' ? 2000 : M.kind === 'spice' ? 2000 : M.kind === 'pulse' ? 1500 : 600, mean = M.kind === 'garden' ? 1200 : 2000;
            const timed = cands.map(x => ({ cell: regBest(m, x.R).at, t: Hs.farmTime[x.R.cell] + delay + ex(500 + m, x.R.r, mean / x.f), region: x.R, centre: G.regions.indexOf(x.R) })).sort((p, q) => p.t - q.t);
            // (the first where it suits and farming came first; then, now and then, others far from it: domesticated again)
            const gap = M.kind === 'spice' ? 1200 : M.kind === 'garden' ? 2500 : 2000, odds = M.kind === 'spice' ? 0.7 : M.kind === 'garden' ? 0.45 : 0.5;
            // (a landmass with none yet domesticates its own more often than a second home on one: Earth's gardens and orchards differ
            // between the Old World and the New)
            for (const x of timed) {
                if (homes.length >= 4) break;
                if (homes.some(h => gcKm(h.region.lat, h.region.lon, x.region.lat, x.region.lon) < gap)) continue;
                const newLand = !homes.some(h => h.region.mass === x.region.mass);
                if (homes.length && hash01(seed, 600 + m, homes.length) > (newLand && M.kind !== 'spice' ? 0.85 : odds * 0.7)) continue;
                homes.push(x);
            }
        }
        const base = M.kind === 'pulse' ? 0.6 : M.kind === 'garden' ? 1.0 : M.kind === 'orchard' ? 0.7 : 0.3;
        const sp = (v, t) => {
            if (!land[v]) return seaNear[v] < 280 ? 5 : 0;
            const f = Mn.fit[m][v], farmed = farm[v] <= t;
            // (between farmers a crop is carried across land it would not grow on, garden to garden — all but the spices, kept home)
            if (farmed && M.kind !== 'spice') { let x = base * (M.kind === 'orchard' ? 5 : 3) * (0.35 + 0.65 * sm(0.15, 0.55, f)); if (river[v] || coast[v]) x *= 2; return x; }
            if (f < 0.15) return M.kind === 'pulse' && farmed ? 0.05 : 0.02;
            let x = base * sm(0.15, 0.55, f) * (farmed ? (M.kind === 'orchard' ? 5 : 3) : M.kind === 'pulse' ? 0.8 : 0.12);
            if (river[v] || coast[v]) x *= 2;
            return x;
        };
        const owner = new Int8Array(HN).fill(-1);
        const arrive = homes.length ? spreadFrom(homes.map(h => ({ cell: h.cell, t: h.t })), sp, M.kind === 'spice' ? 900 : Infinity, owner) : new Float32Array(HN).fill(Infinity);
        homes.forEach(h => { if (!h.region) h.region = G.regions[Hs.centres[h.centre].region]; h.mass = G.mass[h.cell] >= 0 ? G.mass[h.cell] : h.region.mass; h.home = regionClimate(G, Mn, h.region); });
        return { m, homes, arrive, owner };
    });
    return { variants, minors };
}

root.FoodWorld = { W, H, N, HW, HH, HN, LAT, COS, CROPS, CK, BEASTS, STAPLE, CROP_STAPLE, PLOUGH, HERDING, TECH_ALL, NA, MINOR, NM,
    buildLand, buildGround, runHistory, placeFood, croppedShare, gatherAt, larderAt, keepAt, buildMinor, runCrops, homeMatch, regionClimate, gcKm, spreadFrom, sm, S, hash01 };
})(typeof window !== 'undefined' ? window : globalThis);
