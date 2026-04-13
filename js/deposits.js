// Mineral deposit placement based on rock types, tectonic setting, erosion, and climate.
// Each region gets a bitmask of all deposits present. Visualization shows the
// highest-priority deposit per region.
//
// References:
//   Madeline James — "Deposits and Gemology Extended"
//   Artifexian — mineral deposit mapping methodology

import { ROCK_TYPES } from './geology.js';
import { SimplexNoise } from './simplex-noise.js';

// ── Deposit Bitmask ──
export const DEPOSIT = {
    NATIVE_COPPER:   1 << 0,
    PLACER_GOLD:     1 << 1,
    GOSSANS:         1 << 2,
    TIN:             1 << 3,
    VMS_COPPER_ZINC: 1 << 4,
    SKARN:           1 << 5,
    PORPHYRY_COPPER: 1 << 6,
    SEDEX_LEAD_ZINC: 1 << 7,
    MVT_LEAD_ZINC:   1 << 8,
    BOG_IRON:        1 << 9,
    LATERITE_IRON:   1 << 10,
    BIF_IRON:        1 << 11,
    DIAMOND:         1 << 12,
    PEGMATITE_GEMS:  1 << 13,
    EPITHERMAL_GOLD: 1 << 14,
};

// ── Deposit Metadata ──
// Each deposit has an era (copper/bronze/iron) and display priority (higher index = rarer = shown on top).
export const DEPOSIT_INFO = [
    // — Copper Age: surface/weathering deposits —
    { bit: DEPOSIT.NATIVE_COPPER,   name: 'Native Copper',     era: 'copper', color: [0.72, 0.45, 0.22], description: 'Surface copper from weathered basaltic rock' },
    { bit: DEPOSIT.GOSSANS,         name: 'Gossans',           era: 'copper', color: [0.70, 0.50, 0.18], description: 'Oxidized sulfide caps — copper, gold, silver' },
    { bit: DEPOSIT.PLACER_GOLD,     name: 'Placer Gold',       era: 'copper', color: [0.85, 0.75, 0.22], description: 'Alluvial gold downstream of eroded highlands' },
    // — Bronze Age: alloy metals & advanced smelting —
    { bit: DEPOSIT.TIN,             name: 'Tin (Cassiterite)', era: 'bronze', color: [0.60, 0.58, 0.55], description: 'Granitic intrusions — essential for bronze' },
    { bit: DEPOSIT.VMS_COPPER_ZINC, name: 'VMS Cu-Zn',         era: 'bronze', color: [0.65, 0.38, 0.22], description: 'Volcanogenic massive sulfide — rifts and arcs' },
    { bit: DEPOSIT.SKARN,           name: 'Skarn',             era: 'bronze', color: [0.50, 0.48, 0.28], description: 'Contact metamorphic — carbonate meets igneous' },
    { bit: DEPOSIT.PORPHYRY_COPPER, name: 'Porphyry Cu-Mo',   era: 'bronze', color: [0.58, 0.42, 0.35], description: 'Large tonnage copper at subduction zones' },
    { bit: DEPOSIT.SEDEX_LEAD_ZINC, name: 'SEDEX Pb-Zn',      era: 'bronze', color: [0.48, 0.48, 0.55], description: 'Sediment-hosted lead-zinc in rift basins' },
    { bit: DEPOSIT.MVT_LEAD_ZINC,   name: 'MVT Pb-Zn',        era: 'bronze', color: [0.52, 0.50, 0.48], description: 'Mississippi Valley lead-zinc in carbonate' },
    { bit: DEPOSIT.EPITHERMAL_GOLD, name: 'Epithermal Au-Ag',  era: 'bronze', color: [0.82, 0.68, 0.30], description: 'Shallow vein gold-silver near volcanoes' },
    { bit: DEPOSIT.PEGMATITE_GEMS,  name: 'Pegmatite Gems',    era: 'bronze', color: [0.65, 0.52, 0.72], description: 'Rare gems and lithium in granitic pegmatites' },
    { bit: DEPOSIT.DIAMOND,         name: 'Diamond',           era: 'bronze', color: [0.80, 0.85, 0.92], description: 'Kimberlite pipes in Archean cratons' },
    // — Iron Age: iron sources —
    { bit: DEPOSIT.BOG_IRON,        name: 'Bog Iron',          era: 'iron', color: [0.50, 0.38, 0.25], description: 'Wetland iron precipitate — easy to smelt' },
    { bit: DEPOSIT.LATERITE_IRON,   name: 'Laterite Iron',     era: 'iron', color: [0.62, 0.32, 0.20], description: 'Tropical weathering residual iron' },
    { bit: DEPOSIT.BIF_IRON,        name: 'Banded Iron (BIF)', era: 'iron', color: [0.55, 0.28, 0.28], description: 'Ancient marine iron in craton shields' },
];

// Era bitmasks: combine all deposit bits belonging to each era
export const ERA_MASK = {
    copper: DEPOSIT.NATIVE_COPPER | DEPOSIT.GOSSANS | DEPOSIT.PLACER_GOLD,
    bronze: DEPOSIT.TIN | DEPOSIT.VMS_COPPER_ZINC | DEPOSIT.SKARN | DEPOSIT.PORPHYRY_COPPER |
            DEPOSIT.SEDEX_LEAD_ZINC | DEPOSIT.MVT_LEAD_ZINC | DEPOSIT.EPITHERMAL_GOLD |
            DEPOSIT.PEGMATITE_GEMS | DEPOSIT.DIAMOND,
    iron:   DEPOSIT.BOG_IRON | DEPOSIT.LATERITE_IRON | DEPOSIT.BIF_IRON,
};

// Era display info for legends
export const ERA_INFO = {
    copper: { label: 'Copper Age', deposits: DEPOSIT_INFO.filter(d => d.era === 'copper') },
    bronze: { label: 'Bronze Age', deposits: DEPOSIT_INFO.filter(d => d.era === 'bronze') },
    iron:   { label: 'Iron Age',   deposits: DEPOSIT_INFO.filter(d => d.era === 'iron') },
};

// ── Helper: check if a neighbor has a given rock type ──
function hasNeighborRockType(mesh, r_rockType, region, targetType) {
    const off = mesh.adjOffset[region];
    const end = mesh.adjOffset[region + 1];
    for (let i = off; i < end; i++) {
        if (r_rockType[mesh.adjList[i]] === targetType) return true;
    }
    return false;
}

// ── Helper: check if any neighbor has high oroGrade ──
function hasNeighborOrogen(mesh, r_stress, dl_foldRidge, dl_orogenicPower, region, threshold) {
    const off = mesh.adjOffset[region];
    const end = mesh.adjOffset[region + 1];
    for (let i = off; i < end; i++) {
        const nb = mesh.adjList[i];
        const grade = r_stress[nb]
            + (dl_foldRidge ? Math.max(0, dl_foldRidge[nb]) * 2.0 : 0)
            + (dl_orogenicPower ? Math.max(0, dl_orogenicPower[nb]) * 1.5 : 0);
        if (grade > threshold) return true;
    }
    return false;
}

// ── Main Classification ──
export function assignDeposits(
    mesh, r_xyz, r_elevation, r_rockType, r_plate, plateIsOcean,
    r_boundaryType, r_stress, r_basinFactor,
    dl_hotspot, dl_lip, dl_erosionDelta, dl_coastal,
    dl_foldRidge, dl_orogenicPower, dl_backArc,
    koppenArr, noise, seed
) {
    const N = mesh.numRegions;
    const r_deposits = new Uint32Array(N);
    const depositNoise = new SimplexNoise(seed + 5501);

    for (let r = 0; r < N; r++) {
        const elev    = r_elevation[r];
        if (elev <= 0) continue;  // no deposits on ocean floor

        const rock    = r_rockType[r];
        if (rock === ROCK_TYPES.OCEAN) continue;

        const stress  = r_stress[r];
        const bType   = r_boundaryType ? r_boundaryType[r] : 0;
        const basin   = r_basinFactor ? r_basinFactor[r] : 0.5;
        const hotspot = dl_hotspot ? dl_hotspot[r] : 0;
        const lip     = dl_lip ? dl_lip[r] : 0;
        const erosion = dl_erosionDelta ? dl_erosionDelta[r] : 0;
        const coastal = dl_coastal ? dl_coastal[r] : 0;
        const foldRidge = dl_foldRidge ? dl_foldRidge[r] : 0;
        const orogPower = dl_orogenicPower ? dl_orogenicPower[r] : 0;
        const backArc = dl_backArc ? dl_backArc[r] : 0;
        const kId     = koppenArr ? koppenArr[r] : -1;
        const hasOcean = mesh.numRegions > 0 ? (plateIsOcean.has ? plateIsOcean.has(r_plate[r]) : false) : false;

        const oroGrade = stress + Math.max(0, foldRidge) * 2.0 + Math.max(0, orogPower) * 1.5;
        const isErosional = erosion < -0.003 || elev > 0.35;
        const isDepositional = erosion > 0.002 || basin > 0.6;

        // Spatial noise for deposit scatter (prevents uniform distribution)
        const px = r_xyz[r * 3], py = r_xyz[r * 3 + 1], pz = r_xyz[r * 3 + 2];
        const n1 = depositNoise.noise3D(px * 8, py * 8, pz * 8);
        const n2 = depositNoise.noise3D(px * 14 + 100, py * 14 + 100, pz * 14 + 100);

        // Climate helpers
        const isTropical = kId >= 1 && kId <= 3;
        const isTemperate = kId >= 8 && kId <= 16;
        const isBoreal = kId >= 17 && kId <= 28;
        const isArid = kId >= 4 && kId <= 7;

        // ════════════════════════════════════════
        //  SURFACE / WEATHERING DEPOSITS
        // ════════════════════════════════════════

        // Native Copper: weathered basaltic/LIP rock exposed by erosion
        if (rock === ROCK_TYPES.BASALTIC && isErosional && n1 > 0.0) {
            r_deposits[r] |= DEPOSIT.NATIVE_COPPER;
        }

        // Gossans: oxidized tops of buried sulfide deposits at eroded orogens
        if (oroGrade > 0.5 && erosion < -0.008 && n1 > -0.1) {
            r_deposits[r] |= DEPOSIT.GOSSANS;
        }

        // Placer Gold: alluvial gold deposited downstream of eroded mountain ranges
        // Look for depositional regions adjacent to orogenic belts
        if (isDepositional && elev < 0.15 && n2 > 0.05) {
            if (oroGrade > 0.3 || hasNeighborOrogen(mesh, r_stress, dl_foldRidge, dl_orogenicPower, r, 0.4)) {
                r_deposits[r] |= DEPOSIT.PLACER_GOLD;
            }
        }

        // Laterite Iron: intense tropical weathering of hydrothermal deposits
        if (isTropical && isErosional && elev < 0.20 && n1 > -0.2) {
            r_deposits[r] |= DEPOSIT.LATERITE_IRON;
        }

        // Bog Iron: chemical precipitation in wetlands
        if ((isTemperate || isBoreal) && isDepositional && elev < 0.06 && n2 > -0.1) {
            r_deposits[r] |= DEPOSIT.BOG_IRON;
        }

        // ════════════════════════════════════════
        //  VOLCANIC / MAGMATIC DEPOSITS
        // ════════════════════════════════════════

        // Epithermal Gold-Silver: shallow veins near subduction volcanoes
        if ((rock === ROCK_TYPES.ANDESITIC || rock === ROCK_TYPES.GRANITIC) &&
            bType === 1 && stress > 0.15 && n1 > 0.1) {
            r_deposits[r] |= DEPOSIT.EPITHERMAL_GOLD;
        }

        // Porphyry Copper: large tonnage Cu-Mo in felsic/intermediate intrusions at subduction
        // These are mountain deposits — require significant stress and elevation
        if ((rock === ROCK_TYPES.GRANITIC || rock === ROCK_TYPES.ANDESITIC) &&
            bType === 1 && stress > 0.25 && elev > 0.08 && n2 > 0.0) {
            r_deposits[r] |= DEPOSIT.PORPHYRY_COPPER;
        }

        // VMS Copper-Zinc: ancient submarine volcanic sulfides uplifted onto continents
        // Only accessible where uplift/orogeny has brought them to the surface —
        // requires mountains or orogenic belts, not lowland rifts
        if ((bType === 1 || (backArc < -0.02 && stress > 0.15)) &&
            elev > 0.08 && oroGrade > 0.2 && n1 > -0.1) {
            r_deposits[r] |= DEPOSIT.VMS_COPPER_ZINC;
        }

        // ════════════════════════════════════════
        //  INTRUSIVE / DEEP DEPOSITS
        // ════════════════════════════════════════

        // Tin (Cassiterite): exclusively in highly evolved granitic magmas, exposed by erosion
        if (rock === ROCK_TYPES.GRANITIC && isErosional && n2 > 0.15) {
            r_deposits[r] |= DEPOSIT.TIN;
        }

        // Pegmatite Gems: deep granitic intrusions with rare elements
        if (rock === ROCK_TYPES.GRANITIC && isErosional && n1 > 0.4 && n2 > 0.2) {
            r_deposits[r] |= DEPOSIT.PEGMATITE_GEMS;
        }

        // Skarn: contact metamorphism where magma intrudes carbonate
        // Requires some stress or elevation — flat basin carbonate doesn't have
        // exposed igneous contacts, only uplifted/deformed margins do
        if (rock === ROCK_TYPES.CARBONATE && (stress > 0.08 || elev > 0.10) && n2 > -0.1) {
            if (hasNeighborRockType(mesh, r_rockType, r, ROCK_TYPES.GRANITIC) ||
                hasNeighborRockType(mesh, r_rockType, r, ROCK_TYPES.ANDESITIC)) {
                r_deposits[r] |= DEPOSIT.SKARN;
            }
        }

        // ════════════════════════════════════════
        //  SEDIMENTARY DEPOSITS
        // ════════════════════════════════════════

        // SEDEX Lead-Zinc: sediment-hosted in fault-bounded rift basins
        if (rock === ROCK_TYPES.SEDIMENTS && (bType === 2 || basin > 0.6) && n1 > 0.0) {
            r_deposits[r] |= DEPOSIT.SEDEX_LEAD_ZINC;
        }

        // MVT Lead-Zinc: hydrothermal fluids through carbonate at basin margins
        if (rock === ROCK_TYPES.CARBONATE && basin > 0.25 && basin < 0.65 && n2 > 0.0) {
            r_deposits[r] |= DEPOSIT.MVT_LEAD_ZINC;
        }

        // BIF Iron: ancient marine iron in Archean craton shields
        if (rock === ROCK_TYPES.METAMORPHIC && basin < 0.20 && stress < 0.05 && n1 > -0.3) {
            r_deposits[r] |= DEPOSIT.BIF_IRON;
        }

        // ════════════════════════════════════════
        //  ULTRA-RARE
        // ════════════════════════════════════════

        // Diamond (Kimberlite pipes): exclusively in deep Archean cratons
        if ((rock === ROCK_TYPES.METAMORPHIC || rock === ROCK_TYPES.GRANITIC) &&
            basin < 0.12 && stress < 0.03 && n1 > 0.6 && n2 > 0.5) {
            r_deposits[r] |= DEPOSIT.DIAMOND;
        }
    }

    // ── Per-metal richness with individual noise functions ──
    // Each metal gets its own noise so deposit patterns are independent.
    // Noise is sparse: only regions above threshold show any richness.

    // Metal channels per era.
    // Carry-forward rules: only 1 age back, unless no newer source exists.
    // New sources contribute 3× more than inherited.
    const METAL_CHANNELS = {
        // ── Copper Age: native/surface sources only ──
        copperCu:   { sources: [
            { bits: DEPOSIT.NATIVE_COPPER, weight: 1.0 },
        ], thresh: 0.38 },
        copperAu:   { sources: [
            { bits: DEPOSIT.PLACER_GOLD | DEPOSIT.GOSSANS, weight: 1.0 },
        ], thresh: 0.65 },

        // ── Bronze Age: carry Copper (1 age back) + new at 3× ──
        // Gold: new source (epithermal) exists → Copper Age gold does NOT carry
        bronzeCu:   { sources: [
            { bits: DEPOSIT.NATIVE_COPPER, weight: 1.0 },                              // carried from Copper
            { bits: DEPOSIT.VMS_COPPER_ZINC | DEPOSIT.SKARN | DEPOSIT.PORPHYRY_COPPER, weight: 3.0 }, // new
        ], thresh: 0.38 },
        bronzeAu:   { sources: [
            { bits: DEPOSIT.EPITHERMAL_GOLD, weight: 1.0 },                            // new (supersedes Copper Age gold)
        ], thresh: 0.65 },
        bronzeSn:   { sources: [
            { bits: DEPOSIT.TIN, weight: 1.0 },                                        // new
        ], thresh: 0.72 },
        bronzePbZn: { sources: [
            { bits: DEPOSIT.SEDEX_LEAD_ZINC | DEPOSIT.MVT_LEAD_ZINC, weight: 1.0 },   // new
        ], thresh: 0.3 },
        bronzeGems: { sources: [
            { bits: DEPOSIT.PEGMATITE_GEMS | DEPOSIT.DIAMOND, weight: 1.0 },           // new
        ], thresh: 0.7 },

        // ── Iron Age: carry Bronze (1 age back) only, NOT Copper (2 ages back) ──
        // Copper: native copper drops off (2 ages back), only Bronze sources carry
        // Gold: epithermal carries (1 age back, no new Iron Age gold source)
        // Tin/PbZn/Gems: carry from Bronze (no new sources)
        ironCu:     { sources: [
            { bits: DEPOSIT.VMS_COPPER_ZINC | DEPOSIT.SKARN | DEPOSIT.PORPHYRY_COPPER, weight: 1.0 }, // carried from Bronze
        ], thresh: 0.38 },
        ironAu:     { sources: [
            { bits: DEPOSIT.EPITHERMAL_GOLD, weight: 1.0 },                            // carried from Bronze (no new source)
        ], thresh: 0.65 },
        ironSn:     { sources: [
            { bits: DEPOSIT.TIN, weight: 1.0 },                                        // carried from Bronze
        ], thresh: 0.72 },
        ironPbZn:   { sources: [
            { bits: DEPOSIT.SEDEX_LEAD_ZINC | DEPOSIT.MVT_LEAD_ZINC, weight: 1.0 },   // carried from Bronze
        ], thresh: 0.3 },
        ironGems:   { sources: [
            { bits: DEPOSIT.PEGMATITE_GEMS | DEPOSIT.DIAMOND, weight: 1.0 },           // carried from Bronze
        ], thresh: 0.7 },
        ironFe:     { sources: [
            { bits: DEPOSIT.BOG_IRON | DEPOSIT.LATERITE_IRON | DEPOSIT.BIF_IRON, weight: 1.0 }, // new
        ], thresh: 0.2 },
    };

    const richArrays = {};
    const noisePerMetal = {};
    let noiseSeed = seed + 5600;
    for (const key of Object.keys(METAL_CHANNELS)) {
        richArrays[key] = new Float32Array(N);
        noisePerMetal[key] = new SimplexNoise(noiseSeed++);
    }

    for (let r = 0; r < N; r++) {
        const mask = r_deposits[r];
        if (mask === 0) continue;
        const px = r_xyz[r * 3], py = r_xyz[r * 3 + 1], pz = r_xyz[r * 3 + 2];

        for (const key of Object.keys(METAL_CHANNELS)) {
            const ch = METAL_CHANNELS[key];

            // Sum weighted contributions from all source groups
            let weightedScore = 0;
            for (const src of ch.sources) {
                const overlap = mask & src.bits;
                if (overlap === 0) continue;
                let count = 0;
                let tmp = overlap;
                while (tmp) { count++; tmp &= (tmp - 1); }
                weightedScore += count * src.weight;
            }
            if (weightedScore <= 0) continue;

            // Per-metal noise with per-channel sparsity threshold
            const thr = ch.thresh;
            const n = noisePerMetal[key].noise3D(px * 18, py * 18, pz * 18) * 0.5 + 0.5;
            if (n < thr) continue;

            const intensity = Math.min(1.0, weightedScore * 0.3) * ((n - thr) / (1.0 - thr));
            richArrays[key][r] = intensity;
        }
    }

    return { r_deposits, richArrays };
}

// ── Metal channel display info (for legend + dropdown labels) ──
export const METAL_CHANNEL_INFO = {
    copperCu:   { label: 'Copper',    era: 'Copper Age', color: [0.92, 0.62, 0.28] },
    copperAu:   { label: 'Gold',      era: 'Copper Age', color: [1.00, 0.88, 0.30] },
    bronzeCu:   { label: 'Copper',    era: 'Bronze Age', color: [0.92, 0.62, 0.28] },
    bronzeAu:   { label: 'Gold',      era: 'Bronze Age', color: [1.00, 0.88, 0.30] },
    bronzeSn:   { label: 'Tin',       era: 'Bronze Age', color: [0.78, 0.76, 0.70] },
    bronzePbZn: { label: 'Lead-Zinc', era: 'Bronze Age', color: [0.65, 0.65, 0.80] },
    bronzeGems: { label: 'Gems',      era: 'Bronze Age', color: [0.82, 0.65, 0.95] },
    ironCu:     { label: 'Copper',    era: 'Iron Age',   color: [0.92, 0.62, 0.28] },
    ironAu:     { label: 'Gold',      era: 'Iron Age',   color: [1.00, 0.88, 0.30] },
    ironSn:     { label: 'Tin',       era: 'Iron Age',   color: [0.78, 0.76, 0.70] },
    ironPbZn:   { label: 'Lead-Zinc', era: 'Iron Age',   color: [0.65, 0.65, 0.80] },
    ironGems:   { label: 'Gems',      era: 'Iron Age',   color: [0.82, 0.65, 0.95] },
    ironFe:     { label: 'Iron',      era: 'Iron Age',   color: [0.90, 0.42, 0.30] },
};

// ── Visualization ──

const OCEAN_COLOR = [0.08, 0.12, 0.22];
const LAND_BASE = [0.04, 0.04, 0.04]; // near-black land baseline

export function depositRichnessColor(richness, elevation, rampColor) {
    if (elevation <= 0) return OCEAN_COLOR;
    if (richness <= 0) return LAND_BASE;
    const t = Math.min(1, richness);
    return [
        LAND_BASE[0] + t * (rampColor[0] - LAND_BASE[0]),
        LAND_BASE[1] + t * (rampColor[1] - LAND_BASE[1]),
        LAND_BASE[2] + t * (rampColor[2] - LAND_BASE[2]),
    ];
}

// List all deposit names present in a bitmask
export function listDeposits(mask) {
    const names = [];
    for (const info of DEPOSIT_INFO) {
        if (mask & info.bit) names.push(info.name);
    }
    return names;
}
