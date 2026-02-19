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

### Lesson 8: Ocean Floor Depth Interacts With Multiple Positive-Elevation Layers
Phase 3 attempted to implement passive vs active continental margins by differentiating shelf/slope/abyss profiles. Passive margins were made shallower (-0.01 to -0.04 shelf) and wider (8 cells vs 3 cells). However, even after multiple rounds of deepening, false land kept appearing in the oceans.

**Root cause**: The ocean floor elevation is set early in the pipeline, but multiple subsequent layers add positive elevation — coastal roughening noise, island scattering, hotspot volcanism, and coastal domain warping. The original fixed profile (-0.02 to -0.08 shelf, -0.08 to -0.33 slope) was specifically tuned to survive these additions. Making shelves shallower broke that balance everywhere at once.

**Lesson**: Ocean floor changes cannot be made in isolation from the coastal roughening, island scattering, and hotspot systems. The ocean and coastal layers form a tightly coupled system. Any ocean floor rework needs to be holistic — adjusting depths, noise amplitudes, and island thresholds together as a coordinated change. This is why all ocean work has been moved to a dedicated phase.

**Reverted**: Passive/active margin profiles reverted to original fixed breakpoints. The coast-boundary BFS was hoisted before the main loop (structural improvement, no behavioral change). The `coastConvergent` flag infrastructure remains available for future use.

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

## Phase 3: Rift Valley Structure — COMPLETED

### What was implemented

**Rift valleys (Rank 3, at 60% strength per Lesson 6):**
1. **Rift BFS**: Pre-computed BFS from divergent continent-continent boundary cells (`btype === 2 && !r_hasOcean`) through same-plate land cells, max `RIFT_HALF_WIDTH_BASE=4 * scaleFactor` cells.
2. **Structured graben profile** replacing the old flat `-0.12` depression:
   - **Axis** (rd=0): -0.15 depression + volcanic ridged noise (amplitude 0.04)
   - **Floor** (rd=1 to `round(1.5*sf)`): -0.12 with decreasing volcanic texture
   - **Shoulders** (`floorEnd` to `round(2.5*sf)`): +0.03 modest uplift flanking the graben
   - **Fadeout** (beyond shoulders): smoothstep to ambient (guarded against division by zero when `riftHalfWidth == shoulderEnd` at low resolution)
3. **Graceful degradation**: At 2k regions (sf=0.45): axis + 1 floor cell + 1 shoulder cell, no fadeout zone. At 100k+ (sf=3.16): full 13-cell-wide structure with graben, floor, shoulders, and smooth transition.

**Coast-boundary BFS hoisted**: Moved from inside the coastal roughening block to before the main elevation loop. Structural cleanup — same logic, same data, just available earlier.

### Gap status update

**Gap 1 (Passive vs Active Margins)**: Covered by Ocean Rework (see `OCEAN_REWORK_PLAN.md`).

**~~Gap 4 (Rift Valleys)~~**: ADDRESSED by Phase 3. Structured graben with axis depression (-0.15), volcanic floor texture, and flanking shoulders (+0.03). With Phase 1's reduced interior uplift (+0.06 for quiet areas), the rift axis should produce actual depressions.

---

## Part 2: Remaining Gaps

### ~~Gap 1: Passive vs. Active Margins Are Identical~~
**Status**: Covered by Ocean Rework (`OCEAN_REWORK_PLAN.md`).

### ~~Gap 2: Continental Interiors Are Uniformly Elevated and Rough~~
**Status**: ADDRESSED by Phase 1.

### Gap 3: Foreland Basins Still Elevated
**Status**: Significantly improved by Phases 1+2. Base asymmetry + foreland dip + tectonic-aware interior create a visible low zone at the stress edge on the subducting side. Not yet a deep basin but the profile is qualitatively correct: mountain → steep drop → low foreland → gradual rise to interior.

### ~~Gap 4: Rift Valleys Are Not Valleys~~
**Status**: ADDRESSED by Phase 3. Structured graben profile with axis, floor, shoulders, and fadeout.

### ~~Gap 5: Mountain Asymmetry Is Too Subtle~~
**Status**: ADDRESSED by Phase 2. ~25-30% asymmetry, visible in base and normal views.

### ~~Gap 6: Ocean Fracture Zones~~
**Status**: Covered by Ocean Rework (`OCEAN_REWORK_PLAN.md`).

### Gap 7: Back-Arc Basins — unchanged

---

## Part 3: Remaining Implementation Plan (Land-focused)

Ocean work (margins, fracture zones, ridges, coastal roughening differentiation) is in `OCEAN_REWORK_PLAN.md`.

### Rank 7: Back-Arc Basins
**Why**: No existing layer produces depression behind volcanic arcs. Primarily affects land/coast.

**Scaling**: Basin distance scales with `scaleFactor`.

**Approach**: Identify overriding-plate cells 5-12 cells behind convergent ocean-continent boundaries. Apply smoothstep depression `-0.03 * stressNorm` (per Lesson 6). Cells below 0 appear as marginal seas.

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

**Phase 3** — COMPLETED
- Rift valley structure (Rank 3). Passive margins attempted but reverted (Lesson 8).
- Gaps addressed: #4 (rift valleys).

**Phase 4** (Land refinements): Ranks 7 + 8 + 9
- Back-arc basins + hypsometric correction + simplified fluvial erosion.
- These primarily affect land elevation values.

**Ocean Rework** — See `OCEAN_REWORK_PLAN.md`
- Covers margins, ridges, fracture zones, and coastal roughening differentiation as a coordinated system.

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
  - Phase 3: Rift valleys with shoulders ✓ (passive margins deferred)
  - Phase 4: Bimodal elevation histogram, drainage valleys at high resolution
  - Phase 5: Wide passive shelves vs narrow active shelves, fracture zone lines, back-arc depressions
