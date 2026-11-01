// The wild larder (plans/V2_FOOD_PLAN.md §4.1, F3a): where each crop archetype's wild ancestor would grow — its
// domestication niche, not where the crop later grows (food-research/domestication.md §2, §3.3) — and a region's odds of
// becoming a hearth (§4.2). Smooth scores in °C, mm, km and months (the same at every detail), from a place's measures
// (beasts.js landMeasures' list) and four more:
//   ws     the winter half's share of the year's rain (0…1: the Mediterranean's ~0.9, a monsoon's ~0.05)
//   dry    months warm enough to grow but too dry (the growing season's warm months less its rain-fed ones)
//   maxP   the wettest month's rain (mm)
//   relief the range of the mean heights of it and its neighbours (km, ~165 km across: history.js)
// The beasts' wild homes are beasts.js beastWild's.
//   · COOL-SEASON GRAINS (with pulses): winter rain and a long summer drought, mild winters, hills — the Fertile Crescent's
//     (Blumler: 32 of the world's 56 biggest-seeded grasses grow in such climates);
//   · PADDY GRAINS: seasonal wetlands and floodplains, hot summers, within ~30° of the equator;
//   · WARM-SEASON GRAINS: monsoon millets (summer rain, strong temperature seasons), savanna grains (one short hot rainy
//     season), a maize-like grass of seasonally dry tropical hills;
//   · ROOTS & TUBERS: the forest–savanna edge (3–5 dry months), cold tropical highlands (2–4 km);
//   · TREE & PALM CROPS: the ever-wet tropics (2 dry months or fewer: vegeculture), oasis palms by water in hot deserts.
// Harris, Fuller, Denham: 4–5 or more dry or cold months give seed crops kept in granaries, 2 or fewer clonal crops kept in
// the ground, 3–5 roots with a grain fringe.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The crop archetypes' wild niches, in CROPS' order (rice, wheat, maize, roots, trees), into out (0…1), from a place's
 *  measures M. */
export function cropWild(M, out) {
    const T = M.T, P = M.P, Tw = M.Tw, Tc = M.Tc, w = M.arid, dry = M.dry, e = Math.max(0, M.elev), ws = M.ws, lat = Math.abs(M.lat);
    const hill = smooth(0.1, 0.5, M.relief), flat = smooth(0.5, 0.15, M.relief), river = Math.max(M.flood, 0.6 * M.canal);
    // paddy grains: seasonal wetlands and floodplains — a river's plain, waterlogged flats, or a monsoon's flooding on the flat
    const wetland = Math.max(M.wetland, 0.8 * M.flood, smooth(170, 260, M.maxP) * flat * smooth(0.7, 1.1, w));
    // (seasonal wetlands best, but the ever-wet's too: the Pearl River's wild rice — Huang et al. 2012 — grows the year round)
    out[0] = smooth(15.5, 18, T) * smooth(23, 26.5, Tw) * smooth(34, 27, lat) * wetland * smooth(0, 2, dry + 2 * M.seas);
    // cool-season grains: winter rain and a long summer drought; mild winters; hills
    out[1] = smooth(0.44, 0.62, ws) * smooth(1, 3, dry) * smooth(-5, 0, Tc) * smooth(15, 10, Tc) * smooth(180, 300, P) * smooth(1300, 850, P) * smooth(2.4, 1.7, e) * (0.55 + 0.45 * hill);
    // warm-season grains: monsoon millets, savanna grains, a grass of seasonally dry tropical hills
    const millet = smooth(0.36, 0.2, ws) * smooth(250, 420, P) * smooth(1000, 750, P) * smooth(12, 22, Tw - Tc) * smooth(4, 10, T);
    const savanna = smooth(19, 23, T) * smooth(3, 5, dry) * smooth(9.5, 7.5, dry) * smooth(220, 380, P) * smooth(1200, 900, P);
    const hillGrass = smooth(0.4, 0.7, e) * smooth(2.2, 1.8, e) * smooth(4, 6, dry) * smooth(14, 18, T) * smooth(26, 20, lat);
    out[2] = Math.max(millet, savanna, hillGrass);
    // roots and tubers: the forest–savanna edge; cold tropical highlands
    const edge = smooth(2, 3.2, dry) * smooth(6, 4.8, dry) * smooth(19, 22, T) * smooth(800, 1050, P);
    const high = smooth(1.9, 2.5, e) * smooth(4.5, 3.8, e) * smooth(28, 18, lat) * smooth(-2, 3, Tc);
    out[3] = Math.max(edge, high);
    // tree and palm crops: the ever-wet tropics; oasis palms by water in the hot deserts
    out[4] = Math.max(smooth(2.6, 1.4, dry) * smooth(21, 24, T) * smooth(1500, 2100, P) * smooth(1.6, 1.0, e), smooth(0.2, 0.08, w) * smooth(21, 25, T) * river);
    return out;
}

/** Net primary productivity (g of dry matter a m² a year) by the Miami model (Lieth 1975): the lesser of what the year's
 *  warmth and its rain allow. */
export const npp = (T, P) => Math.min(3000 / (1 + Math.exp(1.315 - 0.119 * T)), 3000 * (1 - Math.exp(-0.000664 * P)));
/** Matranga's (2024) temperature seasonality: the warmest quarter less the coldest, each cut off at 0 °C (°C). */
export const tempSeasons = (Tw, Tc) => { const A = Tw - Tc; return Math.max(Tw - 0.15 * A, 0) - Math.max(Tc + 0.15 * A, 0); };
