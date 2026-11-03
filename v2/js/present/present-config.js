// The present-day world's tunables (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment of a
// believable history, its past filled in by closed forms. Physical units throughout: km, Myr, cm/yr.

export const PRESENT = {
    // ── G1: plates that move ──
    // Generate's plates are the PIECES you raise or sink. Neighbouring pieces are grouped into plates that move, which
    // carry continent and ocean alike (as Evolution's do), so most coasts lie inside a plate: passive margins.
    platesPerSqrtPieces: 1.5,      // about 1.5 √P plates: 80 pieces → 13 (Earth: 7 major, ~8 minor)
    minPlates: 3,
    maxPlates: 18,
    // A big continent is split along the seam where today's pieces converged or parted hardest: a collision or a rift
    // inside it (India–Asia, Africa–Arabia) — and the owner's wish that the big ranges stay loosely where they were.
    splitMinShare: 0.07,           // a continent covering ≥ 7 % of the sphere (~36 Mkm²) may be split once…
    splitTwiceShare: 0.2,          // …twice from 20 % (a supercontinent)
    splitMinPart: 0.25,            // each part at least a quarter of the continent
    splitTries: 8,                 // seams tried, strongest first
    oceanPlateMin: 1,              // at least this many ocean-only plates (a Pacific)
    // A continent trails its ocean behind it: the ocean its plate takes grows 1 + α times less far ahead of its motion
    // than behind, so the leading coast meets another plate (a trench: the Andes) and the trailing one stays passive.
    leadingAnisotropy: 5,
    // An ocean-only plate is drawn toward the continents it dives under (slab pull): its motion is bent this far from
    // the motion its pieces had toward those boundaries.
    slabPullBlend: 0.55,
    // Speeds (the plate's RMS surface speed). Continents are slow, the bigger the slower; ocean plates with trenches fast.
    continentSpeedCmYr: [1.5, 4.0],    // a continent plate's speed from small to big …
    continentSpeedFullShare: 0.15,     // … the slowest at ≥ 15 % of the sphere
    oceanSpeedCmYr: [4.0, 8.5],        // an ocean plate's speed from no trench to its whole rim at continents
    speedJitter: 0.15,                 // ± a share of it, per plate
    // Boundaries: each kind by the relative motion across it, averaged along the boundary
    smoothKm: 450,                 // the motion averaged over this much of the same boundary either side
    transformRatio: 0.45,          // |closing or opening| below this share of the slip along it: a transform
    minRateCmYr: 0.4,              // slower than this: an inactive seam
};
