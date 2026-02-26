# Seasonal Wind Simulation — Pressure-Driven with Longitude-Varying ITCZ

## Context

World Orogen has zero climate/atmospheric simulation. This adds seasonal wind driven by high/low pressure zones — the core physical mechanism behind all planetary wind. The ITCZ (low pressure convergence) tracks a longitude-varying "thermal equator" that hugs the equator over ocean but pushes 15-20° poleward over continents, creating monsoons and seasonal wind reversals. Inspired by Worldbuilding Pasta's climate methodology and Madeline James's pressure band approach.

---

## Algorithm

### Step 1: Compute the Thermal Equator / ITCZ Latitude (per season)

The ITCZ is NOT at a fixed latitude — it follows the hottest zone at each longitude.

**Approach**: Sample ~72 evenly-spaced longitudes (every 5°). At each longitude, scan latitudes from -30° to +30° to find the thermal maximum, then smooth with a periodic spline.

For each longitude sample, compute an "effective heating" at each latitude:
```
heating(lat, lon, season) = solarFlux(lat, season)
                          × (1 + 0.3 * landFraction(lat, lon, radius=10°))
                          - 0.006 * avgElevation(lat, lon, radius=10°)
```

Where:
- `solarFlux(lat, season)` = `cos(lat - subsolarLat)` clamped to [0,1]. `subsolarLat = tilt * sin(seasonAngle)` — 23.5° in summer, -23.5° in winter
- `landFraction` is sampled by scanning nearby regions within a ~10° great-circle radius. Land amplifies heating by up to 30% (land heats faster than ocean — Madeline James's core insight)
- `avgElevation` applies a lapse-rate cooling for high terrain

The latitude with maximum heating at each longitude = ITCZ position at that longitude.

**Result constraints** (inspired by both references):
- Over ocean: ITCZ stays ~5° from equator in summer hemisphere
- Over large land: ITCZ pushes to 15-20° from equator
- Default with no land: ~5° toward summer hemisphere (Earth's observed default)

**Smoothing**: Fit a periodic cubic spline through the 72 longitude samples. This guarantees smooth, non-jagged ITCZ contours.

**Data structure**: `itczLatAtLon(lon)` — returns ITCZ latitude in radians for any longitude.

### Step 2: Build Pressure Field (per season, per region)

Five additive components centered on the ITCZ position:

**a) ITCZ Low** (follows the thermal equator):
```
p_itcz = -15 * exp(-0.5 * ((lat - itczLat(lon)) / σ_itcz)²)
```
σ_itcz = 8° (~0.14 rad). A broad Gaussian trough that tracks the ITCZ.

**b) Subtropical Highs** (~25° winter, ~35° summer — per Worldbuilding Pasta):
- NH subtropical high at `+30 + seasonShift*5` degrees
- SH subtropical high at `-30 - seasonShift*5` degrees
- These are NOT a continuous belt — they're strongest over cool ocean. Modulate intensity:
  ```
  highIntensity = 12 * (1 - 0.3 * landFraction)  // weaker over hot land
  ```
- Gaussian with σ = 10°

**c) Subpolar Lows** at ~±60°:
```
p_subpolar = -10 * exp(-0.5 * ((lat ∓ 60°) / 10°)²)
```

**d) Polar Highs** at ~±85°:
```
p_polar = +8 * exp(-0.5 * ((lat ∓ 85°) / 8°)²)
```

**e) Land/Sea Thermal Modifier** (seasonal continental pressure — Madeline James):
- Summer hemisphere continents: thermal low (up to -8 hPa at mid-latitudes)
- Winter hemisphere continents: thermal high (up to +6 hPa)
- Modulated by `sin(2 * |lat|)` (peaks at 45°, weak at equator/poles)
- Scaled by land fraction in local area

**f) Elevation (barometric)**:
```
p_elev = -100 * max(0, elevation)
```
High plateaus = persistent low pressure. Mountains deflect wind naturally.

**g) Noise**: Low-frequency seeded Simplex fBm, ±2 hPa amplitude.

**h) Smoothing**: 3 Laplacian passes over mesh neighbors. Removes discretization artifacts and naturally diffuses land/sea contrast inward from coasts.

### Step 3: Compute Pressure Gradient (per region)

Least-squares fit over mesh neighbors, projecting onto local tangent plane:

For each region r with neighbors n₁..nₖ:
- Project displacement (nᵢ - r) onto east/north tangent vectors
- Accumulate `Σ(δe·δp)/Σ(δe²)` for eastward gradient, same for northward
- This gives `gradE`, `gradN` in the tangent plane

### Step 4: Pressure → Wind with Cross-Equatorial Handling

**Core conversion**: PGF direction = `-∇P` (high→low). Coriolis rotates this.

**The key insight for cross-equatorial flow**: `f = 2Ω·sin(lat)` naturally changes sign at the equator. We use this directly — no special-casing needed for monsoon winds. The SE trades in the SH (deflected left by negative f) naturally become SW monsoon winds in the NH (deflected right by positive f) as they cross the equator chasing the ITCZ.

**Implementation**:
```
f_coriolis = sin(lat)  // proportional to Coriolis parameter
absSinLat = |f_coriolis|

// Geostrophic deflection angle: 0° at equator → 70° at mid-latitudes
// Ramps up over ~10° latitude (equatorial Rossby radius)
geoAngle = 70° * smoothstep(0, sin(10°), absSinLat)

// Surface friction: turns wind 20° back toward low pressure, reduces speed 40%
frictionAngle = 20°

// Net rotation from PGF: sign determines NH (right) vs SH (left)
sign = (lat >= 0) ? +1 : -1
totalAngle = sign * (geoAngle - frictionAngle)

// Rotate PGF vector
windE = pgfE·cos(totalAngle) - pgfN·sin(totalAngle)
windN = pgfE·sin(totalAngle) + pgfN·cos(totalAngle)

// Speed reduction from friction
wind *= 0.6
```

**Why this works for cross-equatorial flow**:
- At 10°S: sign=-1, geoAngle≈70° → rotation = -50° (leftward). SE trades.
- At 0°: geoAngle=0° → no rotation. Wind follows PGF directly (northward toward ITCZ).
- At 5°N: sign=+1, geoAngle≈35° → rotation = +15° (rightward). Wind turns from S to SW.
- At 10°N: sign=+1, geoAngle≈70° → rotation = +50°. Full SW monsoon westerlies.

The transition happens naturally over ~10° of latitude — smooth, physically correct, no heuristic needed.

### Step 5: Normalize

Scale wind speed to 0-1 using 95th percentile for visualization.

### Coordinate Convention

Map projection uses Y-up: `lat = asin(r_xyz[3*r+1])`, `lon = atan2(r_xyz[3*r], r_xyz[3*r+2])`.

Tangent frame (Y-up polar axis):
- East = normalize(z, 0, -x) [fallback at poles where x²+z² < ε]
- North = cross(position, east)

---

## File Changes

### New: `js/wind.js` (~300 lines)

Exported:
- `computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, noise, axialTilt=23.5)`
  → returns pressure/wind arrays for both seasons

Internal helpers:
- `computeITCZ(lonSamples, r_xyz, r_elevation, r_isLand, season, tilt)` — scan latitudes per longitude, find thermal max, return spline
- `evaluateITCZSpline(lon, splineData)` — periodic cubic interpolation
- `zonalPressure(lat, lon, itczSpline, season, landFrac)` — all Gaussian bands + thermal modifier
- `smoothPressure(mesh, pressure, passes)` — Laplacian over neighbors
- `computeGradients(...)` — least-squares pressure gradient
- `pressureToWind(gradE, gradN, sinLat)` — geostrophic + friction + cross-equatorial

### Modified: `js/planet-worker.js` (~25 lines)

- Import `computeWind` from `./wind.js`
- In `handleGenerate`: call after terrain post-processing, before triangle elevations. Add pressure/speed arrays to `debugLayers`, add wind vectors to result + transfer list. Store in retained state `W`.
- In `handleReapply`: recompute wind (elevation changed)
- In `handleEditRecompute`: recompute wind (plates/elevation changed)

### Modified: `js/generate.js` (~15 lines)

- In `case 'done'`, `'reapplyDone'`, `'editDone'`: store wind vectors in `state.curData`
- In synchronous fallback: call `computeWind` directly

### Modified: `index.html` (~4 lines)

Add to `#debugLayer` select:
```html
<option value="pressureSummer">Pressure (Summer)</option>
<option value="pressureWinter">Pressure (Winter)</option>
<option value="windSpeedSummer">Wind Speed (Summer)</option>
<option value="windSpeedWinter">Wind Speed (Winter)</option>
```

### Modified: `js/planet-mesh.js` (~100 lines)

- `buildWindArrows(season)`: subsample ~400 regions, draw line segments for wind direction/magnitude
- **Globe view**: 3D arrows on sphere at r=1.07, oriented via tangent frame
- **Map view**: 2D arrows on equirectangular projection
- Auto-shown when any wind/pressure debug layer is selected
- Season inferred from selected layer name

### Modified: `js/main.js` (~15 lines)

- Wire debug layer change → show/hide wind arrows
- Toggle arrows on globe/map mode switch
- Dispose arrows on new generation

### Modified: `js/state.js` (~2 lines)

- Add `windArrowGroup: null`

### Modified: `README.md`

- Document wind simulation, debug layers, wind arrows

### NOT modified: `js/planet-code.js`

No new sliders (axial tilt fixed at 23.5°).

---

## Performance Budget (200K regions)

| Step | Estimated Time |
|------|---------------|
| ITCZ computation (72 lon samples × lat scan) | ~15ms |
| Precompute lat + tangent frames | ~5ms |
| Pressure field (2 seasons) | ~20ms |
| Noise perturbation (2 seasons) | ~30ms |
| Smoothing (3 passes × 2) | ~20ms |
| Gradient computation (2 seasons) | ~25ms |
| Pressure → wind (2 seasons) | ~10ms |
| **Total** | **~125ms** |

Well within 500ms target. ITCZ computation adds ~15ms (scanning regions in geographic bins).

---

## Verification

### Visual checks
1. **Pressure (Summer)**: Blue ITCZ band that hugs ~5° over ocean but pushes 15-20° north over continents. Red subtropical highs at ~30-35° (weaker over continents). Blue subpolar lows at ~60°.
2. **Pressure (Winter)**: ITCZ shifts south, NH continents show red (thermal highs). Subtropical highs at ~25° (shifted equatorward).
3. **Wind arrows (Summer)**: NE trades in NH tropics, SE trades in SH tropics. Westerlies at 40-60°. Near large NH continents: SW monsoon winds where SH trades cross the equator.
4. **Cross-equatorial test**: Find a longitude where ITCZ is at ~15°N (over land). Verify arrows: SE at 10°S → S at equator → SW at 5°N → W at 15°N.
5. **Season comparison**: Toggle between summer/winter pressure layers. Verify ITCZ migration and continental pressure reversal.

### Performance
- Console timing: wind step < 200ms at 200K, < 500ms at 640K

### Determinism
- Same seed → identical pressure/wind arrays
