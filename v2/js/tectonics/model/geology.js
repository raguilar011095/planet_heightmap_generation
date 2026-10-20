// The geological record each piece of crust keeps (plans/V2_GEOLOGY_PLAN.md, G1): what happened at its surface — the
// sediment laid on it and what kind, how deep erosion has cut into it, how long it lay under shallow sea, how long it
// stood in a live magmatic arc — so the finish can say what rock is exposed there and which deposits formed and survive.
// Records only, like the heights (step/geology.js): the history never reads them. The raster keeps them in full
// (model/crust.js); a frame keeps them packed into bytes (the encodings below — one place for writer and readers).

// Bit flags for the `geoFlags` field: settings the crust has been in, which its other records do not keep.
export const GeoFlag = Object.freeze({
    WAS_ARC: 1,       // born in an island arc — kept after it matures into continent (arc-maturation.js only changes `type`)
    FORELAND: 2,      // sat in a foreland basin (sunk under a range's load)
    RIFT_BASIN: 4,    // sat in a rift basin while it was young (a failed arm, an aulacogen)
    OPHIOLITE: 8,     // ocean floor caught up into land as a sea closed (step/remnant-seas.js)
    SLAB_CHANGE: 16,  // stood in a live arc when its slab flattened or steepened (porphyry copper's favourite moment)
    SHELF: 32,        // lay on a continental shelf
    EPEIRIC: 64,      // lay under an inland shallow sea, the continent flooded at a high stand of the sea
});

// ── A frame's geology fields: what each holds and how it is packed into a byte or two per cell ──
export const GEO_FRAME_FIELDS = ['geoFlags', 'coverKm', 'coverMaxKm', 'coverMaxAge', 'facies', 'exhumKm', 'unroofKm', 'floodMyr', 'floodAge', 'arcMyr'];

const COVER_MAX_KM = 16;                    // cover, by the square root: fine where thin (0.25 m), coarse where thick (0.16 km at 10 km)
const EXHUM_STEP_KM = 0.25, FLOOD_STEP_MYR = 2, ARC_STEP_MYR = 2, AGE_STEP_MYR = 8, FLOOD_AGE_STEP_MYR = 5;

export const encodeCoverKm = km => Math.min(255, Math.round(255 * Math.sqrt(Math.max(0, km) / COVER_MAX_KM)));
export const decodeCoverKm = v => COVER_MAX_KM * (v / 255) ** 2;
export const encodeExhumKm = km => Math.min(255, Math.round(Math.max(0, km) / EXHUM_STEP_KM));
export const decodeExhumKm = v => v * EXHUM_STEP_KM;
export const encodeUnroofKm = km => Math.max(-127, Math.min(127, Math.round(km / EXHUM_STEP_KM)));
export const decodeUnroofKm = v => v * EXHUM_STEP_KM;
export const encodeFloodMyr = myr => Math.min(255, Math.round(myr / FLOOD_STEP_MYR));
export const decodeFloodMyr = v => v * FLOOD_STEP_MYR;
export const encodeArcMyr = myr => Math.min(255, Math.round(myr / ARC_STEP_MYR));
export const decodeArcMyr = v => v * ARC_STEP_MYR;
/** How long ago (Myr), in AGE_STEP_MYR steps (0…2040 Myr). */
export const encodeAge = myr => Math.min(255, Math.max(0, Math.round(myr / AGE_STEP_MYR)));
export const decodeAge = v => v * AGE_STEP_MYR;
/** How long ago the crust was last under shallow sea: 0 never, else 1 + the age in FLOOD_AGE_STEP_MYR steps (0…1265 Myr). */
export const encodeFloodAge = (last, time, ever) => (ever ? 1 + Math.min(254, Math.max(0, Math.round((time - last) / FLOOD_AGE_STEP_MYR))) : 0);
export const decodeFloodAge = v => (v ? (v - 1) * FLOOD_AGE_STEP_MYR : Infinity);
/** The cover's make-up, a nibble each (0…15): carbonate, salt, coal, organic-rich (source rock); the rest sand and mud. */
export function encodeFacies(carb, salt, coal, organic) {
    const q = x => Math.min(15, Math.max(0, Math.round(15 * x)));
    return q(carb) | (q(salt) << 4) | (q(coal) << 8) | (q(organic) << 12);
}
export function decodeFacies(v, out = { carb: 0, salt: 0, coal: 0, organic: 0 }) {
    out.carb = (v & 15) / 15; out.salt = ((v >> 4) & 15) / 15; out.coal = ((v >> 8) & 15) / 15; out.organic = ((v >> 12) & 15) / 15;
    return out;
}
