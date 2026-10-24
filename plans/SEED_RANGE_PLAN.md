# More seeds, the same worlds — plan

Draft, 2026-10-23, for the developer to agree before anything is built. Branch: `fast-follows`.

## What the developer asked for

- "Expand the seeds … like crazy": a thread found too few of them.
- "All the seeds, if entered again, will produce the SAME WORLD": every seed shared so far keeps its world.
- It doubles as a stress test of the planet file's update rules (plans/V2_SAVE_LOAD_PLAN.md).

## What the code does today (read 2026-10-23)

- **New seeds are drawn from**:
  - Generate: 0…16,777,215 (2^24; `js/generate.js`, `js/planet-worker.js`, the planet code's `SEED_MAX`);
  - Evolution: 0…999,999 (`evolution-main.js`, New World).

  You can type a bigger number into Evolution's seed box, but text silently becomes seed 0.
- **Both engines turn a seed into numbers the same way**, through `js/rng.js`'s `makeRng`:
  - a Park–Miller generator, with state `(seed × 9301 + 49297) mod 2,147,483,646`;
  - 9301 shares no factor with 2,147,483,646, so **every seed from 0 to 2,147,483,645 starts the generator in a state of
    its own**: 2.1 billion distinct worlds, 128× Generate's range and 2,147× Evolution's;
  - past that, seeds wrap round onto earlier ones;
  - Evolution's other streams (`seed ^ constant`, `seed | 0`) are exact 32-bit operations, distinct over the same range.
- **Arithmetic on seeds** (`seed + 501`, `seed × 31`, `seed × 7919`):
  - it is plain IEEE arithmetic, which every browser computes identically, so the same seed always makes the same
    numbers;
  - it is exact up to 2^31, except the climate's `seed × 7919` stream, which rounds past ~10^12 / 7919 (still the same
    every time).
- **Generate's planet code** packs the seed as the top digit of a 22-character base-36 number:
  - a seed up to 2,147,483,645 still fits in 22 characters (measured);
  - old codes decode to the same seed;
  - an old seed encodes to the same code.
- **The planet file** stores the seed as a JSON number: no format change.

## The design (recommended)

**One rule: no engine code changes.** Only where a seed comes from, and how it is typed in, changes. Every existing seed
then makes its world by construction. Hashes of a few worlds before and after prove it.

1. **The range**: 0 … 2,147,483,645 on both pages.
   - New World and Generate draw from all of it.
   - A number typed in outside it, or a fraction, is refused with a note, never wrapped silently.
2. **Words as seeds** (optional, question 2): anything typed that is not a number becomes a seed through a fixed hash
   (FNV-1a, 32-bit integer operations, the same in every browser forever) into the same range.
   - "Pangaea" is always the same world.
   - The link carries the word (`seed=Pangaea`). The planet file adds `settings.seedText`: an addition, so no version bump.
3. **Generate's planet code**: `SEED_MAX` raised to 2,147,483,646. Codes stay 22 characters; every old code is unchanged.
   - Words map to their number there: a planet code holds numbers.
4. **Checks**:
   - Hash Evolution histories and Generate planets for old seeds (0, 1, 4242, 350650, 999999, 16777215) before and after,
     and require them identical.
   - Planet-code round trips at the range's ends.
   - check-save.mjs: the kept fixture still opens, and a word-seeded save opens.
5. **Docs**: README (seed range), the tutorial line on seeds, llms.txt.

**Not covered by this plan:** Evolution's same seed can still build a different history in a *different browser
version* (memory: links are browser-dependent: sin/cos differ in the last digit). Seeds don't cause that. The planet file
is the exact cross-browser share. Making the engines browser-proof is a larger, separate project.

## Questions for the developer

1. **Range**: 2.1 billion (recommended; no engine change, so old seeds are safe by construction), or truly unlimited? The
   unlimited option needs a second, wider generator for seeds past 2.1 billion, which touches every random draw in both
   engines. It's a far bigger and riskier change, for worlds nobody could tell apart from the first 2.1 billion.
2. **Words as seeds**: yes (recommended: it is the "like crazy" feel, and shareable), or numbers only?

## Phases

- **R1**: the range, the planet code and the checks (both pages).
- **R2**: words as seeds (if wanted).

## Decisions (developer, 2026-10-23)
1. **2.1 billion is fine** (no engine change).
2. **Words**: "don't need that, but if it's easy to hash into a number in the range that is OK". Built for Evolution only:
   Generate's box takes planet codes, which are words themselves.
3. Generate: "not worried … but if it's easy we can expand". It was one constant.

## Status
- **R1 + R2 built 2026-10-23.**
  - `v2/js/core/seed.js`: the range; `seedOf`, which reads a number as the page always did and hashes a word with
    FNV-1a, trimmed and case-sensitive.
  - Evolution: the seed box, its link, and the planet file's `settings.seedText` (an addition: no version bump; the kept
    fixture, without it, opens as before).
  - Generate: `SEED_MAX` and both random draws.
  - `v2/tools/check-seeds.mjs` pins:
    - the range, and distinct generator states across it;
    - old typed seeds, read as before;
    - five words' seeds;
    - five old seeds' planet codes;
    - 22-character codes up to the top of the range.
- **Same worlds:**
  - No engine file changed (`js/rng.js` only gained a comment).
  - 3,000 random planet codes encode identically, and every one of 3,050 codes that decoded before decodes
    identically.
  - In Chrome, "Pangaea" and its number 258625900 built histories identical entry for entry (65 of 65).
  - Generate builds from a seed of 1,970,034,863, and an old code still applies.
