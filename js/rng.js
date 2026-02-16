// Seeded RNG — deterministic pseudo-random number generators.

export function makeRng(seed) {
    let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function makeRandInt(seed) {
    const r = makeRng(seed);
    return (n) => Math.floor(r() * n);
}
