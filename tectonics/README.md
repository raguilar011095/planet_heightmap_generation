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
the blog's rules of thumb — rotation policy, subduction initiation, rifting (stretching first,
then spreading; some rifts fail), suturing, hotspots and LIPs — with an Earth-like young ocean
floor, continental area near the design band and mean continental thickness ≈ 40 km.
Continents deform as coherent bodies (`scripts/fragments.mjs` counts the pieces) and plates
are connected bodies (`crust.coalescePlates`). P2b adds island chains: back-arc detachment
(`policy.backArc`), thermally supported intra-oceanic arcs with sub-grid volcanic edifices
(`crust.magmaAge`, `crust.volcano`, `surface.volcanoes`), and subduction initiation that
takes the oldest floor around a continent. 47 tests.
Next: P3 (erosion, sediment, ageing), then the event record and scrubber. See `DESIGN.md`
§10 for phases and §5.x for as-built notes.

```
node scripts/render-field.mjs --app history --n 80000 --seed 7 --frames 50,100,150,200 --out /tmp/h.png   # 1 Gyr history, 4 frames
node scripts/render-field.mjs --app history --field crust.plateId --map categorical --disable crust.coalescePlates --out /tmp/p.png   # any field; passes can be switched off
node scripts/render-field.mjs --n 80000 --seed 3 --out /tmp/elev.png   # equirectangular PNG of any field (static crust)
node scripts/extremes.mjs --app history --seed 7 --steps 200 --nodev    # where the extremes are, hypsometry
node scripts/fragments.mjs --app history --seed 7 --steps 200           # connected continental pieces and sizes
```
