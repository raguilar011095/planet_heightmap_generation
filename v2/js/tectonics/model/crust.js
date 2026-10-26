// Crust raster: the per-plate, plate-frame record of everything the history engine
// knows about a piece of lithosphere. One CrustRaster per plate, indexed by sim-mesh
// cell id *in the plate's own frame* — rigid motion never touches these arrays.
// Structure-of-arrays so step code stays allocation-free.

export const CrustType = Object.freeze({
    OCEAN: 0,       // basaltic, created at ridges, recycled at trenches
    CONTINENT: 1,   // accreted / younger continental crust — can rift
    CRATON: 2,      // ancient, thick, rigid core — never rifts, flat interior
    ARC: 3,         // island-arc crust: buoyant, accretes onto continents as terranes
});

export const OrogenyType = Object.freeze({
    NONE: 0,
    ANDEAN: 1,      // ocean subducting beneath this continental edge
    LARAMIDE: 2,    // flat-slab variant (fast overriding plate / young slab)
    URAL: 3,        // simple collision or terrane accretion
    HIMALAYAN: 4,   // major, fast or multi-stage continental collision
    ARC: 5,         // ocean–ocean subduction volcanism
    RIFT: 6,        // uplifted shoulders of a rift, and of the failed arm beside it (East African Rift, the Ghats,
                    // the Brazilian highlands): relief made by STRETCHING, not by shortening
    TRANSPRESSION: 7, // a narrow ridge along a transform whose sides are also pressed together (the Southern Alps, the Transverse Ranges)
    INTRAPLATE: 8,  // an old weak line far inland squeezed up again by a distant front's push (step/far-field.js): the Tian Shan
                    // behind the Tarim block, the Ancestral Rockies, an inverted aulacogen — never an escalation of a belt
});

// What a mantle plume left on the crust (Phase 7a, step/hotspots.js). Records only: Phase 8 turns them into relief.
export const VolcanicType = Object.freeze({
    NONE: 0,
    TRACK: 1,       // a plume TAIL's track: seamounts and volcanic islands, age-progressive along the plate's motion
    LIP: 2,         // a plume HEAD's flood basalt: a Large Igneous Province (traps on land, a plateau at sea)
});

// Which side of a collision a belt lies on (Phase 8: a collision's cross-section is asymmetric — the plateau and the
// back range on the upper plate, the foreland fold hills and basin on the lower one). Belts built by one plate alone
// (Andean, arcs, rifts, transforms) are NONE.
export const BeltSide = Object.freeze({ NONE: 0, UPPER: 1, LOWER: 2 });

// Bit flags for the `flags` field.
export const CrustFlag = Object.freeze({
    TRENCH: 1,        // overriding-plate edge of a subduction zone (persistent polarity)
    SUTURE: 2,        // old collision weld — weak, rifts like to reuse it
    FAILED_RIFT: 4,   // aulacogen — weak, low, future river corridor
    RIFT_MARGIN: 8,   // edge created by a successful rift (passive margin origin)
    LIP: 16,          // flood-basalt province
    APRON: 32,        // old ocean captured into a continent's plate (fore-arc side of a trench)
    MARGIN_ISLE: 64,  // fore-arc island raised off an Andean / Laramide coast (step/margin-isles.js); not an island arc
    EROSIVE: 128,     // a trench cell of an EROSIVE margin: its fore-arc is eaten, not built (step/margin-isles.js)
});

// Every per-cell array of a CrustRaster. create / copyFrom / snapshot / restore go through this list, so a field
// added to the constructor must be added here too (check-invariants.mjs fails if one is missing).
export const CELL_FIELDS = Object.freeze(['type', 'flags', 'formedAt', 'terrane', 'slabKm', 'wingKm', 'oroType', 'oroWork', 'oroStart',
    'oroLast', 'thickKm', 'beltU', 'beltReach', 'beltAt', 'beltSide', 'beltShear', 'prevType', 'prevLast', 'prevU', 'prevReach', 'prevSide',
    'prevShear', 'rootKm', 'upliftKm', 'baseKm', 'rugged', 'prevRugged', 'volcWornKm', 'riverIncKm', 'volcType', 'volcAt', 'volcKm', 'volcSource', 'fzU',
    'farWork', 'farFold', 'farAt', 'farDx', 'farDy', 'farDz']);

export class CrustRaster {
    constructor(numCells) {
        this.numCells = numCells;
        this.mask = new Uint8Array(numCells);          // 1 = this plate has crust here
        this.type = new Uint8Array(numCells);          // CrustType
        this.flags = new Uint8Array(numCells);         // CrustFlag bits
        this.formedAt = new Float32Array(numCells);    // sim time (Myr) the crust formed; < 0 = pre-history
        this.terrane = new Uint16Array(numCells);      // tectonic-unit id (WBP's "tectonic units")
        // Subduction: how much slab hangs from this trench cell. Drives the trench forces. Never reset by
        // the orogeny bookkeeping below — a trench that idles for 100 Myr still has its slab.
        this.slabKm = new Float32Array(numCells);
        this.wingKm = new Float32Array(numCells);      // for a trench cell: how far along a wing past the land it lies (step/wings.js)
        // Orogeny record (interpreted into mountains by terrain synthesis, Phase 8).
        this.oroType = new Uint8Array(numCells);       // OrogenyType of the current / latest event
        this.oroWork = new Float32Array(numCells);     // convergence absorbed here during that event (km)
        this.oroStart = new Float32Array(numCells);    // sim time the event began
        this.oroLast = new Float32Array(numCells);     // sim time it was last active
        this.thickKm = new Float32Array(numCells);     // crustal thickening from all orogenies so far (km above normal); never reset (step/orogeny.js spreads it)
        // The GEOMETRY of the belt that shaped this cell (step/orogeny.js spreadBelt), for the ridges of Phase 8: where
        // across the belt the cell lies (0 at the front, 1 at the far edge — the ridges run along its contours, so their
        // direction never needs rotating as crust moves between plates), how far that belt reached (km), when this was
        // recorded, which side of a collision it is, and the sense of shear where the plates met obliquely.
        this.beltU = new Float32Array(numCells);
        this.beltReach = new Float32Array(numCells);   // 0 = no geometry recorded (e.g. an island arc's birth line)
        this.beltAt = new Float32Array(numCells);
        this.beltSide = new Uint8Array(numCells);      // BeltSide
        this.beltShear = new Int8Array(numCells);      // obliquity of the convergence, degrees: + dextral, − sinistral, 0 head-on
        // The belt the current one OVERPRINTED — kept when a new orogeny takes a cell over, so the terrain can show the
        // old grain under the new (Phase 8; developer: new orogenies dominate but do not erase). One layer deep.
        this.prevType = new Uint8Array(numCells);      // OrogenyType (0 = nothing overprinted)
        this.prevLast = new Float32Array(numCells);    // when it was last active
        this.prevU = new Float32Array(numCells);
        this.prevReach = new Float32Array(numCells);
        this.prevSide = new Uint8Array(numCells);
        this.prevShear = new Int8Array(numCells);
        // Heights as evolving state (step/heights.js; Phase 8): records only, the history never reads them
        this.rootKm = new Float32Array(numCells);      // thickened crust that can still wear away (km); heights by Airy isostasy
        this.upliftKm = new Float32Array(numCells);    // broad relief built by belts and worn by erosion (km)
        this.baseKm = new Float32Array(numCells);      // the start world's own swells, worn by erosion (km)
        this.rugged = new Float32Array(numCells);      // how high the current belt's crests stand (km)
        this.prevRugged = new Float32Array(numCells);  // …and the overprinted belt's
        this.volcWornKm = new Float32Array(numCells);  // how far a hotspot volcano has worn down since it last erupted (km)
        this.riverIncKm = new Float32Array(numCells);  // how deep the history's rivers have cut into this crust (km; step/rivers.js)
        // Volcanic record (step/hotspots.js): what a plume built here, when it last erupted here, and which plume it was.
        this.volcType = new Uint8Array(numCells);      // VolcanicType
        this.volcAt = new Float32Array(numCells);      // sim time of the last eruption here (a track's age progression lives in this)
        this.volcKm = new Float32Array(numCells);      // thickness of the volcanic pile (km): flood basalt, or a volcano's edifice
        this.volcSource = new Uint16Array(numCells);   // the plume that built it: hotspot id + 1 (0 = none)
        this.fzU = new Float32Array(numCells);         // where along its ridge ocean floor formed, in segment lengths (model/segments.js; records only: fracture zones)
        // The far field (step/far-field.js; records only): the push distant fronts have sent through this crust — how much
        // in all (km of shortening-equivalent: the grain it left), how much lately (decaying from farAt: the folds), and its
        // compression axis: a unit tangent in the plate's frame × 127 (an axis — its sign means nothing; turned with the
        // crust whenever it changes frame, copyFrom's `rot`)
        this.farWork = new Float32Array(numCells);
        this.farFold = new Float32Array(numCells);
        this.farAt = new Float32Array(numCells);
        this.farDx = new Int8Array(numCells);
        this.farDy = new Int8Array(numCells);
        this.farDz = new Int8Array(numCells);
        this.count = 0;                                // number of masked cells
        this.fields = CELL_FIELDS.map(name => this[name]);
    }

    /** Create fresh crust at `cell`. */
    create(cell, type, formedAt, terrane = 0) {
        if (!this.mask[cell]) this.count++;
        this.mask[cell] = 1;
        for (const f of this.fields) f[cell] = 0;
        this.type[cell] = type;
        this.formedAt[cell] = formedAt;
        this.terrane[cell] = terrane;
    }

    /** Copy every field of `cell` from another raster's `from` cell. */
    copyFrom(cell, other, from, rot = null) {
        if (!this.mask[cell]) this.count++;
        this.mask[cell] = 1;
        const mine = this.fields, theirs = other.fields;
        for (let i = 0; i < mine.length; i++) mine[i][cell] = theirs[i][from];
        // (from another plate's frame — `rot`: model/plate.js frameRotation — the far-field axis turns with the crust)
        if (rot && (this.farDx[cell] || this.farDy[cell] || this.farDz[cell])) {
            const x = this.farDx[cell], y = this.farDy[cell], z = this.farDz[cell];
            const u = rot[0] * x + rot[1] * y + rot[2] * z, v = rot[3] * x + rot[4] * y + rot[5] * z, w = rot[6] * x + rot[7] * y + rot[8] * z;
            const l = Math.hypot(u, v, w) || 1;
            this.farDx[cell] = Math.round(127 * u / l); this.farDy[cell] = Math.round(127 * v / l); this.farDz[cell] = Math.round(127 * w / l);
        }
    }

    /** Every field of `cell`, to put back later with restore() (e.g. while cells are being shuffled within one raster). */
    snapshot(cell) { return this.fields.map(f => f[cell]); }

    /** Put back a snapshot() at `cell` (masking it). */
    restore(cell, values) {
        if (!this.mask[cell]) this.count++;
        this.mask[cell] = 1;
        this.fields.forEach((f, i) => { f[cell] = values[i]; });
    }

    remove(cell) {
        if (this.mask[cell]) { this.mask[cell] = 0; this.count--; }
    }

    /** Mark `cell` as the overriding edge of a subduction zone that already has `slabKm` of slab. */
    armTrench(cell, slabKm) {
        this.flags[cell] |= CrustFlag.TRENCH;
        this.slabKm[cell] = Math.max(this.slabKm[cell], slabKm);
    }

    /** `km` of crust went down beneath `cell` at sim time `time`: lengthen the slab. (The belt it builds inland is step/orogeny.js.) */
    recordSubduction(cell, km) {
        this.slabKm[cell] += km;
    }

    /** Log convergence absorbed at `cell` as mountain-building of the given type. */
    recordOrogeny(cell, oroType, workKm, time, quietMyr) {
        // A long quiet gap starts a new event; otherwise the event keeps accumulating. (An event opened with no work —
        // an island arc's birth — is still an event: the next belt to reach it adds to it rather than relabelling it.)
        if (this.oroType[cell] === OrogenyType.NONE || time - this.oroLast[cell] > quietMyr) {
            this.oroStart[cell] = time;
            this.oroWork[cell] = 0;
            this.oroType[cell] = oroType;
        } else if (oroType > this.oroType[cell] && oroType !== OrogenyType.ARC && oroType !== OrogenyType.TRANSPRESSION && oroType !== OrogenyType.INTRAPLATE) {
            this.oroType[cell] = oroType;   // escalate (e.g. Andean → Himalayan), never downgrade
        }
        this.oroWork[cell] += workKm;
        this.oroLast[cell] = time;
    }
}
