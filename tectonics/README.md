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

P−1 (harness), P0 (static crust) complete; P1 (motion + collision with prescribed rotations)
kinematics built and tested — exact-position scatter advection, plate partition that keeps
cratons whole, convergence resolution, belt thickening with craton routing, crustal flow,
delamination — with the visual gate still being evaluated. 39 tests. Next: P1 visual
sign-off, then P2 (policy). See `DESIGN.md` §10 for phases.

```
node scripts/render-field.mjs --n 80000 --seed 3 --out /tmp/elev.png   # equirectangular PNG of any field
node scripts/extremes.mjs --seed 3                                       # where the extremes are, hypsometry
```
