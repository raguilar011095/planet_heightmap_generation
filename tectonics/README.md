# World Orogen v2 — `tectonics/`

An automated plate-history engine: Worldbuilding Pasta's GPlates method with the human
replaced by a policy. Separate project from the v1 app at the repo root; governed by its own
docs, not the root `CLAUDE.md`.

- **`DESIGN.md`** — what is simulated and why.
- **`ARCHITECTURE.md`** — how the code is organised: the pass contract, field registry,
  dependency rules, debugging affordances, testing.

## Running

No dependencies, no build step. Node ≥ 20.

```
cd tectonics
npm test          # node --test test/
npm run check     # dependency direction + size budget
npm run verify    # both
```

## Layout

```
core/     pure math — sphere grid, finite rotations, addressed RNG. Imports nothing.
state/    field registry, World, crust field definitions
sim/      pass contract, invariants, Scheduler
passes/   every simulation behaviour, one concern per file
scripts/  check-deps, check-size
test/     node:test suites
```

Dependency direction is `core ← state ← sim ← passes ← app`, enforced by `scripts/check-deps.mjs`.

## Status

P−1 (harness), P0 (static crust), P1 (motion + collision) and P2 (the policy) are built and
tested: a seed-generated supercontinent breaks up, disperses and re-assembles over 1 Gyr under
the blog's rules of thumb — rotation policy, subduction initiation, rifting (including failed
rifts), suturing, hotspots and LIPs — with an Earth-like young ocean floor and continental
area holding in the design band. 44 tests. Next: P3 (erosion, sediment, ageing), then the
event record and scrubber. See `DESIGN.md` §10 for phases and §5.x for as-built notes.

```
node scripts/render-field.mjs --app history --n 80000 --seed 7 --frames 50,100,150,200 --out /tmp/h.png   # 1 Gyr history, 4 frames
node scripts/render-field.mjs --n 80000 --seed 3 --out /tmp/elev.png   # equirectangular PNG of any field (static crust)
node scripts/extremes.mjs --seed 3                                       # where the extremes are, hypsometry
```
