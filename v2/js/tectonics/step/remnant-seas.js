// Remnant seas close (Phase 11). Ocean sealed inside one plate — ringed by that plate's own land, with no plate boundary
// anywhere around it (left by a weld, a docking, a captured strait) — has nothing that could ever subduct it: in the
// history it would stand for ever. On Earth such a sea closes from its margins as its floor is thrust under and onto
// the land around it (ophiolites; the Neo-Tethys remnants, the closing Mediterranean): it lives some tens of Myr, and
// only a few, small, young ones exist at a time. So each such sea gives up a ring of cells at its shore to the land
// about it every time its plate has closed remnantSeaCloseKmPerMyr × dt worth of cell spacing — a suture zone, low.

import { CrustType, CrustFlag } from '../model/crust.js';
import { GeoFlag } from '../model/geology.js';

/** @returns {number} plates changed (their crust is reshaped: the world view must be rebuilt) */
export function closeRemnantSeas(world, dt) {
    const { mesh, plates, config, time } = world, { numCells, adjOffset, adjList, edgeKm } = mesh;
    const rate = config.remnantSeaCloseKmPerMyr;
    if (!(rate > 0) || dt <= 0) return 0;
    const spacing = edgeKm * Math.sqrt(3) / 2;
    let changed = 0;
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        // (the seas are looked for only when a ring is due: every cell spacing's worth of closing)
        plate.remnantKm = (plate.remnantKm ?? 0) + rate * dt;
        if (plate.remnantKm < spacing) continue;
        const { mask, type } = plate.crust;
        // the plate's enclosed seas: its ocean cells in components that touch no cell outside its crust
        const seen = new Uint8Array(numCells), shore = [];
        let any = false;
        for (let c0 = 0; c0 < numCells; c0++) {
            if (!mask[c0] || type[c0] !== CrustType.OCEAN || seen[c0]) continue;
            const comp = [c0]; seen[c0] = 1;
            let open = false;
            for (let i = 0; i < comp.length; i++) for (let k = adjOffset[comp[i]]; k < adjOffset[comp[i] + 1]; k++) {
                const nb = adjList[k];
                if (!mask[nb]) { open = true; continue; }
                if (type[nb] === CrustType.OCEAN && !seen[nb]) { seen[nb] = 1; comp.push(nb); }
            }
            // (islands of arc crust in it or round it do not keep it open: a back-arc basin sealed in one plate closes too —
            // the Sea of Japan is closing now)
            // (nor is an ocean too big to be a remnant: a plate that has grown round most of the globe holds the world
            // ocean itself, which touches no other plate — closing it turned the whole planet into land)
            if (open || comp.length * mesh.cellAreaKm2 > config.remnantSeaMaxKm2) continue;
            any = true;
            for (const c of comp) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (type[adjList[k]] !== CrustType.OCEAN) { shore.push(c); break; }
        }
        plate.remnantKm -= spacing;
        if (!any) continue;
        // the shore ring closes: each cell takes the land beside it (a crumpled, sutured margin)
        for (const c of shore) {
            // (from continental crust beside it where there is some: an arc's islands do not spread over the basin)
            let from = -1;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (type[nb] !== CrustType.OCEAN && (from < 0 || (type[from] === CrustType.ARC && type[nb] !== CrustType.ARC))) from = nb; }
            plate.crust.copyFrom(c, plate.crust, from);
            if (plate.crust.type[c] === CrustType.CRATON) plate.crust.type[c] = CrustType.CONTINENT;     // (a craton never grows)
            plate.crust.formedAt[c] = time;
            plate.crust.flags[c] = CrustFlag.SUTURE;
            plate.crust.slabKm[c] = 0;
            if (config.geology?.records) plate.crust.geoFlags[c] |= GeoFlag.OPHIOLITE;   // (the geological record: the sea's floor, thrust up into the land)
        }
        world.budget.remnantClosedCells = (world.budget.remnantClosedCells ?? 0) + shore.length;
        plate.markReshaped();
        changed++;
    }
    return changed;
}
