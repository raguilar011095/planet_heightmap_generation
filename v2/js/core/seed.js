// A world's seed, from what is typed or linked (plans/SEED_RANGE_PLAN.md). Every world is built from a number: js/rng.js's
// generator starts in a state of its own for each of 0 … 2,147,483,645, so that is the range a new world's seed is drawn
// from. Whatever parsed as a number before still does, unchanged (a seed shared once builds its world again); a word or
// phrase becomes a number in the range by a fixed hash — FROZEN: changing it would change every word's world.

/** How many seeds there are: 0 … SEEDS − 1, each its own world (js/rng.js: Park–Miller, 2^31 − 2 states). */
export const SEEDS = 2147483646;

/** A new world's seed, at random. */
export const randomSeed = () => Math.floor(Math.random() * SEEDS);

/** Whether a typed seed is a word (hashed), not a number. */
export const isWordSeed = text => { const t = String(text ?? '').trim(); return t !== '' && !Number.isFinite(Number(t)); };

/**
 * The seed a text stands for: a number as it reads (as the page always read it: `Number(text) || 0`), or a word's hash —
 * FNV-1a over its UTF-8 bytes (32-bit integer arithmetic: the same in every browser), into 0 … SEEDS − 1. Case and inner
 * spaces count; the ends are trimmed.
 */
export function seedOf(text) {
    const t = String(text ?? '').trim();
    if (!isWordSeed(t)) return Number(t) || 0;
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(t)) h = Math.imul(h ^ b, 0x01000193);
    return (h >>> 0) % SEEDS;
}
