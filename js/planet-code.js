// Planet code encode/decode — packs seed + slider values into a compact base36 string.
// Pure functions, no DOM access.

// Slider quantization tables
const SLIDERS = [
    { min: 2000,  step: 1000, count: 2559 }, // Detail (N)
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
];

// Mixed-radix bases (right-to-left): scIdx, rsIdx, teIdx, heIdx, glIdx, smIdx, nsIdx, cnIdx, pIdx, jIdx, nIdx, seed
const RADICES = [21, 21, 21, 21, 21, 21, 51, 10, 117, 21, 2559];
const SEED_MAX = 16777216; // 2^24
const BASE_LEN = 17; // base code length (no toggles)
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

/**
 * Encode planet parameters into a base36 planet code.
 * @param {number} seed - Integer seed 0–16777215
 * @param {number} N - Detail (2000–2560000, step 1000)
 * @param {number} jitter - Irregularity (0–1, step 0.05)
 * @param {number} P - Plates (4–120, step 1)
 * @param {number} numContinents - Continents (1–10, step 1)
 * @param {number} roughness - Roughness (0–0.5, step 0.01)
 * @param {number} smoothing - Smoothing (0–1, step 0.05)
 * @param {number} glacialErosion - Glacial Erosion (0–1, step 0.05)
 * @param {number} hydraulicErosion - Hydraulic Erosion (0–1, step 0.05)
 * @param {number} thermalErosion - Thermal Erosion (0–1, step 0.05)
 * @param {number} ridgeSharpening - Ridge Sharpening (0–1, step 0.05)
 * @param {number} soilCreep - Soil Creep (0–1, step 0.05)
 * @param {number[]} [toggledIndices=[]] - Sorted array of toggled plate indices
 * @returns {string} base36 code (17 chars without edits, 17 + '-' + 2*k with k edits)
 */
export function encodePlanetCode(seed, N, jitter, P, numContinents, roughness, smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, soilCreep, toggledIndices = []) {
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

    // Mixed-radix packing (least-significant first: scIdx, rsIdx, teIdx, ...)
    let packed = BigInt(seed);
    packed = packed * BigInt(RADICES[10]) + BigInt(nIdx);   // * 2559
    packed = packed * BigInt(RADICES[9])  + BigInt(jIdx);   // * 21
    packed = packed * BigInt(RADICES[8])  + BigInt(pIdx);   // * 117
    packed = packed * BigInt(RADICES[7])  + BigInt(cnIdx);  // * 10
    packed = packed * BigInt(RADICES[6])  + BigInt(nsIdx);  // * 51
    packed = packed * BigInt(RADICES[5])  + BigInt(smIdx);  // * 21
    packed = packed * BigInt(RADICES[4])  + BigInt(glIdx);  // * 21
    packed = packed * BigInt(RADICES[3])  + BigInt(heIdx);  // * 21
    packed = packed * BigInt(RADICES[2])  + BigInt(teIdx);  // * 21
    packed = packed * BigInt(RADICES[1])  + BigInt(rsIdx);  // * 21
    packed = packed * BigInt(RADICES[0])  + BigInt(scIdx);  // * 21

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
 * Supports 17-char (current), 16-char (prev2), 14-char (previous-gen), and 13-char (legacy) codes.
 * @param {string} code - base36 code (13, 14, 16, or 17 chars, optionally followed by "-" + toggle indices)
 * @returns {{ seed: number, N: number, jitter: number, P: number, numContinents: number, roughness: number, smoothing: number, glacialErosion: number, hydraulicErosion: number, thermalErosion: number, ridgeSharpening: number, soilCreep: number, toggledIndices: number[] } | null}
 */
export function decodePlanetCode(code) {
    if (typeof code !== 'string') return null;
    code = code.trim().toLowerCase();

    // Split base code from optional toggle suffix
    const dashIdx = code.indexOf('-');
    const base = dashIdx === -1 ? code : code.slice(0, dashIdx);
    const toggleStr = dashIdx === -1 ? '' : code.slice(dashIdx + 1);

    const isLegacy = base.length === LEGACY_LEN;
    const isPrev = base.length === PREV_LEN;
    const isPrev2 = base.length === PREV2_LEN;
    const isNew = base.length === BASE_LEN;
    if (!isLegacy && !isPrev && !isPrev2 && !isNew) return null;
    if (!/^[0-9a-z]+$/.test(base)) return null;
    if (toggleStr && !/^[0-9a-z]+$/.test(toggleStr)) return null;
    if (toggleStr && toggleStr.length % IDX_CHARS !== 0) return null;

    let packed;
    try {
        packed = parseBase36(base);
    } catch {
        return null;
    }

    if (isLegacy) {
        // Legacy 13-char decode: single erosion slider
        const erIdx = Number(packed % BigInt(LEGACY_RADICES[0]));
        packed = packed / BigInt(LEGACY_RADICES[0]);

        const smIdx = Number(packed % BigInt(LEGACY_RADICES[1]));
        packed = packed / BigInt(LEGACY_RADICES[1]);

        const nsIdx = Number(packed % BigInt(LEGACY_RADICES[2]));
        packed = packed / BigInt(LEGACY_RADICES[2]);

        const cnIdx = Number(packed % BigInt(LEGACY_RADICES[3]));
        packed = packed / BigInt(LEGACY_RADICES[3]);

        const pIdx = Number(packed % BigInt(LEGACY_RADICES[4]));
        packed = packed / BigInt(LEGACY_RADICES[4]);

        const jIdx = Number(packed % BigInt(LEGACY_RADICES[5]));
        packed = packed / BigInt(LEGACY_RADICES[5]);

        const nIdx = Number(packed % BigInt(LEGACY_RADICES[6]));
        packed = packed / BigInt(LEGACY_RADICES[6]);

        const seed = Number(packed);

        if (seed < 0 || seed >= SEED_MAX) return null;
        if (nIdx >= SLIDERS[0].count || jIdx >= SLIDERS[1].count ||
            pIdx >= SLIDERS[2].count || cnIdx >= SLIDERS[3].count ||
            nsIdx >= SLIDERS[4].count || smIdx >= SLIDERS[5].count ||
            erIdx >= SLIDERS[7].count) return null;

        const P = fromIndex(pIdx, SLIDERS[2]);

        const toggledIndices = [];
        if (toggleStr) {
            for (let i = 0; i < toggleStr.length; i += IDX_CHARS) {
                const idx = parseInt(toggleStr.slice(i, i + IDX_CHARS), 36);
                if (isNaN(idx) || idx >= P) return null;
                toggledIndices.push(idx);
            }
        }

        return {
            seed,
            N:                fromIndex(nIdx, SLIDERS[0]),
            jitter:           fromIndex(jIdx, SLIDERS[1]),
            P,
            numContinents:    fromIndex(cnIdx, SLIDERS[3]),
            roughness:        fromIndex(nsIdx, SLIDERS[4]),
            smoothing:        fromIndex(smIdx, SLIDERS[5]),
            glacialErosion:   0,
            hydraulicErosion: fromIndex(erIdx, SLIDERS[7]), // map old erosion → hydraulic
            thermalErosion:   0.1,                          // default for legacy codes
            ridgeSharpening:  0.35,
            soilCreep:        0.05,
            toggledIndices,
        };
    }

    if (isPrev) {
        // Previous-gen 14-char decode: two erosion sliders, no ridge/creep/glacial
        const teIdx = Number(packed % BigInt(PREV_RADICES[0]));
        packed = packed / BigInt(PREV_RADICES[0]);

        const heIdx = Number(packed % BigInt(PREV_RADICES[1]));
        packed = packed / BigInt(PREV_RADICES[1]);

        const smIdx = Number(packed % BigInt(PREV_RADICES[2]));
        packed = packed / BigInt(PREV_RADICES[2]);

        const nsIdx = Number(packed % BigInt(PREV_RADICES[3]));
        packed = packed / BigInt(PREV_RADICES[3]);

        const cnIdx = Number(packed % BigInt(PREV_RADICES[4]));
        packed = packed / BigInt(PREV_RADICES[4]);

        const pIdx = Number(packed % BigInt(PREV_RADICES[5]));
        packed = packed / BigInt(PREV_RADICES[5]);

        const jIdx = Number(packed % BigInt(PREV_RADICES[6]));
        packed = packed / BigInt(PREV_RADICES[6]);

        const nIdx = Number(packed % BigInt(PREV_RADICES[7]));
        packed = packed / BigInt(PREV_RADICES[7]);

        const seed = Number(packed);

        if (seed < 0 || seed >= SEED_MAX) return null;
        if (nIdx >= SLIDERS[0].count || jIdx >= SLIDERS[1].count ||
            pIdx >= SLIDERS[2].count || cnIdx >= SLIDERS[3].count ||
            nsIdx >= SLIDERS[4].count || smIdx >= SLIDERS[5].count ||
            heIdx >= SLIDERS[7].count || teIdx >= SLIDERS[8].count) return null;

        const P = fromIndex(pIdx, SLIDERS[2]);

        const toggledIndices = [];
        if (toggleStr) {
            for (let i = 0; i < toggleStr.length; i += IDX_CHARS) {
                const idx = parseInt(toggleStr.slice(i, i + IDX_CHARS), 36);
                if (isNaN(idx) || idx >= P) return null;
                toggledIndices.push(idx);
            }
        }

        return {
            seed,
            N:                fromIndex(nIdx, SLIDERS[0]),
            jitter:           fromIndex(jIdx, SLIDERS[1]),
            P,
            numContinents:    fromIndex(cnIdx, SLIDERS[3]),
            roughness:        fromIndex(nsIdx, SLIDERS[4]),
            smoothing:        fromIndex(smIdx, SLIDERS[5]),
            glacialErosion:   0,
            hydraulicErosion: fromIndex(heIdx, SLIDERS[7]),
            thermalErosion:   fromIndex(teIdx, SLIDERS[8]),
            ridgeSharpening:  0.35,
            soilCreep:        0.05,
            toggledIndices,
        };
    }

    if (isPrev2) {
        // Previous2-gen 16-char decode: all sliders except glacial erosion
        const scIdx = Number(packed % BigInt(PREV2_RADICES[0]));
        packed = packed / BigInt(PREV2_RADICES[0]);

        const rsIdx = Number(packed % BigInt(PREV2_RADICES[1]));
        packed = packed / BigInt(PREV2_RADICES[1]);

        const teIdx = Number(packed % BigInt(PREV2_RADICES[2]));
        packed = packed / BigInt(PREV2_RADICES[2]);

        const heIdx = Number(packed % BigInt(PREV2_RADICES[3]));
        packed = packed / BigInt(PREV2_RADICES[3]);

        const smIdx = Number(packed % BigInt(PREV2_RADICES[4]));
        packed = packed / BigInt(PREV2_RADICES[4]);

        const nsIdx = Number(packed % BigInt(PREV2_RADICES[5]));
        packed = packed / BigInt(PREV2_RADICES[5]);

        const cnIdx = Number(packed % BigInt(PREV2_RADICES[6]));
        packed = packed / BigInt(PREV2_RADICES[6]);

        const pIdx = Number(packed % BigInt(PREV2_RADICES[7]));
        packed = packed / BigInt(PREV2_RADICES[7]);

        const jIdx = Number(packed % BigInt(PREV2_RADICES[8]));
        packed = packed / BigInt(PREV2_RADICES[8]);

        const nIdx = Number(packed % BigInt(PREV2_RADICES[9]));
        packed = packed / BigInt(PREV2_RADICES[9]);

        const seed = Number(packed);

        if (seed < 0 || seed >= SEED_MAX) return null;
        if (nIdx >= SLIDERS[0].count || jIdx >= SLIDERS[1].count ||
            pIdx >= SLIDERS[2].count || cnIdx >= SLIDERS[3].count ||
            nsIdx >= SLIDERS[4].count || smIdx >= SLIDERS[5].count ||
            heIdx >= SLIDERS[7].count || teIdx >= SLIDERS[8].count ||
            rsIdx >= SLIDERS[9].count || scIdx >= SLIDERS[10].count) return null;

        const P = fromIndex(pIdx, SLIDERS[2]);

        const toggledIndices = [];
        if (toggleStr) {
            for (let i = 0; i < toggleStr.length; i += IDX_CHARS) {
                const idx = parseInt(toggleStr.slice(i, i + IDX_CHARS), 36);
                if (isNaN(idx) || idx >= P) return null;
                toggledIndices.push(idx);
            }
        }

        return {
            seed,
            N:                fromIndex(nIdx, SLIDERS[0]),
            jitter:           fromIndex(jIdx, SLIDERS[1]),
            P,
            numContinents:    fromIndex(cnIdx, SLIDERS[3]),
            roughness:        fromIndex(nsIdx, SLIDERS[4]),
            smoothing:        fromIndex(smIdx, SLIDERS[5]),
            glacialErosion:   0,
            hydraulicErosion: fromIndex(heIdx, SLIDERS[7]),
            thermalErosion:   fromIndex(teIdx, SLIDERS[8]),
            ridgeSharpening:  fromIndex(rsIdx, SLIDERS[9]),
            soilCreep:        fromIndex(scIdx, SLIDERS[10]),
            toggledIndices,
        };
    }

    // New 17-char decode: all sliders including glacial erosion
    const scIdx = Number(packed % BigInt(RADICES[0]));
    packed = packed / BigInt(RADICES[0]);

    const rsIdx = Number(packed % BigInt(RADICES[1]));
    packed = packed / BigInt(RADICES[1]);

    const teIdx = Number(packed % BigInt(RADICES[2]));
    packed = packed / BigInt(RADICES[2]);

    const heIdx = Number(packed % BigInt(RADICES[3]));
    packed = packed / BigInt(RADICES[3]);

    const glIdx = Number(packed % BigInt(RADICES[4]));
    packed = packed / BigInt(RADICES[4]);

    const smIdx = Number(packed % BigInt(RADICES[5]));
    packed = packed / BigInt(RADICES[5]);

    const nsIdx = Number(packed % BigInt(RADICES[6]));
    packed = packed / BigInt(RADICES[6]);

    const cnIdx = Number(packed % BigInt(RADICES[7]));
    packed = packed / BigInt(RADICES[7]);

    const pIdx = Number(packed % BigInt(RADICES[8]));
    packed = packed / BigInt(RADICES[8]);

    const jIdx = Number(packed % BigInt(RADICES[9]));
    packed = packed / BigInt(RADICES[9]);

    const nIdx = Number(packed % BigInt(RADICES[10]));
    packed = packed / BigInt(RADICES[10]);

    const seed = Number(packed);

    // Validate ranges
    if (seed < 0 || seed >= SEED_MAX) return null;
    if (nIdx >= SLIDERS[0].count || jIdx >= SLIDERS[1].count ||
        pIdx >= SLIDERS[2].count || cnIdx >= SLIDERS[3].count ||
        nsIdx >= SLIDERS[4].count || smIdx >= SLIDERS[5].count ||
        glIdx >= SLIDERS[6].count || heIdx >= SLIDERS[7].count ||
        teIdx >= SLIDERS[8].count || rsIdx >= SLIDERS[9].count ||
        scIdx >= SLIDERS[10].count) return null;

    const P = fromIndex(pIdx, SLIDERS[2]);

    // Decode toggled plate indices
    const toggledIndices = [];
    if (toggleStr) {
        for (let i = 0; i < toggleStr.length; i += IDX_CHARS) {
            const idx = parseInt(toggleStr.slice(i, i + IDX_CHARS), 36);
            if (isNaN(idx) || idx >= P) return null;
            toggledIndices.push(idx);
        }
    }

    return {
        seed,
        N:                fromIndex(nIdx, SLIDERS[0]),
        jitter:           fromIndex(jIdx, SLIDERS[1]),
        P,
        numContinents:    fromIndex(cnIdx, SLIDERS[3]),
        roughness:        fromIndex(nsIdx, SLIDERS[4]),
        smoothing:        fromIndex(smIdx, SLIDERS[5]),
        glacialErosion:   fromIndex(glIdx, SLIDERS[6]),
        hydraulicErosion: fromIndex(heIdx, SLIDERS[7]),
        thermalErosion:   fromIndex(teIdx, SLIDERS[8]),
        ridgeSharpening:  fromIndex(rsIdx, SLIDERS[9]),
        soilCreep:        fromIndex(scIdx, SLIDERS[10]),
        toggledIndices,
    };
}
