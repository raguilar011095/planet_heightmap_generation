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
    { min: 0,     step: 0.05, count: 21  }, // Erosion
];

// Mixed-radix bases (right-to-left): erIdx, smIdx, nsIdx, cnIdx, pIdx, jIdx, nIdx, seed
const RADICES = [21, 21, 51, 10, 117, 21, 2559];
const SEED_MAX = 16777216; // 2^24
const BASE_LEN = 13; // base code length (no toggles)
const IDX_CHARS = 2; // base36 chars per plate index (max index 119 = "3b")

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
 * @param {number} erosion - Erosion (0–1, step 0.05)
 * @param {number[]} [toggledIndices=[]] - Sorted array of toggled plate indices
 * @returns {string} base36 code (13 chars without edits, 13 + '-' + 2*k with k edits)
 */
export function encodePlanetCode(seed, N, jitter, P, numContinents, roughness, smoothing, erosion, toggledIndices = []) {
    const nIdx  = toIndex(N, SLIDERS[0]);
    const jIdx  = toIndex(jitter, SLIDERS[1]);
    const pIdx  = toIndex(P, SLIDERS[2]);
    const cnIdx = toIndex(numContinents, SLIDERS[3]);
    const nsIdx = toIndex(roughness, SLIDERS[4]);
    const smIdx = toIndex(smoothing, SLIDERS[5]);
    const erIdx = toIndex(erosion, SLIDERS[6]);

    // Mixed-radix packing (least-significant first: erIdx, smIdx)
    let packed = BigInt(seed);
    packed = packed * BigInt(RADICES[6]) + BigInt(nIdx);   // * 2559
    packed = packed * BigInt(RADICES[5]) + BigInt(jIdx);   // * 21
    packed = packed * BigInt(RADICES[4]) + BigInt(pIdx);   // * 117
    packed = packed * BigInt(RADICES[3]) + BigInt(cnIdx);  // * 10
    packed = packed * BigInt(RADICES[2]) + BigInt(nsIdx);  // * 51
    packed = packed * BigInt(RADICES[1]) + BigInt(smIdx);  // * 21
    packed = packed * BigInt(RADICES[0]) + BigInt(erIdx);  // * 21

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
 * @param {string} code - base36 code (13 chars, optionally followed by "-" + toggle indices)
 * @returns {{ seed: number, N: number, jitter: number, P: number, numContinents: number, roughness: number, smoothing: number, erosion: number, toggledIndices: number[] } | null}
 */
export function decodePlanetCode(code) {
    if (typeof code !== 'string') return null;
    code = code.trim().toLowerCase();

    // Split base code from optional toggle suffix
    const dashIdx = code.indexOf('-');
    const base = dashIdx === -1 ? code : code.slice(0, dashIdx);
    const toggleStr = dashIdx === -1 ? '' : code.slice(dashIdx + 1);

    if (!/^[0-9a-z]{13}$/.test(base)) return null;
    if (toggleStr && !/^[0-9a-z]+$/.test(toggleStr)) return null;
    if (toggleStr && toggleStr.length % IDX_CHARS !== 0) return null;

    let packed;
    try {
        packed = parseBase36(base);
    } catch {
        return null;
    }

    // Unpack in reverse order (least-significant first: erIdx, smIdx)
    const erIdx = Number(packed % BigInt(RADICES[0]));
    packed = packed / BigInt(RADICES[0]);

    const smIdx = Number(packed % BigInt(RADICES[1]));
    packed = packed / BigInt(RADICES[1]);

    const nsIdx = Number(packed % BigInt(RADICES[2]));
    packed = packed / BigInt(RADICES[2]);

    const cnIdx = Number(packed % BigInt(RADICES[3]));
    packed = packed / BigInt(RADICES[3]);

    const pIdx = Number(packed % BigInt(RADICES[4]));
    packed = packed / BigInt(RADICES[4]);

    const jIdx = Number(packed % BigInt(RADICES[5]));
    packed = packed / BigInt(RADICES[5]);

    const nIdx = Number(packed % BigInt(RADICES[6]));
    packed = packed / BigInt(RADICES[6]);

    const seed = Number(packed);

    // Validate ranges
    if (seed < 0 || seed >= SEED_MAX) return null;
    if (nIdx >= SLIDERS[0].count || jIdx >= SLIDERS[1].count ||
        pIdx >= SLIDERS[2].count || cnIdx >= SLIDERS[3].count ||
        nsIdx >= SLIDERS[4].count || smIdx >= SLIDERS[5].count ||
        erIdx >= SLIDERS[6].count) return null;

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
        N:             fromIndex(nIdx, SLIDERS[0]),
        jitter:        fromIndex(jIdx, SLIDERS[1]),
        P,
        numContinents: fromIndex(cnIdx, SLIDERS[3]),
        roughness:     fromIndex(nsIdx, SLIDERS[4]),
        smoothing:     fromIndex(smIdx, SLIDERS[5]),
        erosion:       fromIndex(erIdx, SLIDERS[6]),
        toggledIndices,
    };
}
