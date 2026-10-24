// The seeds (plans/SEED_RANGE_PLAN.md), checked: every seed shared before builds its world again, and every seed of the
// range 0 … 2,147,483,645 is a world of its own — on Generate (its planet codes) and Evolution (its seed box and links).
// The engines take a seed as they always did (js/rng.js); what is pinned here is what must never change: how a typed
// seed is read, a word's hash, and the planet codes of old seeds.
//
//   node v2/tools/check-seeds.mjs

import { SEEDS, seedOf, isWordSeed, randomSeed } from '../js/core/seed.js';
import { encodePlanetCode, decodePlanetCode, SEED_MAX } from '../../js/planet-code.js';
import { makeRng } from '../../js/rng.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log(`  ✗ ${what}`); } return ok; };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// ── the range: js/rng.js starts in a state of its own for each seed ──
check(SEEDS === 2147483646 && SEED_MAX === SEEDS, `one range on both pages (${SEEDS}, ${SEED_MAX})`);
check(gcd(9301, 2147483646) === 1, 'the generator\'s seed step shares no factor with its states: each seed its own state');
{
    // (the state itself: makeRng's first draw is the state × 16807, so distinct states give distinct first draws)
    const first = new Set(), seeds = [0, 1, 2, 16777215, 16777216, 16777217, 1e9, SEEDS - 2, SEEDS - 1];
    for (let i = 0; i < 20000; i++) seeds.push(Math.floor(i * (SEEDS / 20000)) + (i % 7));
    for (const s of seeds) first.add(makeRng(s)());
    check(first.size === new Set(seeds).size, `seeds across the range start the generator apart (${first.size} of ${new Set(seeds).size})`);
    check(makeRng(SEEDS)() === makeRng(0)(), 'past the range, seeds wrap round (which is why new seeds stay inside it)');
    let inside = true;
    for (let i = 0; i < 10000; i++) { const s = randomSeed(); if (!(Number.isInteger(s) && s >= 0 && s < SEEDS)) inside = false; }
    check(inside, 'a new world\'s seed is drawn from the range');
}

// ── Evolution: a typed seed read as it always was (Number(text) || 0); a word hashed, never changing ──
for (const t of ['', '0', '42', ' 42 ', '007', '1e3', '-5', '3.7', '999999', '2147483645', '1e12', '0x10', '   ']) {
    check(seedOf(t) === (Number(t) || 0) && !isWordSeed(t), `"${t}" is the seed it always was (${seedOf(t)})`);
}
const WORDS = { 'Pangaea': 258625900, 'pangaea': 1552575436, 'Terra Nova': 1054020325, 'ünïcødé': 1536173984, 'a': 1678518574 };
for (const [w, s] of Object.entries(WORDS)) check(isWordSeed(w) && seedOf(w) === s && seedOf(` ${w} `) === s, `"${w}" is seed ${s} (${seedOf(w)})`);

// ── Generate: the planet codes of old seeds as they were; the widest seed fits a code of the same length ──
const args = s => [s, 640000, 0.75, 52, 3, 0.25, 0.5, 0.15, 0.6, 0.4, 0.3, 0.2, 0.35, 0.1, -6, 0.3, 0.35, [4, 17]];
const CODES = { 0: '0000008yltd4btufhe5iz1-040h', 1: '0000018znqpftdtj9g4eh1-040h', 4242: '00039xp3kmyqvkdr9dl9z1-040h',
    350650: '007is7ae22tvl83txkc9z1-040h', 16777215: '09zvwl9qu16svgjbpc6nh1-040h' };
for (const [s, code] of Object.entries(CODES)) {
    check(encodePlanetCode(...args(Number(s))) === code, `seed ${s}'s planet code is as it was`);
    check(decodePlanetCode(code)?.seed === Number(s), `…and reads back as seed ${s}`);
}
for (const s of [16777216, 1e9, SEEDS - 1]) {
    const code = encodePlanetCode(...args(s)), back = decodePlanetCode(code);
    check(code.split('-')[0].length === 22 && back?.seed === s && back.P === 52 && back.toggledIndices.join() === '4,17', `seed ${s} makes a 22-character code that reads back (${code})`);
}
check(decodePlanetCode(encodePlanetCode(...args(SEEDS))) === null, 'a seed past the range is refused in a code');

console.log(failures ? `\n${failures} check(s) failed` : 'all checks pass');
process.exit(failures ? 1 : 0);
