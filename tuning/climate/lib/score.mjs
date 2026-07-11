/**
 * Runs the climate chain on a prebuilt Earth context with a given set of
 * climate parameter overrides, classifies Köppen zones, and scores them
 * against the real-Earth ground truth.
 */

import { SimplexNoise } from '../../../js/simplex-noise.js';
import { setClimateParams, resetClimateParams } from '../../../js/climate-config.js';
import { computeWind } from '../../../js/wind.js';
import { computeOceanCurrents } from '../../../js/ocean.js';
import { computePrecipitation } from '../../../js/precipitation.js';
import { computeTemperature } from '../../../js/temperature.js';
import { classifyKoppen, KOPPEN_CLASSES } from '../../../js/koppen.js';
import { NO_DATA } from './ground-truth.mjs';
import { similarity, majorGroupOf, MAJOR_GROUPS } from './koppen-distance.mjs';

const NUM_CLASSES = KOPPEN_CLASSES.length;

// Rare seasonal / Mediterranean climates that vanish easily and that the user
// specifically wants preserved. Their mean F1 is a dedicated objective term so
// the optimizer is penalized for losing them.
const WATCHLIST = ['Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Dsa', 'Dsb', 'Dsc', 'Dwa', 'Dwb', 'Dwc'];
const WATCHLIST_IDS = new Set(
    WATCHLIST.map(code => KOPPEN_CLASSES.findIndex(c => c.code === code)).filter(i => i > 0)
);

// Objective weights (sum to 1). Graded accuracy dominates; group balance fights
// the over-desert / over-temperate bias; the watchlist protects Mediterranean.
const W_GRADED = 0.60;      // dominant: distance-weighted correctness (convex, so big errors hurt most)
const W_MACRO_F1 = 0.12;
const W_GROUP_BALANCE = 0.15;
const W_WATCHLIST = 0.13;   // trimmed from 0.20 to rein in the Mediterranean over-pull

/** Major Köppen group per class ID: A, B, C, D, E (ocean → ''). */
export const majorGroup = majorGroupOf;

/**
 * Run the climate simulation chain (same call sequence and arguments as
 * planet-worker.js handleImportHeightmap) and classify Köppen.
 */
export function runClimate(ctx, paramOverrides = {}) {
    resetClimateParams();
    setClimateParams(paramOverrides);
    try {
        const noise = new SimplexNoise(ctx.seed);
        const windResult = computeWind(ctx.mesh, ctx.r_xyz, ctx.r_elevation, ctx.plateIsOcean, ctx.r_plate, noise);
        const oceanResult = computeOceanCurrents(ctx.mesh, ctx.r_xyz, ctx.r_elevation, windResult);
        const precipResult = computePrecipitation(ctx.mesh, ctx.r_xyz, ctx.r_elevation, windResult, oceanResult, 0, 0.3);
        const tempResult = computeTemperature(ctx.mesh, ctx.r_xyz, ctx.r_elevation, windResult, oceanResult, precipResult, 0);
        const r_koppen = classifyKoppen(ctx.mesh, ctx.r_elevation, tempResult, precipResult);
        return { r_koppen, windResult, precipResult, tempResult };
    } finally {
        resetClimateParams();
    }
}

/**
 * Score a simulated Köppen field against ground truth.
 *
 * objective = 0.60·gradedAcc + 0.12·macroF1 + 0.15·groupBalance + 0.13·watchlistF1
 *   gradedAcc     — per-cell climatic similarity (partial credit; a big error
 *                   like rainforest→desert scores ~0, an adjacent one ~0.8)
 *   macroF1       — unweighted mean F1, keeps every class alive regardless of area
 *   groupBalance  — 1 − ½·Σ|simFrac−truthFrac| over A/B/C/D/E, penalizes the
 *                   over-desert / over-temperate bias
 *   watchlistF1   — mean F1 over Mediterranean & monsoon seasonal subtypes, so
 *                   they can't be optimized away
 */
export function scoreKoppen(ctx, r_koppen) {
    const { r_truth, r_scored } = ctx;
    const n = ctx.mesh.numRegions;

    const confusion = Array.from({ length: NUM_CLASSES }, () => new Uint32Array(NUM_CLASSES));
    let scored = 0, exact = 0, major = 0, gradedSum = 0;

    // Major-group area fractions (sim vs truth) over the same scored cells
    const gi = Object.fromEntries(MAJOR_GROUPS.map((g, i) => [g, i]));
    const truthGroup = new Float64Array(MAJOR_GROUPS.length);
    const simGroup = new Float64Array(MAJOR_GROUPS.length);

    for (let r = 0; r < n; r++) {
        if (!r_scored[r]) continue;
        const t = r_truth[r];
        const s = r_koppen[r];
        if (t === NO_DATA) continue;
        scored++;
        confusion[t][s]++;
        if (t === s) exact++;
        if (majorGroup(t) === majorGroup(s)) major++;
        gradedSum += similarity(t, s);
        const tg = gi[majorGroup(t)]; if (tg !== undefined) truthGroup[tg]++;
        const sg = gi[majorGroup(s)]; if (sg !== undefined) simGroup[sg]++;
    }

    // Per-class precision/recall/F1 (over classes present in truth)
    const perClass = [];
    const f1ByCode = {};
    let f1Sum = 0, f1Count = 0;
    for (let c = 1; c < NUM_CLASSES; c++) {   // skip Ocean (id 0)
        let tp = confusion[c][c], fn = 0, fp = 0;
        for (let s = 0; s < NUM_CLASSES; s++) {
            if (s !== c) fn += confusion[c][s];
        }
        for (let t = 0; t < NUM_CLASSES; t++) {
            if (t !== c) fp += confusion[t][c];
        }
        const support = tp + fn;
        if (support === 0) continue;          // class absent from truth
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp / support;
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
        perClass.push({ code: KOPPEN_CLASSES[c].code, support, precision, recall, f1 });
        f1ByCode[KOPPEN_CLASSES[c].code] = f1;
        f1Sum += f1;
        f1Count++;
    }
    const macroF1 = f1Count > 0 ? f1Sum / f1Count : 0;
    const exactAcc = scored > 0 ? exact / scored : 0;
    const majorAcc = scored > 0 ? major / scored : 0;
    const gradedAcc = scored > 0 ? gradedSum / scored : 0;

    // Group balance (total-variation complement)
    const groupFractions = {};
    let tv = 0;
    for (let i = 0; i < MAJOR_GROUPS.length; i++) {
        const sf = scored > 0 ? simGroup[i] / scored : 0;
        const tf = scored > 0 ? truthGroup[i] / scored : 0;
        groupFractions[MAJOR_GROUPS[i]] = { sim: sf, truth: tf };
        tv += Math.abs(sf - tf);
    }
    const groupBalance = 1 - 0.5 * tv;

    // Watchlist F1 (present-in-truth watchlist classes only; absent → count as 0
    // so the optimizer is pushed to make them appear where truth says they should)
    let wlSum = 0, wlCount = 0;
    for (const c of WATCHLIST_IDS) {
        const code = KOPPEN_CLASSES[c].code;
        // support>0 check: only score classes that actually occur in truth
        const occurs = perClass.some(p => p.code === code);
        if (!occurs && !truthHasClass(confusion, c)) continue;
        wlSum += f1ByCode[code] ?? 0;
        wlCount++;
    }
    const watchlistF1 = wlCount > 0 ? wlSum / wlCount : 0;

    const objective =
        W_GRADED * gradedAcc +
        W_MACRO_F1 * macroF1 +
        W_GROUP_BALANCE * groupBalance +
        W_WATCHLIST * watchlistF1;

    return {
        objective,
        gradedAcc, exactAcc, majorAcc, macroF1, groupBalance, watchlistF1,
        groupFractions,
        scored,
        perClass,
        confusion,
    };
}

function truthHasClass(confusion, c) {
    let s = 0;
    for (let j = 0; j < confusion[c].length; j++) s += confusion[c][j];
    return s > 0;
}

/** Evaluate one parameter set end-to-end. */
export function evaluateParams(ctx, paramOverrides = {}) {
    const t0 = performance.now();
    const { r_koppen } = runClimate(ctx, paramOverrides);
    const metrics = scoreKoppen(ctx, r_koppen);
    metrics.evalMs = Math.round(performance.now() - t0);
    return { metrics, r_koppen };
}

/** Top-N confusion pairs (truth ≠ sim) for diagnostics. */
export function topConfusions(confusion, topN = 12) {
    const pairs = [];
    for (let t = 1; t < NUM_CLASSES; t++) {
        for (let s = 0; s < NUM_CLASSES; s++) {
            if (t !== s && confusion[t][s] > 0) {
                pairs.push({ truth: KOPPEN_CLASSES[t].code, sim: KOPPEN_CLASSES[s].code, count: confusion[t][s] });
            }
        }
    }
    pairs.sort((a, b) => b.count - a.count);
    return pairs.slice(0, topN);
}
