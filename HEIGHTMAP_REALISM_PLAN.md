# Heightmap Realism: Holistic Gap Analysis & Implementation Plan

## Context

This plan evaluates the *combined output* of the entire elevation pipeline — base distance fields + tectonic uplift/suppression + stress propagation + noise + interior uplift + ocean profiles + coastal roughening + island arcs + hotspots — to identify where the net elevation at canonical planetary positions diverges from reality. Each gap is assessed against what all layers together already produce, not what any single layer does in isolation.

All implementations must scale with region count. The codebase normalizes via `scaleFactor = Math.sqrt(numRegions / 10000)`. BFS distances, band widths, and pass counts use this factor. All new features must follow the same pattern so geological proportions hold from 2k to 640k regions.

---

## Implementation Lessons Learned

### Lesson 1: BFS Seed Selectivity Is Critical
When computing influence fields via BFS, the choice of seed cells determines everything. In Phase 1 we initially seeded from ALL land cells with any propagated stress (`r_stress > 0.01`). Because stress propagates ~12 hops from every plate boundary, this blanketed ~100% of land cells — the "tectonic activity" map was red everywhere.

**Fix**: Switched to `dist_mountain` (already computed from `stress_mountain_r` — only mountain-building convergent boundary cells with sf < 0.55). This means only major collisions drive the influence field. Plates with no convergent collisions on their edges correctly get zero tectonic activity (cratons).

**Rule for future features**: Always consider what fraction of the planet your seed set covers. If seeds + their propagation zone covers >50% of the target surface, the field won't differentiate anything. Use the most selective seed set that captures the geological phenomenon.

### Lesson 2: Plate Size vs Feature Size at 10k Regions
At 10k regions with 20 plates, each plate is ~500 cells with diameter ~22 cells. Features that require "deep interior far from all boundaries" only manifest clearly when plates are large enough to have such interiors. At low region counts or high plate counts, plates are too small for interior differentiation.

**Implication**: Features should degrade gracefully — at small plates they simplify or disappear rather than creating artifacts. The `tectonicReach` clamp (`max(6, ...)`) handles this, but future features must consider the same constraint.

### Lesson 3: dist_mountain Is a Versatile Signal
`dist_mountain` (BFS from `stress_mountain_r`, blocked by `ocean_r`) encodes "distance from the nearest mountain-building collision through land." It's already computed, inherently scales, and is finite only on plates reachable from major convergent boundaries. It's the right signal for tectonic-modulated interior uplift and should be leveraged for future features (plateau enhancement, back-arc identification) rather than computing new BFS fields where possible.

### Lesson 4: Foreland Basins Need Base Elevation Asymmetry
Phase 1's interior uplift fix reduced the uniform +0.14 and increased the foreland dip from -0.03 to -0.06. But the harmonic-mean base elevation still contributes ~+0.16 at the foreland position, and `dist_mountain`-based tectonic activity is high there (close to mountains). The foreland dip alone cannot overcome base + tectonic-modulated interior. True foreland depressions require Rank 4's base elevation asymmetry — lowering the base on the subducting side so there's room for a basin.

### Lesson 5: r_subductFactor Propagation Range Is Limited
`r_subductFactor` is only propagated as far as stress reaches (~5 hops on subducting side due to aggressive decay, ~12 hops on overriding side). Beyond propagation range, sf = default 0.5. This means sf cannot be used to distinguish overriding vs subducting sides at distances beyond stress propagation. Features that need side-awareness at longer range must use other signals (e.g., `dist_mountain` is finite only on the overriding side of continent-continent collisions where sf < 0.55).

---

## Phase 1: Tectonic-Aware Interior — COMPLETED

### What was implemented
1. **Tectonic-modulated interior uplift**: Replaced uniform `+0.14` with `0.06 + tectonicActivity * 0.16`. Uses `dist_mountain` with quadratic decay over `TECTONIC_REACH_BASE=20 * scaleFactor` cells. Range: +0.06 (quiet craton) to +0.22 (collision-backed plateau).
2. **Noise amplitude scaling**: `noiseScale = 0.25 + 0.75 * min(1, stressNorm * 4)`. Quiet interiors get 25% noise (visibly flat), collision zones get full roughness.
3. **Foreland dip increase**: Zone widened from `stressNorm < 0.05` to `< 0.10`, max depression increased from `-0.03` to `-0.06` with linear falloff.
4. **Debug layer**: "Tectonic Activity" added showing the `tectonicActivity` field.

### Updated canonical positions (post Phase 1)
- **Position B** (5 cells behind mountain, overriding): Interior now ~+0.20 (high tectonicActivity) vs old +0.14. Net ~0.55. Plateau-like. ✓
- **Position E** (deep interior, no collisions): Interior now ~+0.06 (zero tectonicActivity) vs old +0.14. Net ~0.12-0.17. Low craton. Noise at 25% amplitude — visibly flat. ✓
- **Position D** (foreland, stress edge): Dip now -0.06 (was -0.03). Interior still high due to mountain proximity. Net ~0.25. Still not a true basin — needs Phase 2's base asymmetry.
- **Position I** (rift): Interior now ~+0.06-0.10 (depends on nearby collisions). Net ~0.14-0.18. Rift depression still absorbed. Needs Phase 3's structured graben.

---

## Part 1: Combined Pipeline Behavior at Canonical Positions

*(Pre-Phase-1 snapshot for reference — see Phase 1 section above for updated values)*

### A. Mountain front (continent-continent convergence, overriding side)
- Base: ~0.55 (small dist_mountain, large dist_ocean)
- Tectonic: +0.10 to +0.25 (high stress, low sf → strong uplift)
- Interior: +0.14 → now +0.22 (high tectonicActivity)
- Noise: ridged fbm dominated, ±0.10-0.15 (full amplitude)
- **Net: ~0.85-1.0** — Realistic for high peaks

### B. 5 cells behind mountain front (overriding plate, inland)
- Base: ~0.35
- Tectonic: +0.01-0.02 (propagated stress, decayed)
- Interior: +0.14 → now ~+0.20 (high tectonicActivity near mountains)
- Noise: smooth fbm, ±0.05 → now ±0.03 (suppressed, low stressNorm)
- **Net: ~0.55** — Elevated plateau.

### C. 5 cells in front of mountain front (subducting plate side)
- Base: ~0.35 → sf suppression → ~0.30
- Tectonic: slight net depression ~-0.01
- Interior: +0.14 → now ~+0.18 (still near mountains)
- Noise: ±0.05 → ±0.03
- **Net: ~0.47** — Asymmetry vs B (0.55) now ~15%. Still subtle.

### D. 12 cells from mountain, edge of stress propagation
- Base: ~0.16
- Tectonic: -0.06 foreland dip (was -0.03)
- Interior: ~+0.15 (high tectonicActivity, still close to mountains)
- Noise: ±0.01-0.02 (heavily suppressed, stressNorm ≈ 0.02)
- **Net: ~0.25** — Lower than before (was 0.27), noticeably flat. Not a true basin yet.

### E. Deep continental interior, no nearby collisions
- Base: ~0.06
- Interior: +0.06 (zero tectonicActivity) — was +0.14
- Noise: ±0.01-0.02 (25% amplitude)
- **Net: ~0.12-0.15** — Low, flat craton. Major improvement over old 0.20.

### F-I: Unchanged from pre-Phase-1 (ocean/coast/rift positions)

---

## Part 2: Remaining Gaps

### Gap 1: Passive vs. Active Margins Are Identical
**Status**: Unchanged. Zero existing coverage in ocean floor code.

### ~~Gap 2: Continental Interiors Are Uniformly Elevated and Rough~~
**Status**: ADDRESSED by Phase 1. Interiors now range from +0.06 (craton) to +0.22 (collision plateau). Noise suppression creates visible flat/rough contrast.

### Gap 3: Foreland Basins Still Elevated
**Status**: Partially improved. The foreland dip is now -0.06 and interiors near mountains are slightly less elevated. But the harmonic-mean base elevation (+0.16 at foreland position) plus high `tectonicActivity` near mountains still keeps the foreland above sea level. **Requires Phase 2's base asymmetry to fully resolve.**

### Gap 4: Rift Valleys Are Not Valleys
**Status**: Slightly improved (lower interior uplift in quiet areas means the -0.12 depression bites deeper on plates far from collisions). Still needs structured graben geometry.

### Gap 5: Mountain Asymmetry Is Too Subtle
**Status**: Slightly improved (interior uplift is now asymmetric via tectonicActivity — overriding side gets more plateau uplift since dist_mountain extends farther there). Base elevation formula still symmetric. **Primary target for Phase 2.**

### Gap 6: Ocean Fracture Zones — unchanged
### Gap 7: Back-Arc Basins — unchanged

---

## Part 3: Stack-Ranked Implementation Plan

### Rank 1: Passive vs. Active Continental Margins
**Why #1**: Cleanest gap — zero existing coverage, high visibility, straightforward.

**Scaling**: Shelf/slope width breakpoints scale with `scaleFactor`. `dist_coast` already computed.

**Approach** (modify ocean floor section):
- Hoist the coast-type BFS (currently inside coastal roughening block) to run BEFORE the ocean floor elevation assignment. The BFS identifies whether each ocean cell's nearest coast is convergent (active) or not (passive). This avoids adding a new BFS — just reorder existing code.
- **Lesson 1 applies**: The `coastConvergent` flag must be based on actual convergent boundary cells only, not all boundary cells, to avoid over-classification.
- Replace fixed `dc` breakpoints with margin-dependent values:
  ```
  Active:  shelf end = round(3 * sf),  slope end = round(8 * sf)
  Passive: shelf end = round(10 * sf), slope end = round(22 * sf)
  ```
- Passive shelves: `-0.01 → -0.03` (shallower). Passive slopes: `-0.03 → -0.20` (gentler).
- Active margins keep current steep profile + trench behavior.

**At low res (2k, sf=0.45)**: passive shelf=5 cells, active shelf=2. Still distinguishable.

---

### Rank 2: ~~Interior Elevation Differentiation~~ — COMPLETED (Phase 1)

---

### Rank 3: Rift Valley Structure
**Why**: Net rift elevation is ~0.14-0.18 (post Phase 1) — still not a valley. Needs structured graben + shoulders.

**Scaling**: Rift width scales with `scaleFactor`. At 2k (sf=0.45): width=2 cells (simple dip). At 100k+ (sf=3.16): width=13 cells (full structure).

**Approach** (replace current flat -0.12 depression):
- BFS from divergent continent-continent boundary cells through same-plate land, max `round(4 * sf)` cells
- Structured profile: graben axis at -0.25 (must overwhelm base + interior), floor with volcanic ridged noise, shoulders at +0.05, smoothstep fadeout
- **Lesson from Phase 1**: The depression magnitude must account for the base elevation (~0.20) PLUS the tectonic-modulated interior uplift at that position. Post-Phase-1 interior at a rift far from collisions is ~+0.06, so a -0.25 graben yields net ~0.01 (sea level / rift lake). At a rift near collisions (interior ~+0.15), net ~0.10 (elevated rift, still a valley relative to shoulders at +0.05 above ambient).
- Add debug layer for rift contribution.

---

### Rank 4: Strengthen Mountain Asymmetry
**Why**: 15% asymmetry (post Phase 1) is still too subtle. The harmonic-mean base elevation is inherently symmetric and dominates. This is also the KEY ENABLER for true foreland basins (Gap 3).

**Scaling**: Operates on existing distance fields and subduction factors. No new BFS.

**Updated approach** (informed by Phase 1 learnings):
- **In base elevation**: Modulate `dist_mountain` by subduction factor:
  ```
  const sfLocal = r_subductFactor[r];
  const asymmetry = 1.0 + (sfLocal - 0.5) * 1.2;  // 0.4 (overriding) to 1.6 (subducting)
  const a_eff = (dist_mountain[r] * asymmetry) + eps;
  ```
  On the subducting side (sf > 0.5), effective mountain distance is inflated → lower base elevation → room for foreland basin.
  On the overriding side (sf < 0.5), effective distance is compressed → higher base elevation → steeper mountain front.
- **Amplify sf suppression**: Increase from `0.35` to `0.50`.
- **Foreland basin emerges**: With base elevation lowered by ~30% on the subducting side, the -0.06 foreland dip can now create genuine depressions. At foreland position: base ~0.10 (was 0.16) + interior ~0.15 (high tectonicActivity) - 0.06 dip = ~0.19. Still not a deep basin, but significantly lower than the mountain front. The contrast from mountain peak (~0.85) to foreland (~0.19) is now ~4:1.
- **Lesson 5 applies**: `r_subductFactor` is only propagated ~5-12 hops from boundaries. Beyond that, sf=0.5 and asymmetry=1.0 (neutral). This means the asymmetry effect is concentrated near collision zones — which is correct geologically.

---

### Rank 5: Post-Collision Plateau Enhancement
**Why**: Phase 1's tectonic-aware interior already creates elevation differentiation. This rank adds the flat-topped *character* of plateaus — noise suppression on the overriding side behind collisions.

**Updated approach** (leverages Phase 1 infrastructure):
- The `tectonicActivity` field from Phase 1 already identifies where plateaus should form. This rank adds:
  - Extra noise suppression for cells with high `tectonicActivity` AND on the overriding side (`sf < 0.45` where sf is propagated): multiply noise by `max(0.15, 1 - tectonicActivity * 0.85)`
  - Modest additional uplift: `+0.04 * tectonicActivity * (1 - sf)` for overriding-side cells with dist_mountain > `round(3*sf)`
- This stacks with Phase 1's tectonic-modulated interior to produce: mountain front → flat elevated plateau → gradual decline to low flat craton.
- **No new BFS needed** — reuses `tectonicActivity`, `dist_mountain`, and propagated `sf`.

---

### Rank 6: Oceanic Fracture Zones
**Why**: Zero existing coverage. Transform ocean boundaries produce no elevation effect.

**Scaling**: Width scales with `scaleFactor`. At 2k: 2 cells (line). At high res: stepped offset pattern.

**Approach** (insert in ocean elevation section):
- **Lesson 1 applies**: Seed ONLY from `btype === 3 && r_bothOcean[r]` cells (ocean transform boundaries specifically), not all transform cells.
- BFS outward through ocean plate, max `round(4 * sf)` cells.
- Depression: `-0.04 * (1 - d/maxDist)` with high-frequency directional noise.
- Offset mid-ocean ridge where fractures cross.

---

### Rank 7: Back-Arc Basins
**Why**: No existing layer produces depression behind volcanic arcs.

**Scaling**: Basin distance scales with `scaleFactor`.

**Updated approach** (informed by Lesson 3):
- Can use `dist_mountain` to identify distance from convergent boundary on the overriding side. Back-arc basin zone starts where `dist_mountain > round(5*sf)` and `dist_mountain < round(12*sf)`.
- **Lesson 5 applies**: Need to verify sf < 0.5 (overriding) at these distances. Since sf propagation extends ~12 hops on the overriding side, and back-arc starts at 5*sf, this works at sf≥1 (10k+ regions). At lower resolution, sf may have reverted to 0.5 — use `dist_mountain` finiteness as backup signal (it only propagates from overriding-side sources).
- Apply depression: smoothstep down to `-0.06 * stressNorm` at `round(8*sf)` cells, modulated by noise.
- Cells below 0 appear as marginal seas through water sphere.

---

### Rank 8: Hypsometric Distribution Correction
**Why**: Light post-processing to ensure bimodal elevation histogram.

**Scaling**: Resolution-independent (operates on values).

**Approach**: Separate histograms for ocean/land, gentle quantile remapping, light blend factor (0.25).

---

### Rank 9: Simplified Fluvial Erosion
**Why**: Highest cost, highest potential. Adds drainage valleys.

**Scaling**: Flow accumulation on mesh neighbors is inherently scale-independent. Erosion depth absolute.

**Approach**: Topological sort by elevation, steepest-descent flow routing, `elev -= EROSION_RATE * log(1 + flow)`.

---

## Recommended Implementation Phases

**Phase 1** — COMPLETED
- Tectonic-aware interior differentiation (Rank 2).
- Gaps addressed: #2 (uniform interiors), partial #3 (foreland), partial #5 (asymmetry).

**Phase 2** (Mountain systems): Ranks 4 + 5
- Strengthen asymmetry + plateau enhancement.
- Combined with Phase 1, produces complete mountain system profiles.
- **Key goal**: Rank 4's base asymmetry is the missing piece for foreland basins (Gap 3). Must be done before Rank 3 (rift valleys) to avoid tuning rift depths against a symmetric baseline that will later change.

**Phase 3** (Structural features): Ranks 1 + 3
- Passive margins + rift valleys.
- Independent zero-coverage gaps.
- Rift depths should be tuned AFTER Phase 2 modifies the base elevation asymmetry.

**Phase 4** (Ocean + refinements): Ranks 6 + 7 + 8
- Fracture zones + back-arc basins + hypsometric correction.

**Phase 5** (Advanced): Rank 9
- Fluvial erosion. Most complex, implement last.

## Verification

After each phase:
- Generate 10+ planets at 10k regions with default settings
- Test at 2k, 10k, 50k, 200k regions to verify scaling invariance
- Use debug layers to confirm new component contributes correctly
- Verify combined elevation at canonical positions matches expected values
- Check `performance.now()` stays under 300ms at 10k regions
- Verify no NaN/Infinity in output
- Visual checks per phase:
  - Phase 1: Flat quiet interiors, rough collision zones, elevated plateaus ✓
  - Phase 2: Asymmetric mountain profiles, visible foreland depressions, flat-topped plateaus
  - Phase 3: Wide passive shelves vs narrow active shelves, rift valleys with shoulders
  - Phase 4: Fracture zone lines in ocean bathymetry, back-arc depressions
  - Phase 5: Drainage valleys visible at high resolution
