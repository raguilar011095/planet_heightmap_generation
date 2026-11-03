// G2 — the present-day world as an Evolution Frame (plans/GENERATE_REDESIGN_PLAN.md §3.3): what Evolution's terrain,
// Add detail, geology and farming read. One instant, on Evolution's sim mesh, every plate's rotation the identity (so the
// terrain reads every record on the world grid: anchor.js), positions and plate spins in Evolution's z-up frame.
// Records the present-day world has not made yet are zeros — that feature off, as an older planet file reads.

import { frameArrays } from '../tectonics/snapshot.js';
import { CrustType, CrustFlag } from '../tectonics/model/crust.js';
import { BoundaryKind } from '../tectonics/model/world.js';
import { classifyMargins } from '../tectonics/measure.js';
import { TECTONICS } from '../tectonics/config.js';
import { Boundary } from './plates.js';
import { genToEvoVec } from './layout.js';
import { writeCrust } from './belts.js';

// which boundary a cell on two shows: a trench's over the rest, then a collision, a ridge, a transform
const RANK = { [BoundaryKind.SUBDUCTING]: 5, [BoundaryKind.OVERRIDING]: 5, [BoundaryKind.COLLISION]: 4, [BoundaryKind.RIDGE]: 3, [BoundaryKind.TRANSFORM]: 2, [BoundaryKind.NONE]: 0 };

/**
 * @param {Object} L  the layout   @param {Object} W  the plates   @param {Object} B  the boundaries (on `land`)
 * @param {Uint8Array} land  the crust's land per cell (the coast as drawn)   @param {{ageMyr, fzU}} sea  the floor's ages
 * @returns {import('../tectonics/snapshot.js').Frame}
 */
export function presentFrame(L, W, B, land, sea, crust = null) {
    const n = L.mesh.numRegions, f = frameArrays(n);
    f.time = 0;
    for (let c = 0; c < n; c++) {
        f.owner[c] = W.cellPlate[c];
        f.type[c] = land[c] ? CrustType.CONTINENT : CrustType.OCEAN;
        f.formedAt[c] = land[c] ? -2000 : -sea.ageMyr[c];
        f.fzU[c] = land[c] ? 0 : sea.fzU[c];
    }
    const put = (c, kind) => { if (RANK[kind] > RANK[f.boundary[c]]) f.boundary[c] = kind; };
    for (let i = 0; i < B.count; i++) {
        const a = B.cellA[i], b = B.cellB[i];
        switch (B.kind[i]) {
            case Boundary.RIDGE: case Boundary.RIFT: put(a, BoundaryKind.RIDGE); put(b, BoundaryKind.RIDGE); break;
            case Boundary.TRANSFORM: put(a, BoundaryKind.TRANSFORM); put(b, BoundaryKind.TRANSFORM); break;
            case Boundary.COLLISION: put(a, BoundaryKind.COLLISION); put(b, BoundaryKind.COLLISION); break;
            case Boundary.SUBDUCTION: {
                const over = B.over[i] === 0 ? a : b, down = over === a ? b : a;
                put(over, BoundaryKind.OVERRIDING); put(down, BoundaryKind.SUBDUCTING);
                f.flags[over] |= CrustFlag.TRENCH; f.trench[over] = 1;
                break;
            }
        }
    }
    // the crust's records (present/belts.js: today's belts, the arcs and rift seas they made, and — G4 — the past's)
    if (crust) writeCrust(f, crust);
    f.plates = W.plates.map(p => ({
        id: p.index, name: `Plate ${p.index + 1}`, alive: true, isBackground: false,
        omega: genToEvoVec(p.euler), quat: [1, 0, 0, 0], centre: genToEvoVec(p.centroid), hue: 0,
        cells: p.cellCount, landCells: Math.round(p.landShare * p.cellCount), speedCmYr: p.speedCmYr, dynamics: null,
    }));
    f.margin.set(classifyMargins(f, L.sim, TECTONICS));
    f.hotspots = []; f.events = []; f.cycle = null; f.geoSea = null;
    f.budget = { created: 0, consumed: 0, erodedCells: 0, underthrustCells: 0, recycledCells: 0 };
    return f;
}
