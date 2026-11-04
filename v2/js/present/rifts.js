// G3f — rift valleys (plans/GENERATE_REDESIGN_PLAN.md; owner, 2026-11-04: rifts "should look more like the african rift
// valley for this tool"). present/belts.js lays out each rift's valley line on the sim mesh — stepping from side to side
// in segments, deeper and wider here, shallower there, broken in places — with its shoulders and its dome; here, on
// Generate's own mesh, the graben is cut along it: a trough of the line's depth and width, its floor still land (the
// valley floor of the Gregory rift stands ~0.5–1.5 km up, on the dome). Read through the terrain's own warped sampling of
// the sim mesh, so the valley wanders as the coasts and belts do, as fine as the Detail. Laid down before the hold and
// the rivers, so the rivers run along it.

import { PRESENT } from './present-config.js';

/**
 * Cuts the rift valleys into a terrain surface, in place.
 * @param {Float32Array} heightKm  the surface on Generate's mesh (km)
 * @param {{km: Float32Array, depth: Float32Array, half: Float32Array}} rift  per sim cell: km from the nearest valley
 *   line, and that line's depth and half-width (present/belts.js riftField)
 * @param {{cells: Int32Array, weights: Float32Array}} S  each region's three sim cells and weights (sampleOnto)
 */
export function cutRifts(heightKm, rift, S, cfg = PRESENT) {
    const { km, depth, half } = rift, { cells, weights } = S;
    for (let r = 0; r < heightKm.length; r++) {
        const h = heightKm[r];
        if (!(h > 0)) continue;
        const o = 3 * r, a = cells[o], b = cells[o + 1], c = cells[o + 2], wa = weights[o], wb = weights[o + 1], wc = weights[o + 2];
        if (km[a] >= 1e4 && km[b] >= 1e4 && km[c] >= 1e4) continue;
        // (a corner the valley does not reach reads as far from it)
        const d = wa * Math.min(km[a], 1e3) + wb * Math.min(km[b], 1e3) + wc * Math.min(km[c], 1e3);
        const dep = wa * depth[a] + wb * depth[b] + wc * depth[c], hw = wa * half[a] + wb * half[b] + wc * half[c];
        if (!(dep > 0) || !(hw > 0) || d > 3 * hw) continue;
        const cut = dep * Math.exp(-((d / hw) ** 2));
        heightKm[r] = Math.max(h - cut, Math.min(h, cfg.riftFloorKm));
    }
}
