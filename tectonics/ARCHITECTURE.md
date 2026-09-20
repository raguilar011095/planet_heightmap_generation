# Tectonics v2 — Module & Debuggability Architecture

Companion to `DESIGN.md`. That document says *what* is simulated; this one says *how the code
is organised* so each component can be understood, tested, toggled and debugged in isolation.

This is a **first-class requirement**, not a coding-style preference. The rules below are
enforceable (by the scheduler, by a dependency checker, by tests), not aspirational.

---

## 1. What went wrong in v1, specifically

Not vague "the code got messy" — concrete, measured failure modes, each of which gets a
structural countermeasure in §2–§6.

| Evidence from v1 | Failure mode |
|---|---|
| `assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, noiseMag, seed, spread, plateDensity, superPlateData, r_mantleField)` — **13 positional parameters** | No stable interface. Adding a field means editing every call site; you cannot tell what a function actually reads. |
| `terrain-config.js` holds **349 exported constants**; `climate-config.js` another **116** | Constants live nowhere near their use site. You cannot tell which knob affects which behaviour without grepping. |
| `debugLayers.basin = tt.r_basinFactor;` — a hand-maintained bag assigned field by field | Diagnostics are opt-in manual labour, so most intermediates are simply never visible. |
| Stages exist as **comments plus a timing push**: `// Stage 3` … `_timing.push({ stage: '3. Terrain classification' })` | v1 has stage *labels* but not stage *boundaries*. Nothing stops stage 3 reaching into stage 1's data, and no stage can be disabled. |
| `elevation.js` is **2,615 lines**; `planet-mesh.js` 2,477 | Unit of comprehension is the file, and the files are too big to hold in your head. |
| **Zero test files** in the repo | No way to change one component and know you didn't move another. |

The single sentence version: **v1 was instrumented but never decomposed.** It can tell you
how long a stage took; it cannot tell you what that stage did, or let you turn it off.

That is the gap v2 closes.

---

## 2. The pass — the unit of everything

Every piece of simulation behaviour is a **pass**: a named, declared, independently runnable
and independently disableable unit. There is no simulation code outside a pass.

```js
// tectonics/passes/ocean/thermal-subsidence.js
import { definePass } from '../../sim/define-pass.js';

export default definePass({
  id: 'ocean.thermalSubsidence',
  phase: 'age',
  doc: `Depresses oceanic crust as it cools and densifies with age.
        Half-space cooling below the flattening age, plate-model branch above it.
        This is what produces mid-ocean ridges and abyssal plains — nothing places them.`,

  // Declared access. Enforced in dev mode (§4.1); documentation the rest of the time.
  reads:  ['crust.type', 'crust.ageMa'],
  writes: ['crust.baseDepth'],

  // Params live WITH the pass, not in a 349-constant file.
  params: {
    ridgeDepthM:    { value: 2500, range: [2000, 3200], unit: 'm',
                      doc: 'Axial depth of a spreading ridge at age 0.' },
    subsidenceCoef: { value: 350,  range: [280, 420],   unit: 'm/√Myr',
                      doc: 'Half-space cooling coefficient.' },
    flatteningAgeMa:{ value: 75,   range: [60, 90],     unit: 'Myr',
                      doc: 'Age past which √t over-predicts depth; switch to plate model.' },
  },

  invariants: ['depthIncreasesWithAge'],

  run(world, p, ctx) {
    // ctx.read/ctx.write hand back ONLY the declared fields. Asking for a
    // whole collection is not possible, so the declaration cannot be bypassed.
    const type      = ctx.read('crust.type');
    const ageMa     = ctx.read('crust.ageMa');
    const baseDepth = ctx.write('crust.baseDepth');
    for (let i = 0; i < world.cellCount; i++) {
      if (type[i] !== CRUST.OCEANIC) continue;
      const t = ageMa[i];
      baseDepth[i] = t < p.flatteningAgeMa
        ? p.ridgeDepthM + p.subsidenceCoef * Math.sqrt(t)
        : plateModelDepth(t, p);
    }
  },
});
```

What this buys, mechanically:

- **`reads`/`writes` make the dependency graph explicit and checkable.** The scheduler
  validates at registration that no pass reads a field nothing writes earlier, so a missing
  dependency is a startup error naming both passes — not a silent field of zeros or NaNs
  discovered three phases later.
- **Every pass can be disabled.** Understanding a component is mostly "what happens without
  it", and that becomes a checkbox.
- **Params are discoverable.** Each carries a range, a unit and a sentence. The UI, the
  tuning harness and the docs are all generated from this — no separate lists to drift.
- **`doc` is required.** A pass without a stated purpose fails registration.

### 2.1 Size budget

Soft cap **250 lines per pass file**, hard cap 400, checked by a lint script. A pass that
outgrows it is doing more than one thing and should be split. `elevation.js` at 2,615 lines
is the outcome this exists to prevent.

---

## 3. State: one typed world, self-describing fields

No loose `Float32Array`s passed positionally. One `World` of struct-of-arrays collections,
where every field is **registered with metadata**:

```js
// tectonics/state/fields.js
defineField('crust.thickness', { type: Float32Array, unit: 'km',
  range: [0, 80], doc: 'Crustal column thickness; the conserved quantity.' });

defineField('crust.ageMa',     { type: Float32Array, unit: 'Myr',
  range: [0, 1000], doc: 'Time since formation (oceanic) or last thermal reset.' });
```

Consequences, all of which v1 lacked:

- **Every field is automatically inspectable.** The debug viewer enumerates the registry;
  there is no `debugLayers` bag to hand-maintain, and no such thing as a field you forgot to
  expose. This directly kills the `debugLayers.basin = tt.r_basinFactor` pattern.
- **Units are declared,** so the inspector labels and scales correctly, and unit mistakes
  (km vs m — a real hazard given §4.2 of `DESIGN.md`) are visible.
- **Ranges give free assertions.** Dev mode flags any field leaving its declared range and
  names the pass that put it there.
- **Allocation is centralised,** so snapshotting, cloning and worker transfer are generic
  rather than written per field.

Diagnostic fields use the same mechanism — a pass calls `ctx.diag('convergenceRate', arr)`
and it becomes visualizable with no wiring anywhere else.

### 3.1 The grid is fixed, so the cell index is the stable ID

`DESIGN.md` §1.1 runs the simulation on a fixed Fibonacci cell grid that is never
re-tessellated. That decision does a lot of work here:

- **Every field has the same length for the whole run**, so before/after diffs (§4.4) and
  golden comparisons (§6) align by index with no ID bookkeeping.
- **There is no topology-mutating pass.** Plate split, merge, accretion and subduction
  death are all ordinary writes to `crust.plateId` / `crust.type`. The pass contract
  therefore covers *every* pass, including the ones that would have fit worst under a
  particle model (advection, gap-filling, convergence resolution — each is a pass that
  declares the crust fields it rewrites).
- Snapshotting is a flat copy of the registered arrays.

---

## 4. Debuggability affordances

These are product features of the dev build, specified up front rather than retrofitted.

### 4.1 Access enforcement

In dev mode `ctx.read`/`ctx.write` return the real arrays but record access, and the world is
wrapped so that a pass touching an undeclared field throws, naming the pass and the field.
Declarations therefore cannot rot.

**Performance note — important:** the guard wraps at **field granularity** (one check when a
pass acquires an array), never per element. A per-element Proxy over 80k cells × 200
substeps would obliterate the runtime budget in `DESIGN.md` §8. Production builds take the
unguarded path; the guard is dev-only and must never appear in the hot loop.

### 4.2 Pass toggling, soloing, and stepping

- Toggle any pass off, or solo one, at runtime.
- Pause the simulation; step one **timestep**; step one **pass**.
- The globe re-renders between steps, so you watch a single pass act.

### 4.3 Deterministic A/B — the part that is easy to get wrong

Randomness is **stateless and addressed**, not streamed:

```js
ctx.rand(cellIndex)            // = hash(worldSeed, passId, stepIndex, cellIndex) → [0,1)
ctx.rand(cellIndex, k)         // k-th independent draw for the same cell
ctx.randPlate(plateId)         // same idea, keyed by plate instead of cell
```

Why not per-pass streams (the earlier revision's design): a stream is consumed in order, and
*how many* draws a pass makes depends on state — how many cells are on a convergent boundary,
say. Change an upstream pass and every downstream stream is consumed differently, so the A/B
you just ran still shows mostly reseeding noise. Keying each draw by
`(pass, step, cell)` removes ordering entirely: toggling a pass changes only that pass's
contribution, and a cell's random value is the same whether or not its neighbour was
processed. Without this, every other affordance in this section produces confident nonsense.

The hash must be cheap (a 32-bit integer mix, no allocation) because it runs per cell in
the hot loop.

### 4.4 Before/after diff

Because passes are discrete, the runtime can snapshot any declared `writes` field around a
pass and render the delta. "What did this pass actually change, and by how much?" becomes a
UI affordance instead of a debugging session.

### 4.5 Invariants

Passes declare invariants, checked in dev mode after each run, failing loudly with pass and
step identified. `massConserved` is the important one — `DESIGN.md` §10.3 flags crust drift
over ~1,000 steps as a real risk, and this is how it gets caught on step 12 rather than
inferred from a wrong-looking planet at step 900.

### 4.6 Timing

Per-pass timing, as v1 already had. Keep it — it was the one thing v1's stage concept did
well.

---

## 5. Module layout and dependency direction

```
tectonics/
  core/        # pure math, zero imports from elsewhere in the project
               #   Fibonacci cell grid + locator, finite rotations, addressed RNG
  state/       # field registry, World (SoA storage, clock, diag), crust field definitions
  sim/         # pass contract (definePass), invariants, Scheduler
  passes/      # ALL simulation behaviour; one concern per file
    motion/    #   scatter advection, boundary classification, gap filling
    convergence/ # subduction, thickening, accretion, arc growth
    surface/   #   isostasy, flexure, thermal subsidence, erosion, deposition
    policy/    #   initial condition, rotation policy, subduction init/death, rifting, plumes
    debug/     #   harness smoke-test passes
  app/         # wires passes into a Scheduler for a given run configuration
  render/      # the ONLY place allowed to import three.js
  ui/          # controls, scrubber, overlays
  dev/         # inspector, field viewer, pass toggles, diff view
  scripts/     # check-deps, check-size
  test/
```

**Dependency rule, enforced by `scripts/check-deps.mjs`:**

```
core  ←  state  ←  sim  ←  passes  ←  app / render / ui / dev
```

Imports only ever point left. `sim/` sits *below* `passes/` because passes call `definePass`
and the Scheduler never imports a pass — `app/` is what registers passes with a Scheduler.
`core/` imports nothing from the project. **Nothing under `core/`, `state/`, `sim/` or
`passes/` may import three.js, any package, or touch the DOM** — that is what makes the whole
simulation headless and testable (§6), and it is the rule most likely to be violated by
accident, so the checker matters.

---

## 6. Testing

v1 has **zero tests**, which is why changing one thing and checking another was impossible.
v2's simulation core is pure and headless, so this is cheap:

- **Runner:** node's built-in `node --test`. No dependencies, no build step — consistent with
  the project's no-build ethos. A minimal `package.json` (`"type": "module"` plus `test` and
  `check` scripts) is worth adding; it stays dependency-free.
- **Per-pass unit tests.** Construct a tiny synthetic world, run one pass, assert the
  outcome. Feasible *only* because passes are isolated — this is the payoff for §2.
- **Invariant tests.** Mass conservation across 1,000 steps within tolerance; no NaNs; every
  field stays inside its declared range.
- **Golden regression.** Store the field state at fixed steps for a fixed seed and compare
  with a **per-field tolerance**, not a hash: `Math.sin`, `exp` and `pow` are not
  bit-identical across JS engines, so a byte hash that passes under node's V8 can fail in
  Safari for no real reason. Unintended behaviour change fails loudly; intended change
  re-blesses the golden in one place.
- **Acceptance scoring.** `DESIGN.md` §0.1's checklist, automated where it can be: hypsometric
  curve vs Earth, land fraction stability, orogen width distribution, margin asymmetry.
  Extends the `tuning/` pattern already proven under node in this repo.

The precedent exists: `tuning/climate/evaluate.mjs` already runs v1 climate code headlessly
under node. v2 makes that the default for the entire simulation rather than a bolt-on.

---

## 7. Honest costs

1. **Infrastructure before tectonics.** The pass framework, field registry, scheduler and
   dev guard are ~300–500 lines; the dev UI (inspector, field viewer, toggles, step
   controls, diff view) is more than that again. Honest total: **1,500–2,500 lines before a
   plate moves.** That is the price of the requirement, and it is paid once.
2. **Indirection.** `definePass` is a layer between you and the loop. Mitigation: it stays
   thin and readable — no DI container, no plugin lifecycle, no events. Read it in one sitting.
3. **Guard discipline.** The dev guard must stay out of the hot path (§4.1). This needs a
   benchmark in CI, or it will silently regress.
4. **Over-decomposition is a real failure too.** A pass per three lines is as unreadable as a
   2,615-line file. Heuristic: a pass should correspond to something you would name in a
   sentence describing the model — "subsidence with age", "solve plate torques", "accrete
   arriving terranes". If you cannot describe it that way, it is the wrong size.

---

## 8. How this changes the phasing

`DESIGN.md` §10 begins with a phase before P0:

- **P−1 — Harness.** `core/`, `state/` with the field registry, `sim/` with the scheduler and
  pass contract, the dev guard, the dependency checker, and the test runner. Validated by a
  single trivial pass (fill a field with a constant) that can be registered, run, toggled,
  inspected, diffed and unit-tested end to end.

Building this first is the whole point: retrofitting a pass architecture onto working
simulation code is exactly how v1 ended up with stage labels and no stage boundaries.
