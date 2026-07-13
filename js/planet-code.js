// Planet code encode/decode — packs seed + slider values into a compact base36 string.
// Pure functions, no DOM access.

// Slider quantization tables
const SLIDERS = [
    { min: 5000,  step: 1000, count: 2556 }, // Detail (N)
    { min: 0,     step: 0.05, count: 21  }, // Irregularity (jitter)
    { min: 4,     step: 1,    count: 117 }, // Plates (P)
    { min: 1,     step: 1,    count: 10  }, // Continents
    { min: 0,     step: 0.01, count: 51  }, // Roughness
    { min: 0,     step: 0.05, count: 21  }, // Smoothing
    { min: 0,     step: 0.05, count: 21  }, // Glacial Erosion
    { min: 0,     step: 0.05, count: 21  }, // Hydraulic Erosion
    { min: 0,     step: 0.05, count: 21  }, // Thermal Erosion
    { min: 0,     step: 0.05, count: 21  }, // Ridge Sharpening
    { min: 0,     step: 0.05, count: 21  }, // Soil Creep
    { min: 0,     step: 0.05, count: 21  }, // Terrain Warp
    { min: 0,     step: 0.05, count: 21  }, // 12: Continent Size Variety
    { min: -15,   step: 1,    count: 31  }, // 13: Temperature
    { min: -1,    step: 0.1,  count: 21  }, // 14: Precipitation
    { min: 0,     step: 0.01, count: 101 }, // 15: Land Coverage
    { min: 0,     step: 0.5,  count: 91  }, // 16: Axial Tilt
    { min: 0.5,   step: 0.1,  count: 16  }, // 17: Rotation Rate
    { min: -1,    step: 0.1,  count: 21  }, // 18: Greenhouse
    { min: 0,     step: 0.1,  count: 21  }, // 19: Winter Severity
    { min: 0,     step: 0.1,  count: 21  }, // 20: Orographic Rain
    { min: 0,     step: 0.1,  count: 21  }, // 21: Maritime Influence
    { min: 0,     step: 0.1,  count: 21  }, // 22: Mountain Chill
];

// Mixed-radix bases (right-to-left): lapIdx, marIdx, oroIdx, wsIdx, ghIdx, rotIdx, tiltIdx, lcIdx, prcIdx, tmpIdx, csvIdx, twIdx, scIdx, rsIdx, teIdx, heIdx, glIdx, smIdx, nsIdx, cnIdx, pIdx, jIdx, nIdx, seed
const RADICES = [21, 21, 21, 21, 21, 16, 91, 101, 21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];
const SEED_MAX = 16777216; // 2^24
const BASE_LEN = 27; // base code length (no toggles)
const PREV6_LEN = 22; // previous 22-char codes (before SP4 climate controls)
const PREV5_LEN = 21; // previous 21-char codes (before land coverage)
const PREV4_LEN = 18; // previous 18-char codes (before continent variety/temp/precip)
const PREV3_LEN = 17; // previous 17-char codes (before terrain warp)
const PREV2_LEN = 16; // previous 16-char codes (before glacial erosion)
const PREV_LEN = 14; // previous 14-char codes (before ridge/creep)
const LEGACY_LEN = 13; // legacy 13-char codes (single erosion slider)
const IDX_CHARS = 2; // base36 chars per plate index (max index 119 = "3b")

// Legacy radices for decoding old 13-char codes (single erosion slider)
const LEGACY_RADICES = [21, 21, 51, 10, 117, 21, 2559];

// Previous-gen radices for decoding 14-char codes (two erosion sliders, no ridge/creep)
const PREV_RADICES = [21, 21, 21, 51, 10, 117, 21, 2559];

// Previous2-gen radices for decoding 16-char codes (no glacial erosion)
const PREV2_RADICES = [21, 21, 21, 21, 21, 51, 10, 117, 21, 2559];

// Previous3-gen radices for decoding 17-char codes (no terrain warp)
const PREV3_RADICES = [21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2559];

// Previous5-gen radices for decoding 21-char codes (before land coverage)
const PREV5_RADICES = [21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];

// Previous4-gen radices for decoding 18-char codes (before continent variety/temp/precip)
const PREV4_RADICES = [21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];

// Previous6-gen radices for decoding 22-char codes (before SP4 climate controls)
const PREV6_RADICES = [101, 21, 31, 21, 21, 21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2556];

function toIndex(value, slider) {
    return Math.round((value - slider.min) / slider.step);
}

function fromIndex(idx, slider) {
    // Round to step precision to avoid floating-point drift
    const raw = slider.min + idx * slider.step;
    const decimals = slider.step < 1 ? String(slider.step).split('.')[1].length : 0;
    return decimals > 0 ? parseFloat(raw.toFixed(decimals)) : raw;
}

/** Parse a base36 string into a BigInt (char-by-char for full precision). */
function parseBase36(str) {
    return [...str].reduce((acc, ch) => {
        const d = parseInt(ch, 36);
        if (isNaN(d)) throw new Error('bad char');
        return acc * 36n + BigInt(d);
    }, 0n);
}

// Decode format configs: one entry per code length.
// fields: [fieldName, SLIDERS_index] in LSB-first extraction order.
// defaults: field values not encoded in this format.
const DECODE_FORMATS = {
    [LEGACY_LEN]: {
        radices: LEGACY_RADICES,
        fields: [
            ['hydraulicErosion', 7], ['smoothing', 5], ['roughness', 4],
            ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, glacialErosion: 0, thermalErosion: 0.1,
                    ridgeSharpening: 0.35, soilCreep: 0.05, continentSizeVariety: 0,
                    temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3,
                    axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [PREV_LEN]: {
        radices: PREV_RADICES,
        fields: [
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['smoothing', 5], ['roughness', 4],
            ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, glacialErosion: 0, ridgeSharpening: 0.35,
                    soilCreep: 0.05, continentSizeVariety: 0,
                    temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3,
                    axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [PREV2_LEN]: {
        radices: PREV2_RADICES,
        fields: [
            ['soilCreep', 10], ['ridgeSharpening', 9], ['thermalErosion', 8], ['hydraulicErosion', 7],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, glacialErosion: 0, continentSizeVariety: 0,
                    temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3,
                    axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [PREV3_LEN]: {
        radices: PREV3_RADICES,
        fields: [
            ['soilCreep', 10], ['ridgeSharpening', 9], ['thermalErosion', 8], ['hydraulicErosion', 7],
            ['glacialErosion', 6], ['smoothing', 5], ['roughness', 4],
            ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { terrainWarp: 0.5, continentSizeVariety: 0,
                    temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3,
                    axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [PREV4_LEN]: {
        radices: PREV4_RADICES,
        fields: [
            ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { continentSizeVariety: 0, temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3,
                    axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [PREV5_LEN]: {
        radices: PREV5_RADICES,
        fields: [
            ['precipitationOffset', 14], ['temperatureOffset', 13], ['continentSizeVariety', 12],
            ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { landCoverage: 0.3,
                    axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [PREV6_LEN]: {
        radices: PREV6_RADICES,
        fields: [
            ['landCoverage', 15], ['precipitationOffset', 14], ['temperatureOffset', 13],
            ['continentSizeVariety', 12], ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: { axialTilt: 23.5, rotationRate: 1, greenhouse: 0, winterSeverity: 1,
                    orographicRain: 1, maritimeInfluence: 1, mountainChill: 1 }
    },
    [BASE_LEN]: {
        radices: RADICES,
        fields: [
            ['mountainChill', 22], ['maritimeInfluence', 21], ['orographicRain', 20],
            ['winterSeverity', 19], ['greenhouse', 18], ['rotationRate', 17], ['axialTilt', 16],
            ['landCoverage', 15], ['precipitationOffset', 14], ['temperatureOffset', 13],
            ['continentSizeVariety', 12], ['terrainWarp', 11], ['soilCreep', 10], ['ridgeSharpening', 9],
            ['thermalErosion', 8], ['hydraulicErosion', 7], ['glacialErosion', 6],
            ['smoothing', 5], ['roughness', 4], ['numContinents', 3], ['P', 2], ['jitter', 1], ['N', 0],
        ],
        defaults: {}
    },
};

/** Generic mixed-radix decode: extract fields LSB-first, validate, convert, apply defaults. */
function decodeFormat(packed, config, toggleStr) {
    const { radices, fields, defaults } = config;
    const result = {};
    for (let i = 0; i < radices.length; i++) {
        const [name, si] = fields[i];
        const idx = Number(packed % BigInt(radices[i]));
        packed = packed / BigInt(radices[i]);
        if (idx >= SLIDERS[si].count) return null;
        result[name] = fromIndex(idx, SLIDERS[si]);
    }
    result.seed = Number(packed);
    if (result.seed < 0 || result.seed >= SEED_MAX) return null;
    Object.assign(result, defaults);

    const toggledIndices = [];
    if (toggleStr) {
        for (let i = 0; i < toggleStr.length; i += IDX_CHARS) {
            const idx = parseInt(toggleStr.slice(i, i + IDX_CHARS), 36);
            if (isNaN(idx) || idx >= result.P) return null;
            toggledIndices.push(idx);
        }
    }
    result.toggledIndices = toggledIndices;
    return result;
}

/**
 * Encode planet parameters into a base36 planet code.
 * @param {number} seed - Integer seed 0–16777215
 * @param {number} N - Detail (5000–2560000, step 1000)
 * @param {number} jitter - Irregularity (0–1, step 0.05)
 * @param {number} P - Plates (4–120, step 1)
 * @param {number} numContinents - Continents (1–10, step 1)
 * @param {number} roughness - Roughness (0–0.5, step 0.01)
 * @param {number} terrainWarp - Terrain Warp (0–1, step 0.05)
 * @param {number} smoothing - Smoothing (0–1, step 0.05)
 * @param {number} glacialErosion - Glacial Erosion (0–1, step 0.05)
 * @param {number} hydraulicErosion - Hydraulic Erosion (0–1, step 0.05)
 * @param {number} thermalErosion - Thermal Erosion (0–1, step 0.05)
 * @param {number} ridgeSharpening - Ridge Sharpening (0–1, step 0.05)
 * @param {number} soilCreep - Soil Creep (0–1, step 0.05)
 * @param {number} continentSizeVariety - Continent Size Variety (0–1, step 0.05)
 * @param {number} temperatureOffset - Temperature offset (-15–15, step 1)
 * @param {number} precipitationOffset - Precipitation offset (-1–1, step 0.1)
 * @param {number} landCoverage - Land Coverage (0–1, step 0.05)
 * @param {number} [axialTilt=23.5] - Axial Tilt (0–45 degrees, step 0.5)
 * @param {number} [rotationRate=1] - Rotation Rate (0.5–2, step 0.1)
 * @param {number} [greenhouse=0] - Greenhouse (-1–1, step 0.1)
 * @param {number} [winterSeverity=1] - Winter Severity (0–2, step 0.1)
 * @param {number} [orographicRain=1] - Orographic Rain (0–2, step 0.1)
 * @param {number} [maritimeInfluence=1] - Maritime Influence (0–2, step 0.1)
 * @param {number} [mountainChill=1] - Mountain Chill (0–2, step 0.1)
 * @param {number[]} [toggledIndices=[]] - Sorted array of toggled plate indices
 * @returns {string} base36 code (27 chars without edits, 27 + '-' + 2*k with k edits)
 */
export function encodePlanetCode(seed, N, jitter, P, numContinents, roughness, terrainWarp, smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, soilCreep, continentSizeVariety, temperatureOffset, precipitationOffset, landCoverage, axialTilt = 23.5, rotationRate = 1, greenhouse = 0, winterSeverity = 1, orographicRain = 1, maritimeInfluence = 1, mountainChill = 1, toggledIndices = []) {
    const nIdx  = toIndex(N, SLIDERS[0]);
    const jIdx  = toIndex(jitter, SLIDERS[1]);
    const pIdx  = toIndex(P, SLIDERS[2]);
    const cnIdx = toIndex(numContinents, SLIDERS[3]);
    const nsIdx = toIndex(roughness, SLIDERS[4]);
    const smIdx = toIndex(smoothing, SLIDERS[5]);
    const glIdx = toIndex(glacialErosion, SLIDERS[6]);
    const heIdx = toIndex(hydraulicErosion, SLIDERS[7]);
    const teIdx = toIndex(thermalErosion, SLIDERS[8]);
    const rsIdx = toIndex(ridgeSharpening, SLIDERS[9]);
    const scIdx = toIndex(soilCreep, SLIDERS[10]);
    const twIdx = toIndex(terrainWarp, SLIDERS[11]);
    const csvIdx = toIndex(continentSizeVariety, SLIDERS[12]);
    const tmpIdx = toIndex(temperatureOffset, SLIDERS[13]);
    const prcIdx = toIndex(precipitationOffset, SLIDERS[14]);
    const lcIdx  = toIndex(landCoverage, SLIDERS[15]);
    const tiltIdx = toIndex(axialTilt, SLIDERS[16]);
    const rotIdx = toIndex(rotationRate, SLIDERS[17]);
    const ghIdx = toIndex(greenhouse, SLIDERS[18]);
    const wsIdx = toIndex(winterSeverity, SLIDERS[19]);
    const oroIdx = toIndex(orographicRain, SLIDERS[20]);
    const marIdx = toIndex(maritimeInfluence, SLIDERS[21]);
    const lapIdx = toIndex(mountainChill, SLIDERS[22]);

    // Mixed-radix packing (least-significant first: lapIdx, marIdx, oroIdx, wsIdx, ghIdx, rotIdx, tiltIdx, lcIdx, prcIdx, tmpIdx, csvIdx, twIdx, ...)
    let packed = BigInt(seed);
    packed = packed * BigInt(RADICES[22]) + BigInt(nIdx);    // * 2556
    packed = packed * BigInt(RADICES[21]) + BigInt(jIdx);    // * 21
    packed = packed * BigInt(RADICES[20]) + BigInt(pIdx);    // * 117
    packed = packed * BigInt(RADICES[19]) + BigInt(cnIdx);   // * 10
    packed = packed * BigInt(RADICES[18]) + BigInt(nsIdx);   // * 51
    packed = packed * BigInt(RADICES[17]) + BigInt(smIdx);   // * 21
    packed = packed * BigInt(RADICES[16]) + BigInt(glIdx);   // * 21
    packed = packed * BigInt(RADICES[15]) + BigInt(heIdx);   // * 21
    packed = packed * BigInt(RADICES[14]) + BigInt(teIdx);   // * 21
    packed = packed * BigInt(RADICES[13]) + BigInt(rsIdx);   // * 21
    packed = packed * BigInt(RADICES[12]) + BigInt(scIdx);   // * 21
    packed = packed * BigInt(RADICES[11]) + BigInt(twIdx);   // * 21
    packed = packed * BigInt(RADICES[10]) + BigInt(csvIdx);  // * 21
    packed = packed * BigInt(RADICES[9])  + BigInt(tmpIdx);  // * 31
    packed = packed * BigInt(RADICES[8])  + BigInt(prcIdx);  // * 21
    packed = packed * BigInt(RADICES[7])  + BigInt(lcIdx);   // * 101
    packed = packed * BigInt(RADICES[6])  + BigInt(tiltIdx); // * 91
    packed = packed * BigInt(RADICES[5])  + BigInt(rotIdx);  // * 16
    packed = packed * BigInt(RADICES[4])  + BigInt(ghIdx);   // * 21
    packed = packed * BigInt(RADICES[3])  + BigInt(wsIdx);   // * 21
    packed = packed * BigInt(RADICES[2])  + BigInt(oroIdx);  // * 21
    packed = packed * BigInt(RADICES[1])  + BigInt(marIdx);  // * 21
    packed = packed * BigInt(RADICES[0])  + BigInt(lapIdx);  // * 21

    let code = packed.toString(36).padStart(BASE_LEN, '0');

    // Append toggled plate indices: "-" + 2-char base36 per index
    if (toggledIndices.length > 0) {
        code += '-' + toggledIndices
            .map(i => i.toString(36).padStart(IDX_CHARS, '0'))
            .join('');
    }

    return code;
}

/**
 * Decode a base36 planet code back into planet parameters.
 * Supports 27-char (current), 22-char (prev6), 21-char (prev5), 18-char (prev4), 17-char (prev3), 16-char (prev2), 14-char (previous-gen), and 13-char (legacy) codes.
 * @param {string} code - base36 code (13, 14, 16, 17, 18, 21, 22, or 27 chars, optionally followed by "-" + toggle indices)
 * @returns {{ seed: number, N: number, jitter: number, P: number, numContinents: number, roughness: number, terrainWarp: number, smoothing: number, glacialErosion: number, hydraulicErosion: number, thermalErosion: number, ridgeSharpening: number, soilCreep: number, continentSizeVariety: number, temperatureOffset: number, precipitationOffset: number, landCoverage: number, axialTilt: number, rotationRate: number, greenhouse: number, winterSeverity: number, orographicRain: number, maritimeInfluence: number, mountainChill: number, toggledIndices: number[] } | null}
 */
export function decodePlanetCode(code) {
    if (typeof code !== 'string') return null;
    code = code.trim().toLowerCase();

    // Split base code from optional toggle suffix
    const dashIdx = code.indexOf('-');
    const base = dashIdx === -1 ? code : code.slice(0, dashIdx);
    const toggleStr = dashIdx === -1 ? '' : code.slice(dashIdx + 1);

    const config = DECODE_FORMATS[base.length];
    if (!config) return null;
    if (!/^[0-9a-z]+$/.test(base)) return null;
    if (toggleStr && !/^[0-9a-z]+$/.test(toggleStr)) return null;
    if (toggleStr && toggleStr.length % IDX_CHARS !== 0) return null;

    let packed;
    try {
        packed = parseBase36(base);
    } catch {
        return null;
    }

    return decodeFormat(packed, config, toggleStr);
}
