# Ocean Topography Rework — Ground-Up Plan

## Context

Phase 3 attempted to implement passive vs active continental margins by changing the ocean floor depth profile. This failed because the ocean floor, coastal roughening, island scattering, and hotspot systems are tightly coupled — shallower shelf depths caused widespread false land (Lesson 8 in HEIGHTMAP_REALISM_PLAN.md).

This plan rethinks ocean plate topography from the ground up. The key insight: **coastline character should come from the coastal roughening system, not from the base depth profile**. The depth profile's job is to provide a stable, deep floor. Everything above that floor — coastline shape, islands, shelf character — should be controlled by the layers that add positive elevation on top.

All implementations must scale with region count via `scaleFactor = Math.sqrt(numRegions / 10000)`.

### Priorities
1. **Interesting, geographically plausible coastlines** — varied shapes, different character at different tectonic settings
2. **Interesting ocean landforms** — islands, arcs, seamounts forming where tectonically appropriate
3. **Realistic ocean floor** — margin differentiation, ridges, fracture zones

### File: `js/elevation.js`

---

## Ocean Depth Budget Analysis

Every ocean cell starts at `oceanBase` (negative), then multiple layers add positive elevation. The depth must survive these additions to stay underwater — unless the addition is *intentional* land (islands, arcs, hotspots).

**Current ocean base profile** (dist_coast `dc`):
| Zone | Distance | Depth |
|------|----------|-------|
| Shelf | dc < 5 | -0.02 to -0.08 |
| Slope | 5 ≤ dc < 12 | -0.08 to -0.33 |
| Abyss | dc ≥ 12 | ~-0.35 |

**Positive layers that can affect ocean cells:**
| Layer | Max positive contribution | Reach | Intentional land? |
|-------|-------------------------|-------|-------------------|
| Coastal fractal noise (L1) | ±0.12 × falloff × stressAmp (up to ~0.5) | 8 cells | No |
| Domain warping (L3) | ±0.2 | 5 cells | No |
| Island scattering (L2) | +0.36 | 4 cells | **Yes** |
| Island arcs | +0.55 | 5 cells | **Yes** |
| Hotspots | +0.9 (ocean boosted 1.8x) | sigma×5 | **Yes** |
| Ocean noise | ±0.03 | Global | No |

**The problem**: At dc=1, the shelf depth is only -0.032. Coastal L1 noise alone (±0.12 near coast) can push this positive. The shelf is too shallow to survive non-island coastal roughening.

**The fix**: Deepen the shelf so only intentional mechanisms (island scatter, arcs, hotspots) create above-water features. Differentiate margin types through WIDTH (spatial extent of shelf), not DEPTH (how shallow it is).

---

## Implementation Steps

### Step 1: Deepen Ocean Baseline + Margin-Aware Width

**Goal**: A deeper, more resilient base profile that differentiates margin types through *width* (how far the shelf extends), not through *depth* (how shallow the shelf is).

**Changes**: Replace the fixed ocean floor breakpoints in the `else` (ocean) branch of the main elevation loop.

**New profile**:
- `SHELF_NEAR = -0.04` (coast edge, was -0.02)
- `SHELF_FAR = -0.10` (shelf break, was -0.08)
- `SLOPE_FAR = -0.33` (base of slope, unchanged)
- `ABYSS = -0.35` (deep ocean, unchanged)

**Width differentiation** (via hoisted `coastConvergent` flag):
- Active margins: shelf end = `max(2, round(3 * sf))`, slope end = `max(5, round(8 * sf))`
- Passive margins: shelf end = `max(4, round(7 * sf))`, slope end = `max(10, round(16 * sf))`
- Both margin types use the SAME depth endpoints — avoids the false-land problem

**Why this works where the previous attempt failed**: The previous attempt made passive margins *shallower*. This plan makes everything *uniformly deeper* while widening the passive shelf *spatially*. Visual difference comes from shelf width, not depth.

**QA**: Generate at 10k. Compare ocean debug layer before/after. No new false land should appear. Passive coasts should have wider light-blue shelf bands. Active coasts should have narrower bands.

---

### Step 2: Mid-Ocean Ridge Enhancement

**Goal**: Wider, more prominent ridges instead of single-cell-wide uplift.

Currently, only cells with `btype === 2 && r_bothOcean[r]` get ridge uplift (+0.06 to +0.18). This is a 1-cell-wide feature — invisible at most zoom levels.

**New approach**: Pre-compute `ridgeDist` via BFS from ocean divergent boundary cells, propagating through ocean cells only, max `round(4 * sf)` cells. Replace the single-cell ridge block with distance-based ridge uplift using quadratic falloff:
- At boundary (rd=0): full uplift `(0.12 * ridgedNoise + 0.06)`
- At rd=2: 25% uplift
- At rd=4: 0%

**Scaling**: At 2k: 2-cell-wide ridge. At 10k: 4-cell. At 200k: 18-cell.

**QA**: Generate at 10k. Ocean debug layer should show visible ridge bands at divergent ocean-ocean boundaries. Ridges should be wider than before but not dominant. No land should be created (ridge uplift peaks at ~+0.18, ocean base is -0.35 at those distances).

---

### Step 3: Oceanic Fracture Zones

**Goal**: Transform ocean-ocean boundaries create visible linear depressions.

Pre-compute `fractureDist` via BFS from transform ocean boundaries (`btype === 3 && r_bothOcean[r]`), propagating through ocean cells only, max `round(3 * sf)` cells.

Apply subtle depression: `-0.03 * (1 - d/maxDist)` fading linearly.

Where fracture zones intersect the widened ridge (Step 2), the ridge uplift is naturally reduced by the fracture depression, creating the characteristic offset/staircase pattern.

**Scaling**: At 2k: 2-cell-wide line. At 10k: 3-cell. At 200k: 13-cell.

**QA**: Generate at 10k. Look at ocean debug layer for linear depressions at transform boundaries. Where they cross mid-ocean ridges, the ridge should appear offset/interrupted.

---

### Step 4: Margin-Aware Coastal Roughening

**Goal**: Different coastline character at active vs passive margins. This is where the visual coastline interest comes from.

**Layer 1 (Coastal fractal noise)**: Differentiate frequency and amplitude.
- Passive coasts: freq 12 (was 18), amp 0.08 (was 0.12) — broad bays, gentle peninsulas
- Active coasts: keep current freq 18, amp 0.12 — rugged, fjord-like
- Both still modulated by stress

**Layer 2 (Island scattering)**: Wider range and easier threshold at passive margins.
- Passive: range 6 cells (was 4), threshold 0.20 (was 0.25) — barrier islands, archipelagos
- Active: range 3 cells, threshold 0.30 — fewer islands, only where stress concentrates
- Subduction suppression stays unchanged

**Layer 3 (Domain warping)**: Wider warp zone at passive margins.
- Passive: falloff multiplier 1.2 (warp dies slower, broader coastal irregularity)
- Active: falloff multiplier 1.5 (warp concentrated near coast)

**QA**: Generate several planets at 10k. Compare coastline character: passive coasts should have broader, gentler features with more offshore islands. Active coasts should remain rugged. Toggle the Coastal debug layer to verify the contribution patterns differ.

---

### Step 5: Debug Layer

Add a "Margins" debug layer showing margin type classification for ocean cells:
- Active margin cells: one color
- Passive margin cells: another color
- Ridge zone: highlighted
- Fracture zone: highlighted

Add the option to `index.html` debug layer dropdown.

**QA**: Generate at 10k. Verify that convergent coastlines show as active, non-convergent show as passive, and the classification makes geological sense.

---

## Scaling Verification Table

| Feature | 2k (sf=0.45) | 10k (sf=1.0) | 50k (sf=2.24) | 200k (sf=4.47) |
|---------|-------------|-------------|--------------|----------------|
| Active shelf | 2 cells | 3 cells | 7 cells | 13 cells |
| Passive shelf | 4 cells | 7 cells | 16 cells | 31 cells |
| Active slope end | 5 cells | 8 cells | 18 cells | 36 cells |
| Passive slope end | 10 cells | 16 cells | 36 cells | 72 cells |
| Ridge width | 2 cells | 4 cells | 9 cells | 18 cells |
| Fracture width | 2 cells | 3 cells | 7 cells | 13 cells |
| Passive island range | 6 cells | 6 cells | 13 cells | 27 cells |

---

## Lessons Applied
- **Lesson 1 (seed selectivity)**: Ridge seeds = only `btype===2 && r_bothOcean`. Fracture seeds = only `btype===3 && r_bothOcean`. Highly selective.
- **Lesson 6 (start at 60%)**: Fracture depression at -0.03 (conservative). Ridge widening modest (4 cells). Coastal differentiation moderate (freq 12 vs 18, not 8 vs 18).
- **Lesson 8 (ocean depth coupling)**: Depths are uniformly DEEPER not shallower. Width is the differentiator, not depth.
