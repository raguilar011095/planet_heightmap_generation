// Trewartha climate classification — a parallel scheme to Köppen using the
// same two-season proxies. Thermal groups are defined by months ≥ 10 °C,
// which we derive analytically from a sinusoidal annual cycle fitted to the
// summer/winter temperatures (same approximation spirit as koppen.js).

import { CLIMATE } from './climate-config.js';

export const TREWARTHA_CLASSES = [
    { code: 'Ocean', name: 'Ocean',                 color: [0.29, 0.44, 0.65] },
    { code: 'Ar',    name: 'Tropical rainforest',   color: [0.00, 0.30, 1.00] },
    { code: 'Aw',    name: 'Tropical savanna',      color: [0.40, 0.70, 1.00] },
    { code: 'BWh',   name: 'Hot desert',            color: [1.00, 0.20, 0.10] },
    { code: 'BWk',   name: 'Cold desert',           color: [1.00, 0.60, 0.55] },
    { code: 'BSh',   name: 'Hot steppe',            color: [0.95, 0.65, 0.10] },
    { code: 'BSk',   name: 'Cold steppe',           color: [1.00, 0.85, 0.45] },
    { code: 'Cs',    name: 'Subtropical dry-summer', color: [1.00, 1.00, 0.20] },
    { code: 'Cw',    name: 'Subtropical dry-winter', color: [0.60, 1.00, 0.60] },
    { code: 'Cf',    name: 'Subtropical humid',     color: [0.75, 1.00, 0.35] },
    { code: 'Do',    name: 'Temperate oceanic',     color: [0.30, 0.90, 0.55] },
    { code: 'Dc',    name: 'Temperate continental', color: [0.10, 0.85, 1.00] },
    { code: 'E',     name: 'Boreal',                color: [0.00, 0.50, 0.50] },
    { code: 'Ft',    name: 'Tundra',                color: [0.70, 0.70, 0.70] },
    { code: 'Fi',    name: 'Ice cap',               color: [0.41, 0.41, 0.41] },
    { code: 'H',     name: 'Highland',              color: [0.55, 0.40, 0.65] },
];

const ID = {};
TREWARTHA_CLASSES.forEach((c, i) => { ID[c.code] = i; });

// Fraction of the year a sinusoid with this mean/amplitude spends ≥ 10 °C.
function monthsAbove10(Tann, Tamp) {
    if (Tann - Tamp >= 10) { return 12; }
    if (Tann + Tamp < 10) { return 0; }
    if (Tamp <= 0) { return Tann >= 10 ? 12 : 0; }
    return (12 / Math.PI) * Math.acos((10 - Tann) / Tamp);
}

export function classifyTrewartha(mesh, r_elevation, tempResult, precipResult) {
    const n = mesh.numRegions;
    const out = new Uint8Array(n);
    const tS = tempResult.r_temperature_summer;
    const tW = tempResult.r_temperature_winter;
    const pS = precipResult.r_precip_summer;
    const pW = precipResult.r_precip_winter;

    for (let r = 0; r < n; r++) {
        const e = r_elevation[r];
        if (e <= 0) { out[r] = ID['Ocean']; continue; }

        const Ts = -45 + Math.max(0, Math.min(1, tS[r])) * 90;
        const Tw = -45 + Math.max(0, Math.min(1, tW[r])) * 90;
        const Thot = Math.max(Ts, Tw), Tcold = Math.min(Ts, Tw);
        const Tann = (Ts + Tw) / 2, Tamp = (Thot - Tcold) / 2;
        const m10 = monthsAbove10(Tann, Tamp);

        // Polar first — highland never overrides ice
        if (m10 === 0) { out[r] = Thot >= 0 ? ID['Ft'] : ID['Fi']; continue; }

        // Highland: internal elevation → km via the grayscale mapping's inverse (6·e² km)
        if (6 * e * e >= 2.5) { out[r] = ID['H']; continue; }

        // Precip in mm, hemisphere-corrected local seasons (same proxies as koppen.js)
        const Ps = Math.max(0, pS[r]) * CLIMATE.KOPPEN_PRECIP_SCALE_MM;
        const Pw = Math.max(0, pW[r]) * CLIMATE.KOPPEN_PRECIP_SCALE_MM;
        const Pann = Ps + Pw;
        const localSummerIsSim = Ts >= Tw;
        const PsL = localSummerIsSim ? Ps : Pw;   // local-summer half-year mm
        const PwL = localSummerIsSim ? Pw : Ps;    // local-winter half-year mm

        // Trewartha/Patton aridity: R(cm) = 2.3·T − 0.64·Pw% + 41
        const PwPct = Pann > 0 ? (PwL / Pann) * 100 : 50;
        const Rcm = Math.max(0, 2.3 * Tann - 0.64 * PwPct + 41);
        const PannCm = Pann / 10;
        if (PannCm < Rcm) {
            const hot = m10 >= 8;
            if (PannCm < Rcm / 2) { out[r] = hot ? ID['BWh'] : ID['BWk']; }
            else { out[r] = hot ? ID['BSh'] : ID['BSk']; }
            continue;
        }

        if (Tcold >= 18) {
            // Tropical: Ar if even the dry season stays wet (~60 mm/month proxy)
            const dryMonth = Math.min(PsL, PwL) / 6;
            out[r] = dryMonth >= 60 ? ID['Ar'] : ID['Aw'];
        } else if (m10 >= 8) {
            // Subtropical: reuse Köppen's s/w monthly-ratio thresholds
            const sM = PsL / 6, wM = PwL / 6;
            if (PsL < PwL && sM < CLIMATE.KOPPEN_S_SUMMER_MAX_MM && sM < wM / CLIMATE.KOPPEN_S_RATIO) {
                out[r] = ID['Cs'];
            } else if (PsL >= PwL && wM < sM / CLIMATE.KOPPEN_W_RATIO) {
                out[r] = ID['Cw'];
            } else {
                out[r] = ID['Cf'];
            }
        } else if (m10 >= 4) {
            out[r] = Tcold >= 0 ? ID['Do'] : ID['Dc'];
        } else {
            out[r] = ID['E'];
        }
    }
    return out;
}
