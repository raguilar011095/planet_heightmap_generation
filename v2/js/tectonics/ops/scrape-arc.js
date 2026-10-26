// Scraping an island arc onto a continent (developer, Phase 6b): an arc is thin, buoyant crust on an
// ocean plate. Where it is overridden by another plate's land it is not a continent meeting a
// continent — it is shaved off its own plate and plastered onto the one it hits, a cell at a time, as
// the arc arrives. The ocean BEHIND it keeps going down, so the two continents go on closing until
// their cores meet: that is when a collision record and a suture belong (step/collision.js).
//
// This is deliberately lean, and unlike ops/accrete-terrane.js it runs every step while an arc is
// arriving: it moves crust and flags the seam, and does NOT close seas or spread belts (repeating
// either every step would manufacture land). The belt comes later, from the collision of the cores.

import { CrustType, CrustFlag } from '../model/crust.js';
import { frameRotation } from '../model/plate.js';

/**
 * Move `cells` (raster cells of `donor`, arc crust) onto `host`.
 * Cells that land on the host's own land are absorbed — the same ground, already land there.
 * @returns {{moved: number, absorbed: number}}
 */
export function scrapeArc(world, host, donor, cells) {
    const { mesh } = world, { xyz, index } = mesh;
    const H = host.crust, D = donor.crust;
    const P = [0, 0, 0];
    let moved = 0, absorbed = 0, rot = null;
    for (const c of cells) {
        if (!D.mask[c]) continue;
        donor.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
        const q = host.cellAt(index, P[0], P[1], P[2]);
        if (H.mask[q] && H.type[q] !== CrustType.OCEAN) absorbed++;      // the host's land is already here
        else {
            H.copyFrom(q, D, c, rot ??= frameRotation(donor, host));
            H.flags[q] = (H.flags[q] & ~CrustFlag.TRENCH) | CrustFlag.SUTURE;   // scraped on: a weak seam, and the trench is re-established outboard by the polarity rule
            moved++;
        }
        D.remove(c);
    }
    donor.markReshaped(); host.markReshaped();
    if (D.count === 0) { donor.alive = false; donor.omega = [0, 0, 0]; donor.dynamics = null; }
    host.refreshExtent(xyz); donor.refreshExtent(xyz);
    return { moved, absorbed };
}
