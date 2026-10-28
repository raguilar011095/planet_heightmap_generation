// A rigid plate: an orientation, an angular velocity, and a crust raster in its own frame.
// All conversion between the world frame and a plate's frame goes through the three helpers
// below (toWorld / toPlateFrame / cellAt) — nothing else should touch `mat` directly.

import { quatIdentity, quatToMat3 } from '../../core/rotation.js';
import { CrustRaster, CrustType } from './crust.js';

export class Plate {
    /**
     * @param {number} id        stable unique id (index into world.plates)
     * @param {number} numCells  sim-mesh cell count
     * @param {number} born      sim time of creation (Myr)
     */
    constructor(id, numCells, born = 0) {
        this.id = id;
        this.name = String(id);
        this.alive = true;
        this.born = born;
        this.bornOfRift = false;                  // born as a piece of a rift (its tenure shrinks over hot mantle: step/rifting.js)
        // the colour it is drawn in (view/palettes.js plateHue): its own id at first, the larger partner's after a weld, the
        // larger half's after a rift — so a giant plate keeps its colour when it swallows a small one (display only)
        this.hue = id;
        this.isBackground = false;                // passive pre-history ocean: never drives, never grows
        this.quat = quatIdentity();               // plate frame → world frame
        this.mat = quatToMat3(this.quat, new Float64Array(9));   // same rotation, row-major 3×3
        this.omega = [0, 0, 0];                   // world-frame angular velocity, rad/Myr
        this.crust = new CrustRaster(numCells);
        this.dirty = false;                       // crust changed since the extent / counts were last refreshed (refreshExtent clears it)
        // Cells added, removed or rewritten since the world view was last built (resolve clears it). While it is set,
        // world.owner / ownerCell are STALE for this plate: an event rule that reads them must skip the plate (or re-check
        // its own raster). Any op that changes a plate's mask or remaps its raster calls markReshaped(); a change of a
        // cell's type in place (an arc, a fore-arc island) does not reshape the plate — it only sets dirty.
        this.reshaped = false;
        // Bounding cap in the plate frame (for culling in the gather pass).
        this.capCenter = [0, 0, 1];
        this.capCos = -1;
        this.stats = { cells: 0, continentalCells: 0 };
        this.bins = null;                         // coarse occupancy marks, per resolve pass (step/occupancy.js)
        /** Force diagnostics from the last torque balance (step/torque-balance.js), or null. */
        this.dynamics = null;
        // Wings and arcs (step/wings.js)
        this.wingBudgetKm = 0;                    // trench-wing growth owed, at most one cell's worth
        this.wings = new Map();                   // wing tip raster cell → the wing's fixed direction in the plate frame
        this.arcTerraneId = null;                 // terrane id given to this plate's island arcs, once it has any
        this.marginIsleTerrane = null;            // terrane id given to its fore-arc islands, once it has any (step/margin-isles.js)
        // Rifting (ops/rift.js, step/forces.js)
        this.riftPartner = -1;                    // the plate this one was rifted from / into, if any
        this.oceanSplitWith = -1;                 // …the same, when a new ridge split an ocean plate (step/ocean-plates.js): old floor
                                                  // along the line counts as a rifted margin for the push
        this.splitAt = -Infinity;                 // when that last happened
        this.riftPushDir = null;                  // plate-frame unit vector: straight away from that partner, fixed at the split
        // Slabs and margins (step/boundaries.js, step/backarc.js)
        this.flatSlab = false;                    // the slab under this plate's trench is flat right now
        this.flatSlabKm = 0;                      // slab gone down flat since the slab flattened: how far inland the Laramide belt reaches
        this.lastFedAt = -Infinity;               // when this plate's trenches last consumed crust (a long pause resets flatSlabKm)
        this.backArcOf = -1;                      // for a strip that rifted off behind a rolling-back trench: the plate it left
        this.backArcPushDir = null;               // …and the plate-frame direction toward its trench, which it follows while the sea opens
        this.rollbackCmYr = 0;                    // …at the rollback rate of the slab it follows
        this.lastBackArcAt = -Infinity;           // when this plate last took part in a back-arc split
        this.isOceanBorn = false;                 // carved out of the passive ocean when a trench founded there (ops/birth-ocean-plate.js)
        /** Free-form data a test scene attaches to its plates (prescribed motion, labels…). The engine never reads it. */
        this.scene = {};
    }

    setQuat(q) {
        this.quat = q;
        quatToMat3(q, this.mat);
    }

    /** Plate-frame position → world position, written into `out`. */
    toWorld(x, y, z, out) {
        const m = this.mat;
        out[0] = m[0] * x + m[1] * y + m[2] * z; out[1] = m[3] * x + m[4] * y + m[5] * z; out[2] = m[6] * x + m[7] * y + m[8] * z;
        return out;
    }

    /** World position → plate-frame position (the inverse rotation = the transpose), written into `out`. */
    toPlateFrame(x, y, z, out) {
        const m = this.mat;
        out[0] = m[0] * x + m[3] * y + m[6] * z; out[1] = m[1] * x + m[4] * y + m[7] * z; out[2] = m[2] * x + m[5] * y + m[8] * z;
        return out;
    }

    /** The raster cell of this plate that lies under a world position. */
    cellAt(index, x, y, z) {
        const m = this.mat;
        return index.nearest(m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z);
    }

    /**
     * This plate's bounding cap in the world frame, with two cells of slack: [cx, cy, cz, cosRadius].
     * A world position p cannot be on the plate if dot(p, c) < cosRadius.
     */
    capInWorld(mesh) {
        const c = this.toWorld(this.capCenter[0], this.capCenter[1], this.capCenter[2], [0, 0, 0]);
        const radius = Math.acos(Math.max(-1, Math.min(1, this.capCos))) + 2 * mesh.edgeRad;
        return [c[0], c[1], c[2], radius >= Math.PI ? -2 : Math.cos(radius)];     // −2: never cull (Float32 dots can dip just below −1)
    }

    /** Recompute the plate-frame bounding cap and cell counts from the crust mask. */
    /** This plate's cells were added, removed or rewritten: its world view is stale until the next resolve (see `reshaped`). */
    markReshaped() { this.reshaped = true; this.dirty = true; }

    refreshExtent(xyz) {
        const { mask, type } = this.crust;
        let sx = 0, sy = 0, sz = 0, n = 0, nc = 0;
        for (let c = 0; c < mask.length; c++) {
            if (!mask[c]) continue;
            sx += xyz[3 * c]; sy += xyz[3 * c + 1]; sz += xyz[3 * c + 2];
            n++;
            if (type[c] !== CrustType.OCEAN) nc++;
        }
        this.stats.cells = n;
        this.stats.continentalCells = nc;
        this.crust.count = n;
        this.dirty = false;
        const l = Math.hypot(sx, sy, sz);
        // Nothing to bound, or crust wrapped right round the globe (no meaningful centre): disable culling.
        if (n === 0 || l < 1e-6 * n) { this.capCenter = [0, 0, 1]; this.capCos = -1; return; }
        const cx = sx / l, cy = sy / l, cz = sz / l;
        let minDot = 1;
        for (let c = 0; c < mask.length; c++) {
            if (!mask[c]) continue;
            const d = cx * xyz[3 * c] + cy * xyz[3 * c + 1] + cz * xyz[3 * c + 2];
            if (d < minDot) minDot = d;
        }
        this.capCenter = [cx, cy, cz];
        this.capCos = minDot;
    }
}

/**
 * The rotation that carries a vector in `from`'s frame into `to`'s (row-major 3×3: to.matᵀ · from.mat) — for records that
 * hold a direction (the far-field axis, CrustRaster.copyFrom) when crust moves from one plate to another.
 */
export function frameRotation(from, to) {
    const a = from.mat, b = to.mat, r = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[3 * i + j] = b[i] * a[j] + b[3 + i] * a[3 + j] + b[6 + i] * a[6 + j];
    return r;
}
