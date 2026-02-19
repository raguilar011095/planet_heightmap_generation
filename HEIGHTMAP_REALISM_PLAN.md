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
Phase 1's interior uplift fix reduced the uniform +0.14 and increased the foreland dip from -0.03 to -0.06. But the harmonic-mean base elevation still contributes ~+0.16 at the foreland position, and `dist_mountain`-based tectonic activity is high there (close to mountains). The foreland dip alone cannot overcome base + tectonic-modulated interior. True foreland depressions require base elevation asymmetry — lowering the base on the subducting side so there's room for a basin.

### Lesson 5: r_subductFactor Propagation Range Is Limited
`r_subductFactor` is only propagated as far as stress reaches (~5 hops on subducting side due to aggressive decay, ~12 hops on overriding side). Beyond propagation range, sf = default 0.5. This means sf cannot be used to distinguish overriding vs subducting sides at distances beyond stress propagation. Features that need side-awareness at longer range must use other signals (e.g., `dist_mountain` is finite only on the overriding side of continent-continent collisions where sf < 0.55).

### Lesson 6: Stacking Effects Compound — Start at 60% Strength
Phase 2's asymmetry and plateau effects were initially implemented at full planned strength (asymmetry multiplier 1.2, sf suppression 0.50, plateau noise floor 0.15, plateau uplift 0.04). When combined with the existing sf suppression, differential stress decay, and Phase 1's tectonic-aware interior, the visual effect was too aggressive — mountains looked unnaturally skewed and plateaus too flat.

**Fix**: Toned all parameters to roughly 60% of planned values (asymmetry 0.8, suppression 0.42, noise floor 0.30, uplift 0.025). This produced a convincing in-between that enhances the existing pipeline without dominating it.

**Rule for future features**: When adding new effects that stack with existing mechanisms, start at 50-60% of the theoretically "correct" value and tune from there. The pipeline is multiplicative — each layer compounds on previous ones. Paper-napkin math that considers layers in isolation will overestimate the needed strength.

### Lesson 7: Plateau Detection Via sf < 0.45 Works Within Stress Range
The `isPlateauZone` flag uses `sf < 0.45` (overriding side) AND `dMtn > plateauStart` AND `dMtn finite`. Since sf is propagated ~12 hops on the overriding side (Lesson 5), this correctly identifies plateau regions within the stress influence zone. Beyond that, sf reverts to 0.5 and the cell is no longer flagged as a plateau — it falls back to Phase 1's `tectonicActivity`-based interior uplift, which provides a smooth transition. The two systems complement each other: sf-based plateau zone for structured flat character near collisions, tectonicActivity-based interior for gradual elevation decline farther out.

---

## Phase 1: Tectonic-Aware Interior — COMPLETED

### What was implemented
1. **Tectonic-modulated interior uplift**: Replaced uniform `+0.14` with `0.06 + tectonicActivity * 0.16`. Uses `dist_mountain` with quadratic decay over `TECTONIC_REACH_BASE=20 * scaleFactor` cells. Range: +0.06 (quiet craton) to +0.22 (collision-backed plateau).
2. **Noise amplitude scaling**: `noiseScale = 0.25 + 0.75 * min(1, stressNorm * 4)`. Quiet interiors get 25% noise (visibly flat), collision zones get full roughness.
3. **Foreland dip increase**: Zone widened from `stressNorm < 0.05` to `< 0.10`, max depression increased from `-0.03` to `-0.06` with linear falloff.
4. **Debug layer**: "Tectonic Activity" added showing the `tectonicActivity` field.

---

## Phase 2: Mountain Asymmetry + Plateau Enhancement — COMPLETED

### What was implemented

**Rank 4 — Mountain Asymmetry (toned to 60% strength per Lesson 6):**
1. **Base elevation asymmetry**: `dist_mountain` multiplied by `1.0 + (sf - 0.5) * 0.8` before feeding into harmonic-mean formula. Range: 0.6 (overriding, compressed) to 1.4 (subducting, inflated). This shifts the distance-field ridge peak toward the subducting side.
2. **SF suppression amplified**: Increased from `0.35` to `0.42` (was planned at 0.50). Subducting-side elevation gets up to 42% suppression.

**Rank 5 — Plateau Enhancement (toned to 60% strength per Lesson 6):**
3. **`tectonicActivity` moved early**: Computed before the noise section so it can drive plateau noise suppression.
4. **Plateau zone detection**: `isPlateauZone = sf < 0.45 && dMtn finite && dMtn > plateauStart` where `plateauStart = max(2, round(3 * scaleFactor))`.
5. **Plateau noise suppression**: In plateau zones, noise additionally multiplied by `max(0.30, 1 - tectonicActivity * 0.60)`. Creates flat-topped character without making plateaus completely featureless.
6. **Plateau uplift boost**: `+0.025 * tectonicActivity * (1 - sf)` for plateau cells with tectonicActivity > 0.1. Tracked in interior debug layer.

### Updated canonical positions (post Phase 2)
- **Position A** (mountain front, overriding): Base now higher due to compressed dist_mountain (asymmetry 0.6x). Net ~0.90-1.05. Slightly higher peaks on overriding side. ✓
- **Position B** (5 cells behind mountain, overriding): Plateau boost + noise suppression. Net ~0.55-0.58. Flat elevated plateau. ✓
- **Position C** (5 cells in front, subducting): Base now lower due to inflated dist_mountain (asymmetry 1.4x) + stronger sf suppression. Net ~0.38-0.42. Asymmetry vs B is now ~25-30%. ✓
- **Position D** (foreland, stress edge): Base lowered ~15% on subducting side. Net ~0.20-0.22. Still not a true basin but notably lower. The mountain→foreland contrast is now ~4:1.
- **Position E** (deep interior): Unchanged from Phase 1 (sf=0.5 → asymmetry=1.0). Net ~0.12-0.15.

### Remaining gap status update

**Gap 3 (Foreland Basins)**: Improved. The base asymmetry lowers the subducting-side base by ~15%. Combined with the -0.06 foreland dip, the foreland is now visibly lower than surrounding terrain. Not yet a deep basin (~0.20 vs mountain ~0.90) but the contrast is significant.

**Gap 5 (Mountain Asymmetry)**: ADDRESSED. Asymmetry is now ~25-30% between overriding and subducting sides, up from ~10% pre-Phase-1 and ~15% post-Phase-1. Visible in the base debug layer as a shifted ridge peak.

---

## Part 2: Remaining Gaps

### Gap 1: Passive vs. Active Margins Are Identical
**Status**: Unchanged. Zero existing coverage in ocean floor code. **Next target (Phase 3).**

### ~~Gap 2: Continental Interiors Are Uniformly Elevated and Rough~~
**Status**: ADDRESSED by Phase 1.

### Gap 3: Foreland Basins Still Elevated
**Status**: Significantly improved by Phases 1+2. Base asymmetry + foreland dip + tectonic-aware interior create a visible low zone at the stress edge on the subducting side. Not yet a deep basin but the profile is qualitatively correct: mountain → steep drop → low foreland → gradual rise to interior.

### Gap 4: Rift Valleys Are Not Valleys
**Status**: Slightly improved (lower interior uplift in quiet areas). Still needs structured graben. **Target for Phase 3.**

### ~~Gap 5: Mountain Asymmetry Is Too Subtle~~
**Status**: ADDRESSED by Phase 2. ~25-30% asymmetry, visible in base and normal views.

### Gap 6: Ocean Fracture Zones — unchanged
### Gap 7: Back-Arc Basins — unchanged

---

## Part 3: Remaining Implementation Plan

### Rank 1: Passive vs. Active Continental Margins
**Why**: Cleanest remaining gap — zero existing coverage, high visibility, straightforward.

**Scaling**: Shelf/slope width breakpoints scale with `scaleFactor`. `dist_coast` already computed.

**Approach** (modify ocean floor section):
- Hoist the coast-type BFS (currently inside coastal roughening block) to run BEFORE the ocean floor elevation assignment. The BFS identifies whether each ocean cell's nearest coast is convergent (active) or not (passive). This avoids adding a new BFS — just reorder existing code.
- **Lesson 1 applies**: The `coastConvergent` flag must be based on actual convergent boundary cells only, not all boundary cells, to avoid over-classification.
- **Lesson 6 applies**: Start with moderate differentiation between active and passive profiles. The current shelf/slope/abyss breakpoints (5/12/12+ cells) should be the midpoint — active margins slightly narrower, passive margins moderately wider. Don't make passive shelves 3x wider right away; try 1.5-2x first.
- Replace fixed `dc` breakpoints with margin-dependent values:
  ```
  Active:  shelf end = round(3 * sf),  slope end = round(8 * sf)
  Passive: shelf end = round(8 * sf),  slope end = round(18 * sf)
  ```
- Passive shelves: `-0.01 → -0.04` (shallower). Passive slopes: `-0.04 → -0.22` (gentler).
- Active margins keep current steep profile + trench behavior.

**At low res (2k, sf=0.45)**: passive shelf=4 cells, active shelf=2. Still distinguishable.

---

### Rank 3: Rift Valley Structure
**Why**: Net rift elevation is ~0.10-0.16 (post Phases 1+2, depending on context) — still not a valley. Needs structured graben + shoulders.

**Scaling**: Rift width scales with `scaleFactor`. At 2k (sf=0.45): width=2 cells (simple dip). At 100k+ (sf=3.16): width=13 cells (full structure).

**Approach** (replace current flat -0.12 depression):
- BFS from divergent continent-continent boundary cells through same-plate land, max `round(4 * sf)` cells
- Structured profile: graben axis at -0.25 (must overwhelm base + interior), floor with volcanic ridged noise, shoulders at +0.05, smoothstep fadeout
- **Lesson 6 applies**: Start at 60% of planned depression values. Graben at -0.15 instead of -0.25, shoulders at +0.03 instead of +0.05. The current -0.12 flat depression is already doing something — the structured profile needs to be notably stronger but not 2x.
- **Post-Phase-2 context**: Base elevation at a rift depends on the asymmetry factor. Since rifts are on divergent boundaries (not convergent), sf at rift cells may not have been set by collision stress propagation. Rift cells have their own `btype === 2` and their sf is from local density differences, not from collision propagation. Test to confirm sf values at rift boundaries before assuming asymmetry applies.
- Add debug layer for rift contribution.

---

### Rank 6: Oceanic Fracture Zones
**Why**: Zero existing coverage. Transform ocean boundaries produce no elevation effect.

**Scaling**: Width scales with `scaleFactor`. At 2k: 2 cells (line). At high res: stepped offset pattern.

**Approach** (insert in ocean elevation section):
- **Lesson 1 applies**: Seed ONLY from `btype === 3 && r_bothOcean[r]` cells.
- BFS outward through ocean plate, max `round(4 * sf)` cells.
- **Lesson 6 applies**: Start with subtle depression `-0.02 * (1 - d/maxDist)` rather than -0.04.
- Offset mid-ocean ridge where fractures cross.

---

### Rank 7: Back-Arc Basins
**Why**: No existing layer produces depression behind volcanic arcs.

**Scaling**: Basin distance scales with `scaleFactor`.

**Updated approach** (informed by Phase 2):
- Phase 2's `isPlateauZone` already identifies overriding-side cells behind collision fronts. Back-arc basins form in a similar region but DEEPER behind the arc (farther from the collision front). Can use `dist_mountain` ranges beyond the plateau zone.
- **Lesson 7 applies**: The sf < 0.45 check works within stress propagation range (~12 hops on overriding side). Back-arc basins starting at `round(8*sf)` may be at the edge of sf propagation at lower resolutions. Use `dMtn finite` as the primary signal, sf < 0.5 as secondary.
- **Lesson 6 applies**: Start with gentle depression `-0.03 * stressNorm` rather than -0.06. Let it compound with Phase 1's reduced interior uplift at those distances.
- Apply smoothstep depression modulated by noise. Cells below 0 appear as marginal seas.

---

### Rank 8: Hypsometric Distribution Correction
**Why**: Light post-processing to ensure bimodal elevation histogram.

**Scaling**: Resolution-independent (operates on values).

**Approach**: Separate histograms for ocean/land, gentle quantile remapping, light blend factor (0.25).
- **Lesson 6 applies**: Use a very light blend (0.15-0.20) to avoid washing out the structural improvements from Phases 1-3.

---

### Rank 9: Simplified Fluvial Erosion
**Why**: Highest cost, highest potential. Adds drainage valleys.

**Scaling**: Flow accumulation on mesh neighbors is inherently scale-independent. Erosion depth absolute.

**Approach**: Topological sort by elevation, steepest-descent flow routing, `elev -= EROSION_RATE * log(1 + flow)`.
- **Lesson 6 applies**: Start with EROSION_RATE = 0.004 (half of planned 0.008). The Phase 1 noise suppression already creates smooth interiors — erosion on top of that might create overly deep valleys in quiet areas.

---

## Recommended Implementation Phases

**Phase 1** — COMPLETED
- Tectonic-aware interior differentiation (Rank 2).
- Gaps addressed: #2 (uniform interiors), partial #3 (foreland), partial #5 (asymmetry).

**Phase 2** — COMPLETED
- Mountain asymmetry (Rank 4) + plateau enhancement (Rank 5), toned to 60% strength.
- Gaps addressed: #5 (asymmetry), further progress on #3 (foreland).

**Phase 3** (Structural features): Ranks 1 + 3
- Passive margins + rift valleys.
- Independent zero-coverage gaps.
- Rift depths should use the post-Phase-2 baseline (now asymmetric).
- **Note**: These are the last two features that create major new geological structures. After this, the planet's macro-scale elevation profile should be geologically complete.

**Phase 4** (Ocean + refinements): Ranks 6 + 7 + 8
- Fracture zones + back-arc basins + hypsometric correction.
- These add secondary detail and statistical polish.

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
  - Phase 2: Asymmetric mountain profiles, visible foreland contrast, flat-topped plateaus ✓
  - Phase 3: Wide passive shelves vs narrow active shelves, rift valleys with shoulders
  - Phase 4: Fracture zone lines in ocean bathymetry, back-arc depressions
  - Phase 5: Drainage valleys visible at high resolution
