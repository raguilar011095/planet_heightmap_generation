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
    const { type, ageMa } = ctx.read('crust');
    const baseDepth = ctx.write('crust.baseDepth');
    for (let i = 0; i < world.crust.count; i++) {
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

Diagnostic fields use the same mechanism — a pass calls `ctx.diag('slabPullMagnitude', arr)`
and it becomes visualizable with no wiring anywhere else.

---

## 4. Debuggability affordances

These are product features of the dev build, specified up front rather than retrofitted.

### 4.1 Access enforcement

In dev mode `ctx.read`/`ctx.write` return the real arrays but record access, and the world is
wrapped so that a pass touching an undeclared field throws, naming the pass and the field.
Declarations therefore cannot rot.

**Performance note — important:** the guard wraps at **field granularity** (one check when a
pass acquires an array), never per element. A per-element Proxy over 50k particles × 300
steps would obliterate the runtime budget in `DESIGN.md` §1. Production builds take the
unguarded path; the guard is dev-only and must never appear in the hot loop.

### 4.2 Pass toggling, soloing, and stepping

- Toggle any pass off, or solo one, at runtime.
- Pause the simulation; step one **timestep**; step one **pass**.
- The globe re-renders between steps, so you watch a single pass act.

### 4.3 Deterministic A/B — the part that is easy to get wrong

Each pass gets its **own RNG stream**, seeded from `hash(worldSeed, passId, stepIndex)`.

This matters more than it looks: with one shared global RNG, disabling any pass shifts the
random number sequence for every pass after it, so the A/B comparison you just ran is
meaningless — the differences you see are mostly reseeding noise, not the pass's effect.
Per-pass streams mean toggling a pass changes *only that pass's contribution*. Without this,
every other affordance here produces confident nonsense.

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
               #   sphere geometry, finite rotations, RNG, Delaunay wrapper, units
  state/       # World, field registry, SoA storage, snapshots, serialisation
  passes/      # ALL simulation behaviour; one concern per file
    forces/    #   slab pull, ridge push, basal drag, torque solve
    motion/    #   advection, re-tessellation, boundary classification
    convergence/ # subduction, thickening, accretion, arc volcanism
    surface/   #   isostasy, thermal subsidence, erosion, deposition
    mantle/    #   plumes, hotspots, LIPs
    topology/  #   plate split/merge, subduction initiation, rotation-tree edits
  sim/         # scheduler, pass registry, invariant runner, history recorder
  render/      # the ONLY place allowed to import three.js
  ui/          # controls, scrubber, overlays
  dev/         # inspector, field viewer, pass toggles, diff view, torque overlay
  test/
```

**Dependency rule, enforced by a check script in CI:**

```
core  ←  state  ←  passes  ←  sim  ←  render / ui / dev
```

Imports only ever point left. `core/` imports nothing from the project. **Nothing under
`core/`, `state/`, `passes/` or `sim/` may import three.js or touch the DOM** — that is what
makes the whole simulation headless and testable (§6), and it is the rule most likely to be
violated by accident, so the checker matters.

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
- **Golden regression.** Hash the field state at fixed steps for a fixed seed. Any
  unintended behaviour change fails loudly; intended ones re-bless the hash in one place.
- **Acceptance scoring.** `DESIGN.md` §0.1's checklist, automated where it can be: hypsometric
  curve vs Earth, land fraction stability, orogen width distribution, margin asymmetry.
  Extends the `tuning/` pattern already proven under node in this repo.

The precedent exists: `tuning/climate/evaluate.mjs` already runs v1 climate code headlessly
under node. v2 makes that the default for the entire simulation rather than a bolt-on.

---

## 7. Honest costs

1. **Infrastructure before tectonics.** The pass framework, field registry, scheduler and
   dev guard are roughly 300–500 lines before a single plate moves. That is the price of the
   requirement, and it is paid once.
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

`DESIGN.md` §9 gains a phase before P0:

- **P−1 — Harness.** `core/`, `state/` with the field registry, `sim/` with the scheduler and
  pass contract, the dev guard, the dependency checker, and the test runner. Validated by a
  single trivial pass (fill a field with a constant) that can be registered, run, toggled,
  inspected, diffed and unit-tested end to end.

Building this first is the whole point: retrofitting a pass architecture onto working
simulation code is exactly how v1 ended up with stage labels and no stage boundaries.
