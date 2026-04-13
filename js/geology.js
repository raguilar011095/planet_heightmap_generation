// Rock type classification based on tectonic setting.
// Assigns one of 16 rock types to each region using boundary type,
// stress, volcanism, basin factor, and elevation data.
//
// Reference: Madeline James — "Mineralogy" & "Deposits and Gemology"
// https://www.madelinejameswrites.com/blog/minerology

import { SimplexNoise } from './simplex-noise.js';

// ── Rock Type Enum (7 land types + ocean) ──
export const ROCK_TYPES = {
    METAMORPHIC: 0,   // shields, collision zones (Himalayan/Ural)
    GRANITIC:    1,   // basement rock, shields, Andean-style mountains
    ANDESITIC:   2,   // island arcs, Laramide/Andean ranges
    BASALTIC:    3,   // LIPs, hotspots, mid-ocean ridges, rifts
    SANDSTONE:   4,   // non-marine platform environments, basins
    CARBONATE:   5,   // uplifted marine sediments, ancient shallow seas
    SEDIMENTS:   6,   // unconsolidated material in lowlands, foreland basins
    OCEAN:       7,   // ocean — rendered as blue, no geology
};

// ── Rock Type Metadata ──
//                                                     hex → [r,g,b] normalized
export const ROCK_TYPE_INFO = [
    { name: 'Metamorphic',  code: 'Met', color: [0.502, 0.612, 0.478], category: 'metamorphic',  description: 'Shields and collision zones (Himalayan/Ural)' },           // #809C7A
    { name: 'Granitic',     code: 'Grt', color: [0.910, 0.722, 0.773], category: 'igneous',      description: 'Basement rock for shields and Andean-style mountains' },    // #E8B8C5
    { name: 'Andesitic',    code: 'And', color: [0.694, 0.576, 0.718], category: 'igneous',      description: 'Dominant in island arcs and Laramide/Andean ranges' },      // #B193B7
    { name: 'Basaltic',     code: 'Bas', color: [0.290, 0.290, 0.290], category: 'igneous',      description: 'Large Igneous Provinces (LIPs) and hotspots' },             // #4A4A4A
    { name: 'Sandstone',    code: 'Sst', color: [0.961, 0.820, 0.553], category: 'sedimentary',  description: 'Non-marine platform environments and basins' },             // #F5D18D
    { name: 'Carbonate',    code: 'Crb', color: [0.992, 0.949, 0.820], category: 'sedimentary',  description: 'Uplifted marine sediments and ancient shallow seas' },      // #FDF2D1
    { name: 'Sediments',    code: 'Sed', color: [0.992, 0.973, 0.902], category: 'sedimentary',  description: 'Unconsolidated material in lowlands and foreland basins' }, // #FDF8E6
    { name: 'Ocean',        code: 'Ocn', color: [0.150, 0.300, 0.550], category: 'ocean',        description: 'Ocean floor' },                                            // #264D8C
];

// ── Classification Thresholds ──
const OCEAN_DIVERGENT_STRESS  = 0.03;  // stress threshold for basalt at mid-ocean ridges
const HOTSPOT_THRESHOLD       = 0.02;  // dl_hotspot value for volcanic rock
const LIP_THRESHOLD           = 0.005; // dl_lip value for flood basalt
const LIP_CONTACT_FRAC        = 0.3;   // fraction of LIP_THRESHOLD for contact metamorphism aureole
const HIGH_STRESS             = 0.40;  // gneiss/schist boundary
const VERY_HIGH_STRESS        = 0.60;  // gneiss threshold
const MODERATE_STRESS         = 0.15;  // slate/andesite boundary
const LOW_STRESS              = 0.05;  // craton vs active interior
const CRATON_BASIN_THRESH     = 0.30;  // basinFactor below this = craton
const BASIN_THRESH            = 0.55;  // basinFactor above this = basin
const SHALLOW_SEA_ELEV        = 0.035; // ~200m — ancient shallow sea limit (high sea level +150-200m)
const SHALE_ELEV              = 0.10;  // below this in basins → shale
const GREENSTONE_PROB         = 0.12;  // probability of greenstone in deep cratons
const RIFT_STRESS             = 0.05;  // stress threshold for rift basalt on land
const CONVERGENT_OCEAN_STRESS = 0.25;  // stress for diorite vs andesite split
const FORELAND_STRESS         = 0.08;  // stress indicating foreland basin proximity to orogen

// ── Classification Function ──
// Uses multi-frequency noise to perturb all thresholds, creating organic
// transitions between rock types instead of geometric boundaries.
export function assignRockTypes(
    mesh, r_xyz, r_elevation, r_plate, plateIsOcean,
    r_boundaryType, r_stress, r_subductFactor, r_bothOcean, r_hasOcean,
    dl_hotspot, dl_lip, r_basinFactor, noise, seed,
    koppenArr,
    // Extended terrain detail layers (all optional)
    dl_erosionDelta, dl_coastal, dl_foldRidge, dl_orogenicPower,
    dl_backArc, dl_margins, dl_dynamicTopo
) {
    const N = mesh.numRegions;
    const NUM_TYPES = ROCK_TYPE_INFO.length;  // 7
    const r_rockType = new Uint8Array(N);

    // Blend noise: used to modulate between top-3 rock types.
    // Domain-warped for organic, flowing province boundaries.
    const blendNoise = new SimplexNoise(seed + 9901);
    const warpNoise  = new SimplexNoise(seed + 9905);  // warps the blend lookup coords

    // Reusable score array (one per rock type), cleared each region
    const scores = new Float64Array(NUM_TYPES);

    for (let r = 0; r < N; r++) {
        const elev    = r_elevation[r];
        const stress  = r_stress[r];
        const bType   = r_boundaryType[r];
        const hotspot = dl_hotspot ? dl_hotspot[r] : 0;
        const lip     = dl_lip ? dl_lip[r] : 0;
        const basin   = r_basinFactor ? r_basinFactor[r] : 0.5;
        const pid     = r_plate[r];
        const isOceanPlate = plateIsOcean.has ? plateIsOcean.has(pid) : false;
        const bothOcean = r_bothOcean ? r_bothOcean[r] : 0;
        const hasOcean  = r_hasOcean ? r_hasOcean[r] : 0;

        // Extended terrain detail
        const erosion    = dl_erosionDelta ? dl_erosionDelta[r] : 0;
        const coastal    = dl_coastal ? dl_coastal[r] : 0;
        const foldRidge  = dl_foldRidge ? dl_foldRidge[r] : 0;
        const orogPower  = dl_orogenicPower ? dl_orogenicPower[r] : 0;
        const backArc    = dl_backArc ? dl_backArc[r] : 0;
        const margin     = dl_margins ? dl_margins[r] : 0;

        // Derived signals
        const oroGrade = stress + Math.max(0, foldRidge) * 2.0 + Math.max(0, orogPower) * 1.5;
        const isErosional = erosion < -0.003 || elev > 0.35;
        const isDepositional = erosion > 0.002 || basin > 0.6;
        const lipStrength = lip / LIP_THRESHOLD;  // >1 = above threshold

        // ── Clear scores ──
        scores.fill(0);

        // ════════════════════════════════════════
        //  OCEAN — just mark as ocean, skip scoring
        // ════════════════════════════════════════
        if (elev <= 0) {
            r_rockType[r] = ROCK_TYPES.OCEAN;
            continue;
        } else {
            // ════════════════════════════════════════
            //  LAND — Score every signal additively
            // ════════════════════════════════════════

            // ── VOLCANIC: LIPs ──
            // lipStrength is the key modulator:
            //   ~1.0 = barely above threshold (old/eroded LIP) → mostly sediment, some basalt
            //   ~2-3 = moderate LIP → basalt dominant, sediment at edges
            //   ~4+  = strong/young LIP → solid basalt
            if (lipStrength > 1.0) {
                const ls = lipStrength - 1.0;  // 0 at threshold, ramps up
                scores[ROCK_TYPES.BASALTIC]  += ls * ls * 1.5;  // quadratic: weak LIPs get little basalt
                scores[ROCK_TYPES.SANDSTONE] += Math.max(0, 1.5 - ls * 0.8);  // sediment fills gaps in old LIPs
                scores[ROCK_TYPES.SEDIMENTS] += Math.max(0, 1.0 - ls * 0.6);
                // Context: subduction nearby → andesite blends in
                if (bType === 1 && hasOcean) scores[ROCK_TYPES.ANDESITIC] += 1.5;
                // Context: hotspot nearby → granitic blends in
                if (hotspot > HOTSPOT_THRESHOLD * 0.5 && !isOceanPlate) {
                    scores[ROCK_TYPES.GRANITIC] += 1.2;
                }
            }
            // Contact metamorphism aureole around LIPs
            if (lipStrength > LIP_CONTACT_FRAC && lipStrength <= 1.0) {
                const aurStr = (lipStrength - LIP_CONTACT_FRAC) / (1.0 - LIP_CONTACT_FRAC);
                scores[ROCK_TYPES.METAMORPHIC] += aurStr * 3.0;
            }

            // ── VOLCANIC: Hotspot ──
            if (hotspot > HOTSPOT_THRESHOLD) {
                const hStr = hotspot / HOTSPOT_THRESHOLD;
                if (!isOceanPlate) {
                    scores[ROCK_TYPES.GRANITIC] += hStr * 1.2;
                    if (isErosional) scores[ROCK_TYPES.GRANITIC] += 0.8;
                } else {
                    scores[ROCK_TYPES.BASALTIC] += hStr * 2.5;
                }
            }

            // ── OROGENIC BELTS: Subduction mountains ──
            if (bType === 1 && hasOcean && stress > MODERATE_STRESS) {
                const arcStress = stress / MODERATE_STRESS;
                if (oroGrade > HIGH_STRESS) {
                    // Andean-style: granite + andesite + metamorphic
                    scores[ROCK_TYPES.GRANITIC]    += 1.5;
                    scores[ROCK_TYPES.ANDESITIC]   += 2.5;
                    scores[ROCK_TYPES.METAMORPHIC] += 1.0;
                    if (isErosional) scores[ROCK_TYPES.GRANITIC] += 1.5;
                } else {
                    // Laramide-style: heavily andesitic
                    scores[ROCK_TYPES.ANDESITIC] += arcStress * 3.0;
                    scores[ROCK_TYPES.GRANITIC]  += arcStress * 0.6;
                }
            }

            // ── OROGENIC BELTS: Continental collision ──
            // Even continent-continent collisions often involve remnant
            // subduction-zone andesitic rock from prior oceanic closure.
            if (bType === 1 && stress > MODERATE_STRESS && !hasOcean) {
                if (oroGrade > HIGH_STRESS) {
                    scores[ROCK_TYPES.METAMORPHIC] += 3.0;
                    scores[ROCK_TYPES.ANDESITIC]   += 1.0; // remnant arc material
                    scores[ROCK_TYPES.CARBONATE]   += 0.8;
                } else {
                    scores[ROCK_TYPES.METAMORPHIC] += 2.0;
                    scores[ROCK_TYPES.ANDESITIC]   += 0.8;
                    scores[ROCK_TYPES.SANDSTONE]   += 1.0;
                    scores[ROCK_TYPES.CARBONATE]   += 0.5;
                }
            }

            // ── OROGENIC BELTS: Island arcs ──
            if (bType === 1 && bothOcean && stress > MODERATE_STRESS) {
                scores[ROCK_TYPES.ANDESITIC] += 4.0;
                scores[ROCK_TYPES.BASALTIC]  += 0.8;
            }

            // ── Fold belts (broad orogenic influence) ──
            // Mountain ranges contain andesitic rock from past subduction
            // alongside metamorphic from pressure/heat.
            if (oroGrade > HIGH_STRESS * 0.7 && foldRidge > 0.01) {
                const foldStr = Math.min(3, oroGrade / HIGH_STRESS);
                scores[ROCK_TYPES.METAMORPHIC] += foldStr * 1.5;
                scores[ROCK_TYPES.ANDESITIC]   += foldStr * 1.0;
                scores[ROCK_TYPES.SANDSTONE]   += foldStr * 0.3;
            }

            // ── Back-arc basin ──
            if (backArc < -0.02) {
                const baStr = Math.min(3, Math.abs(backArc) * 30);
                scores[ROCK_TYPES.BASALTIC]  += baStr * 0.5;
                scores[ROCK_TYPES.SANDSTONE] += baStr * 0.8;
                scores[ROCK_TYPES.SEDIMENTS] += baStr * 1.2;
            }

            // ── Rift zone ──
            if (bType === 2 && stress > RIFT_STRESS) {
                scores[ROCK_TYPES.BASALTIC]  += 2.5;
                scores[ROCK_TYPES.SEDIMENTS] += 0.5;
            }

            // ── Transform fault ──
            if (bType === 3 && stress > MODERATE_STRESS) {
                scores[ROCK_TYPES.METAMORPHIC] += 1.5;
                scores[ROCK_TYPES.SANDSTONE]   += 0.5;
            }

            // ── CRATONS: Shield vs Platform ──
            // Shields only where erosion is strong AND it's a deep craton (low basin).
            // Most craton surface is platform (sedimentary cover).
            if (basin < CRATON_BASIN_THRESH && stress < LOW_STRESS) {
                if (isErosional && basin < 0.15) {
                    // Deep shield: exposed basement (granitic + metamorphic)
                    scores[ROCK_TYPES.GRANITIC]    += 2.2;
                    scores[ROCK_TYPES.METAMORPHIC] += 1.0;
                } else if (isErosional) {
                    // Moderate erosion on craton edge: mostly sedimentary, some basement
                    scores[ROCK_TYPES.GRANITIC]    += 0.6;
                    scores[ROCK_TYPES.SANDSTONE]   += 1.5;
                } else {
                    // Platform: sedimentary cover
                    if (elev < SHALLOW_SEA_ELEV) scores[ROCK_TYPES.CARBONATE] += 2.5;
                    else { scores[ROCK_TYPES.SANDSTONE] += 2.0; scores[ROCK_TYPES.SEDIMENTS] += 0.8; }
                }
            }

            // ── Ancient shallow seas ──
            if (elev < SHALLOW_SEA_ELEV && elev > 0 && !isErosional) {
                scores[ROCK_TYPES.CARBONATE] += 2.0;
            }

            // ── Foreland basins ──
            if (stress > FORELAND_STRESS && stress < MODERATE_STRESS && isDepositional) {
                scores[ROCK_TYPES.SEDIMENTS] += 2.0;
                scores[ROCK_TYPES.SANDSTONE] += 1.0;
            }

            // ── Continental margins / coastal ──
            if (Math.abs(margin) > 0.02 || (Math.abs(coastal) > 0.01 && stress < MODERATE_STRESS)) {
                if (elev < SHALLOW_SEA_ELEV) scores[ROCK_TYPES.CARBONATE] += 1.5;
                scores[ROCK_TYPES.SANDSTONE] += 1.0;
                scores[ROCK_TYPES.SEDIMENTS] += 0.8;
            }

            // ── Rift basins ──
            if (bType === 2 && basin > 0.4 && stress < RIFT_STRESS) {
                scores[ROCK_TYPES.SANDSTONE] += 1.2;
                scores[ROCK_TYPES.SEDIMENTS] += 1.5;
            }

            // ── Depositional basins ──
            if (isDepositional || basin > BASIN_THRESH) {
                if (elev < SHALLOW_SEA_ELEV)       scores[ROCK_TYPES.CARBONATE]  += 1.5;
                else if (elev < SHALE_ELEV)        scores[ROCK_TYPES.SEDIMENTS]  += 1.5;
                else                               scores[ROCK_TYPES.SANDSTONE]  += 1.2;
            }

            // ── Erosional interior ──
            // Only expose granite in strongly eroded, high-elevation areas.
            // Low-elevation erosion just thins sedimentary cover, doesn't reach basement.
            if (isErosional && stress < MODERATE_STRESS && elev > 0.20) {
                scores[ROCK_TYPES.GRANITIC]    += 0.5;
                scores[ROCK_TYPES.METAMORPHIC] += 0.2;
            }

            // ── ELEVATION-BASED BASEMENT EXPOSURE ──
            // Cubic ease-in: foothills barely affected, high mountains strongly.
            //   elev 0.10 → t=0, elev ~0.40 → t=1
            //   cubic: t³ keeps low elevations mostly sedimentary,
            //   ramps steeply only for real peaks.
            if (elev > 0.12) {
                const raw = Math.min(1.0, (elev - 0.12) * 2.5);  // reaches 1.0 at ~0.52
                const t = raw * raw * raw;  // cubic ease-in
                scores[ROCK_TYPES.METAMORPHIC] += t * 1.2;
                scores[ROCK_TYPES.GRANITIC]    += t * 0.6;
                // Andesitic: strong at/near subduction zones in mountains
                if (hasOcean && bType === 1) {
                    scores[ROCK_TYPES.ANDESITIC] += t * 2.5;
                } else if (stress > 0.08 && hasOcean) {
                    // Near subduction (some stress + ocean involvement)
                    scores[ROCK_TYPES.ANDESITIC] += t * 1.8;
                } else if (stress > 0.05) {
                    // Any stressed mountain region — remnant arc material
                    scores[ROCK_TYPES.ANDESITIC] += t * 0.5;
                }
                // Suppress sedimentary with same curve
                scores[ROCK_TYPES.SEDIMENTS] *= (1.0 - t * 0.9);
                scores[ROCK_TYPES.SANDSTONE] *= (1.0 - t * 0.90);
                scores[ROCK_TYPES.CARBONATE] *= (1.0 - t * 0.3);
            }

            // ── DEFAULT SEDIMENTARY FLOOR ──
            // ~75% of continental surface is sedimentary — but only lowlands.
            if (elev < 0.10) {
                if (elev < SHALLOW_SEA_ELEV)       scores[ROCK_TYPES.CARBONATE]  += 0.5;
                else if (basin > 0.4)              scores[ROCK_TYPES.SEDIMENTS]  += 0.5;
                scores[ROCK_TYPES.SANDSTONE] += 0.3;
            }
        }

        // ── Find top-3 rock types by score ──
        let first = 0, firstScore = scores[0];
        let second = 0, secondScore = -1;
        let third = 0, thirdScore = -1;
        for (let t = 1; t < NUM_TYPES; t++) {
            const s = scores[t];
            if (s > firstScore) {
                third = second; thirdScore = secondScore;
                second = first; secondScore = firstScore;
                first = t; firstScore = s;
            } else if (s > secondScore) {
                third = second; thirdScore = secondScore;
                second = t; secondScore = s;
            } else if (s > thirdScore) {
                third = t; thirdScore = s;
            }
        }

        // ── Pick among top-3 using noise ──
        // noise remapped to 0..1; selection thresholds:
        //   > 0.4  → 1st choice  (60% of range → most common)
        //   > 0.1  → 2nd choice  (30% of range)
        //   <= 0.1 → 3rd choice  (10% of range)
        // Only use 2nd/3rd if they actually have score.
        const px = r_xyz[r * 3], py = r_xyz[r * 3 + 1], pz = r_xyz[r * 3 + 2];
        // Domain warp: offset the blend lookup by a low-freq noise field
        // so rock province boundaries bend and flow organically.
        const warpAmp = 0.12;
        const wx = px + warpNoise.noise3D(px * 10, py * 10, pz * 10) * warpAmp;
        const wy = py + warpNoise.noise3D(px * 10 + 31, py * 10 + 31, pz * 10 + 31) * warpAmp;
        const wz = pz + warpNoise.noise3D(px * 10 + 67, py * 10 + 67, pz * 10 + 67) * warpAmp;
        const n = blendNoise.noise3D(wx * 28, wy * 28, wz * 28) * 0.5 + 0.5; // 0..1

        if (n > 0.4 || secondScore <= 0) {
            r_rockType[r] = first;
        } else if (n > 0.1 || thirdScore <= 0) {
            r_rockType[r] = second;
        } else {
            r_rockType[r] = third;
        }
    }

    return { r_rockType };
}
