// Seeded RNG — deterministic pseudo-random number generators.

// (Park–Miller: each seed from 0 to 2,147,483,645 starts it in a state of its own — 9301 shares no factor with 2^31 − 2 —
// so that is the seeds' range: js/planet-code.js SEED_MAX, v2/js/core/seed.js. Never change it: every world would change)
export function makeRng(seed) {
    let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function makeRandInt(seed) {
    const r = makeRng(seed);
    return (n) => Math.floor(r() * n);
}
