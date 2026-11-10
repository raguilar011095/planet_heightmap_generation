// The climate as shares, not one class (plans/V2_SATELLITE_LOOK_PLAN.md P2; owner, 2026-11-01: "each climate is binary,
// but it could be scalar. Like a blend of the main climate and the 2 its most like"): Köppen's own tests (koppen.js
// classifyCell, Beck et al.) with soft thresholds, folded into the Satellite view's families of climates — a place near
// the line between two climates is part of each, by how near it is, so the transitions follow the climate's own
// gradients: wide where it changes slowly over a plain, tight across a rain shadow. With every softness at 0 it gives
// classifyCell's family. DOM-free.

/** The families, as the Satellite view colours them (evolution/sat-style.js RAMP_FAMILIES, by name), in its order. */
export const SOFT_FAMILIES = ['rainforest', 'savanna', 'desert', 'steppe', 'mediterranean', 'temperate', 'continental', 'taiga', 'tundra', 'ice'];

/**
 * How soft each test is — the half-width of its step: aridLn (the rain against the dry line, as a log ratio: 0.18 ≈ ±20 %),
 * tropicC (the coldest month against 18 °C), polarC (the warmest against 10 °C), iceC (…against 0 °C), cdC (the coldest
 * against 0 °C: C or D), summerC (the warmest against 22 °C), month10C (each month against 10 °C, for the months above it),
 * months10 (their count against 4: the line between 3 and 4), dryMm (a dry month against 60 / 40 mm), ratioLn (the seasons' rain ratios, as logs),
 * rainHalf (a half-year's share of the rain against 70 % / 50 %).
 */
export const SOFT_KOPPEN = { aridLn: 0.18, tropicC: 1.2, polarC: 1.2, iceC: 1.0, cdC: 1.5, summerC: 1.5, month10C: 1.0, months10: 0.6, dryMm: 12, ratioLn: 0.3, rainHalf: 0.06 };

const S = (x, a, b) => { if (!(b > a)) return x < a ? 0 : 1; const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SUMMER_A = [3, 4, 5, 6, 7, 8], SUMMER_B = [9, 10, 11, 0, 1, 2];

/**
 * Each family's share of a place with these twelve months (T °C, P mm; month 0 the northern winter solstice's), into
 * `out` (SOFT_FAMILIES' order; they sum to 1).
 */
export function softFamilies(T, P, out = new Float64Array(SOFT_FAMILIES.length), K = SOFT_KOPPEN) {
    let MAT = 0, MAP = 0, Thot = -Infinity, Tcold = Infinity, m10 = 0, Pdry = Infinity;
    for (let m = 0; m < 12; m++) {
        const t = T[m], p = Math.max(0, P[m]);
        MAT += t; MAP += p;
        if (t > Thot) Thot = t;
        if (t < Tcold) Tcold = t;
        m10 += S(t, 10 - K.month10C, 10 + K.month10C);
        if (p < Pdry) Pdry = p;
    }
    MAT /= 12;
    let tA = 0, tB = 0;
    for (const m of SUMMER_A) tA += T[m];
    for (const m of SUMMER_B) tB += T[m];
    const summer = tA >= tB ? SUMMER_A : SUMMER_B, winter = tA >= tB ? SUMMER_B : SUMMER_A;
    let Ps = 0, Psdry = Infinity, Pswet = 0, Pwdry = Infinity, Pwwet = 0;
    for (const m of summer) { const p = Math.max(0, P[m]); Ps += p; if (p < Psdry) Psdry = p; if (p > Pswet) Pswet = p; }
    for (const m of winter) { const p = Math.max(0, P[m]); if (p < Pwdry) Pwdry = p; if (p > Pwwet) Pwwet = p; }
    const Pw = MAP - Ps, sShare = MAP > 0 ? Ps / MAP : 0.5;
    const lnr = (a, b) => Math.log(Math.max(a, 0.1) / Math.max(b, 0.1));
    // B (arid): the rain against the dry line, whose offset follows the half-year the rain falls in
    const off = 14 + 14 * (S(sShare, 0.7 - K.rainHalf, 0.7 + K.rainHalf) - S(1 - sShare, 0.7 - K.rainHalf, 0.7 + K.rainHalf));
    const Pth = 2 * MAT + off;
    const arid = Pth > 0 ? 1 - S(lnr(MAP, 10 * Pth), -K.aridLn, K.aridLn) : 0;
    const desert = Pth > 0 ? 1 - S(lnr(MAP, 5 * Pth), -K.aridLn, K.aridLn) : 0;
    // A (tropical): the coldest month; the rainforest by its driest month
    const trop = S(Tcold, 18 - K.tropicC, 18 + K.tropicC);
    const rain = Math.max(S(Pdry, 60 - K.dryMm, 60 + K.dryMm), S(Pdry - (100 - MAP / 25), -K.dryMm, K.dryMm));
    // E (polar): the warmest month
    const polar = 1 - S(Thot, 10 - K.polarC, 10 + K.polarC), ice = 1 - S(Thot, -K.iceC, K.iceC);
    // C or D: the coldest month; a dry summer (C's Mediterranean) unless the winter is drier still; a warm or long summer
    // (D's continental) or a short one (its taiga)
    const C = S(Tcold, -K.cdC, K.cdC);
    const sDry = (1 - S(Psdry, 40 - K.dryMm, 40 + K.dryMm)) * (Pwwet > 0 ? 1 - S(lnr(3 * Psdry, Pwwet), -K.ratioLn, K.ratioLn) : 0);
    const wDry = Pswet > 0 ? 1 - S(lnr(10 * Pwdry, Pswet), -K.ratioLn, K.ratioLn) : 0;
    const med = sDry * (1 - wDry * S(sShare, 0.5 - K.rainHalf, 0.5 + K.rainHalf));
    const cont = 1 - (1 - S(Thot, 22 - K.summerC, 22 + K.summerC)) * (1 - S(m10, 3.5 - K.months10, 3.5 + K.months10));
    // the tree of tests, each share the product along its branch
    const humid = 1 - arid, notTrop = humid * (1 - trop), cd = notTrop * (1 - polar);
    out[0] = humid * trop * rain;
    out[1] = humid * trop * (1 - rain);
    out[2] = arid * desert;
    out[3] = arid * (1 - desert);
    out[4] = cd * C * med;
    out[5] = cd * C * (1 - med);
    out[6] = cd * (1 - C) * cont;
    out[7] = cd * (1 - C) * (1 - cont);
    out[8] = notTrop * polar * (1 - ice);
    out[9] = notTrop * polar * ice;
    return out;
}

/**
 * A grid gathering places' shares (equal-angle, w × w/2, rows north → south): per land place g = wants(lat, lon), and if
 * g ≥ 0, add(g, shares); then done() → { w, h, n, data: Uint8Array(n · w · h) } — family f of grid cell g at data[f · w · h + g], each cell's shares
 * summing to 255 where it has land (0 where none: a gap filled from its neighbours, one cell around, if they have land).
 */
export function softFamilyGrid(w = 1024, perCell = 4) {
    const h = w >> 1, G = w * h, NF = SOFT_FAMILIES.length, sum = new Float32Array(NF * G), cnt = new Float32Array(G);
    const index = (lat, lon) => Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / 180 * h))) * w + Math.min(w - 1, Math.max(0, Math.floor((lon + 180) / 360 * w)));
    return {
        /** How many grid cells, and how many places each takes. */
        size: G, perCell,
        /** The grid cell a place falls in. */
        index,
        /** The grid cell a place falls in, or −1 if that cell already has `perCell` places (the work bounded at any detail). */
        wants(lat, lon) {
            const g = index(lat, lon);
            return cnt[g] < perCell ? g : -1;
        },
        /** A place's shares into grid cell g (from wants). */
        add(g, f) {
            for (let k = 0; k < NF; k++) sum[k * G + g] += f[k];
            cnt[g]++;
        },
        done() {
            const data = new Uint8Array(NF * G);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const g = y * w + x;
                let c = cnt[g], s = null;
                if (!(c > 0)) {
                    // (a gap at a coarse detail: its neighbours' mean)
                    c = 0; s = new Float64Array(NF);
                    for (let dy = -1; dy <= 1; dy++) {
                        const yy = y + dy; if (yy < 0 || yy >= h) continue;
                        for (let dx = -1; dx <= 1; dx++) { const gg = yy * w + ((x + dx + w) % w); if (!(cnt[gg] > 0)) continue; c += cnt[gg]; for (let k = 0; k < NF; k++) s[k] += sum[k * G + gg]; }
                    }
                    if (!(c > 0)) continue;
                }
                let t = 0;
                for (let k = 0; k < NF; k++) t += s ? s[k] : sum[k * G + g];
                if (!(t > 0)) continue;
                for (let k = 0; k < NF; k++) data[k * G + g] = Math.round(255 * (s ? s[k] : sum[k * G + g]) / t);
            }
            return { w, h, n: NF, data };
        },
    };
}
