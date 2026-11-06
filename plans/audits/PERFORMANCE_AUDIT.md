# World Orogen — performance audit (2026-11-06)

Branch `audits` (b15e965, the redesign PR #147 on main). Every number below was measured on the development desktop
(Ryzen 7 9800X3D, 8 cores / 16 threads, 62 GB, RTX 5070 Ti) in the installed Chrome, headless `new` on the real GPU
(renderer string `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti … Direct3D11 …)`), against scratch copies of the branch
(`git archive HEAD`; the instrumented copy only adds a `window.__evo` hook to reach the page's state). No repo file was
edited. Scripts: `v2/out/audits/perf-scripts/` (local only, not in git); raw results, CPU profiles and memory traces:
`v2/out/audits/perf-data/`. One heavy job ran at a time; timings vary ±10–20 % run to run.

Memory is reported three ways and they are not interchangeable: **renderer private** (the OS's private bytes of the
renderer process: the page, every worker and their garbage), **total private** (all of this browser's processes: the
renderer, the GPU process, the browser), and per-thread **JS heap + ArrayBuffer backing** (CDP `Runtime.getHeapUsage`
on the page and on each worker). The worker numbers are taken without forcing their GC, so right after a heavy job they
include garbage; "settled" figures are taken later.

## Summary

**Verdict.** The live experience is in good shape: playback, scrubbing, turning the globe, the map, the projections,
and zooming and panning the fine-detail tiles at 10M all run at the display's rate with no long tasks. Generate and
Import meet their "seconds" targets at their default detail. What is not in good shape is **everything that happens on
a detailed moment, and the 10M detail itself**:

1. **Add detail at 10M takes 183 s (149 s with the mesh already built), not "~1 min"** as the menu says, and ~85 % of
   that time runs on **one thread** of the finish worker while seven cores sit idle. Its per-cell stages (the final
   climate, the deposits, the rocks, the picture) are independent cell by cell and could run on the finish's own worker
   pool **exactly** — the biggest lever here (est. −55 to −60 s at 10M, −15 s at 2.5M).
2. **The main thread repaints detailed moments on the CPU**: every view switch, palette, season or Food chip on a
   detailed moment freezes the page for 0.2–1.6 s; the Satellite view is drawn ahead on the main thread (~10 s of the
   page's CPU after every Add detail).
3. **Export runs on the main thread**: "Export all" at 10M froze the page for 235 of its 238 s; a single 16384-px colour
   map froze it for 10.5 s and pushed the browser to **11.6 GB** (6 GB in the GPU process).
4. **Memory**: the previous detailed moment stays in memory after **New world** (a real retention: +650 MB at 640K,
   ~600 MB+ at 10M), the finish worker keeps ~740 MB of 10M meshes for the rest of the session, and a second 10M detail
   peaks at **6.9 GB** in the renderer (7.9 GB browser-wide).

None of the top items needs an approximation. The seven approximations in `plans/V2_PERFORMANCE_PLAN.md` concern the
history and live playback; these measurements do not change their case (see "The plan's approximations" below).

### Baseline

| Measurement | Value | How measured | Runs |
|---|---|---|---|
| **Page load**, local Pages-like server (gzip, ETag, max-age 600; HTTP/1.1), unthrottled — Studio / Generate / Import / Evolution | FCP 236 / 312 / 352 / 304 ms; requests 29 / 128 / 126 / 195; on the wire 1.77 / 1.18 / 1.48 / 1.42 MB (decoded 1.9 / 3.6 / 3.9 / 4.3 MB) | `page-load.mjs`, CDP Network, fresh profile | 1 cold + 1 warm each |
| Page load, warm (within max-age) | FCP 92 / 100 / 68 / 68 ms; 0 bytes on the wire | same | 1 |
| Page load on "4G" (150 ms RTT, 1.6 Mbps, CPU 4×), cold, local HTTP/1.1 | DOMContentLoaded 1.1 / 7.9 / 7.5 / 9.6 s; Studio `load` 10.8 s (images) | same, CDP network + CPU throttling | 1 |
| Same, revalidated (max-age expired: every module a 304) | DCL 0.7 / 4.3 / 4.0 / 5.9 s (35–51 KB on the wire) | same, server with max-age 0 | 1 |
| Evolution on 4G against production (orogen.studio, HTTP/2, older main) | DCL 7.7 s cold, 0.65 s warm; first frame drawn 11.7 s / 3.8 s | same | 1 |
| Module graph (static) | Evolution page: 166 modules, 2.68 MB raw, 906 KB gzip, import chain 6 deep (+ three.js 1.3 MB from jsDelivr); Generate 110 modules / 681 KB gz; Import 107 / 665 KB gz | `module-graph.mjs` (breadth-first) | — |
| **Generate**, default code `00001641lx5ilk8fg5tsw3` (204K regions): first picture | 4.8 s after navigation (worker 4.2 s, of which "Raising the ground" 3.3 s) | `gen.mjs`, worker progress messages | 2 (4.79 / 4.79 s) |
| Generate: the finish (Satellite, climate, geology, food unlocked) | 10.4 s after the first picture (climate 3.2 s, picture 1.8 s, final climate 1.1 s) | console `[generate] finished in` | 4 (10.2–10.4 s) |
| Generate: plate edit + Rebuild / slider + Reapply | 2.96 s / 2.27 s to the picture, then 10.2 s finish each | `gen.mjs` | 1 |
| Generate: views' first paint (Satellite / Köppen / Geology / Food / Plates / Terrain) | 1013 / 153 / 101 / 406 / 53 / 74 ms (each one long task) | click → two frames, CDP long tasks | 1 |
| Generate: globe auto-rotate; map; projection change | 144 fps, p99 7.1 ms; first switch to the map 747 ms long task; a projection change 11–13 ms | rAF recorder | 1 |
| Generate: Ctrl-hover over pieces (finished world) | each piece entered repaints the whole picture on the CPU: 71 ms mean (max 82 ms); frame p99 54 ms | rAF + paint timing | 1 |
| Generate: exports — heightmap 16384 / colour 16384 / Export all at 4096 (143 files) | 14.1 s (6.2 s freeze) / 16.7 s (6.9 s freeze, **8.6 GB** browser peak) / 55 s (main thread blocked 48.9 s) | export panel driven; long tasks; OS private bytes | 1 |
| Generate at most detail (2.56M) | first picture 32.5 s ("Raising the ground" 24.6 s), finish 44.1 s more (picture 11.1 s); Satellite first open 2.9 s freeze | `gen.mjs` | 1 |
| **Import**, default Earth (204K) | first picture 1.0 s; finish 7.8 s; climate knob → whole finish again 8.3 s; Reapply 0.22 s + 8.1 s | `imp.mjs` | 1 |
| **Evolution history**, the long link (40K, 1200 Myr, `more=1600`) | 81.7 s in the worker for 1200 Myr; to 1600 Myr (the link's extension) at 111 s / 131 s after load | console lines + polling | 2 |
| Evolution: first frame simulated / drawn | 0.9 s / 2.3 s | console | 1 |
| Evolution: renderer memory while the history builds | peak 3.8 GB private (8 terrain workers ~1 GB of arrays, mostly garbage); 1.4 GB once collected | OS sampler (1 s) + CDP heaps | 2 |
| Playback (20 s, rate 25) / scrub (6 s, 60 Hz) | 127 fps, p99 8.6 ms, 0 long tasks; a new frame's paint 0.4 ms (GPU) / scrub 350 paints, 0.27 ms each, 0 long tasks | rAF recorder, paint wrapper | 1 |
| **Add detail 2.5M** (the end, 1600 Myr) | **44.0 s**: surface 8.4, climate 3.2, bedrock 1.6, rivers 3.6, water 2.2, geology 2.2, **final climate 7.5, deposits 4.5, picture 6.2**; peak renderer 3.8 GB; the moment 422 MB | console `[evolution] finish of …` with its `ms` | 1 (the owner's ~45 s) |
| **Add detail 10M**, first (mesh built after choosing 10M) | **183.5 s**: surface 26.0, climate 5.6, bedrock 6.6, rivers 22.3, sediment 3.0, ice 3.4, wind 1.6, sea 6.1, water 14.5, geology 9.5, **final climate 32.7, deposits 18.2**, farming 3.5, **picture 11.7**; ~17 s of mesh before the stages | same + finish-worker CPU profile | 1 |
| Add detail 10M, second moment (800 Myr, mesh kept) | **148.7 s** (same stage shape) | same | 1 |
| Peak memory at 10M | first: renderer **5.5 GB**, browser 6.2 GB; second (old moment kept meanwhile): renderer **6.9 GB**, browser **7.9 GB**; GPU process ≤ 0.9 GB | OS sampler | 2 |
| Memory held after 10M | the moment 522 MB (picture 347, climate 167, rivers 8); page arrays 1.25–1.30 GB; finish worker 2.7 GB right after, **740 MB settled** (the 10M meshes) | CDP heaps | 2 |
| Views' first paint after 2.5M / 10M (Satellite, Köppen, Geology, Food, Terrain) | 1540 / 434 / 355 / 1356 / 244 ms — 1641 / 416 / 416 / 1441 / 469 ms (each a single long task) | click → two frames | 1 each |
| Satellite drawn ahead after Add detail | 8.9 s (2.5M) / 12.4 s (10M) for the season shown; ~10 s of main-thread CPU for the three seasons | polling `pv.satPrep`; CPU profile | 2 |
| Zoom and pan at 10M (fine-detail tiles) | globe at closest zoom: level 6, 40 tiles, sharp by the end of the camera's ease (≤ 1.2 s from the wheel); map ×20: level 7, 96 tiles, same; 4 s pans at 141–143 fps, worst frame 21 ms, 0 long tasks, sharp on release | rAF recorder, tile state | 1 |
| Export at 10M | heightmap 16-bit 8192: 1.9 s (1.1 s freeze), 37.6 MB; 16384: 11.7 s (4.8 s freeze), 143 MB; colour map 16384: 21.1 s (**10.5 s freeze**, browser **11.6 GB**, GPU process 6.1 GB), 124 MB; **Export all at 8192: 141 files, 1.37 GB ZIP, 238 s, main thread blocked 234.6 s** (longest 11.3 s) | export panel driven, CDP downloads, long tasks | 1 each |
| Save planet at 10M | 10.2 s, 284 MB file; longest task 247 ms | same | 1 |
| Extend history after a 10M detail | 12 Myr/s (1600 → 1960 Myr in 30 s), 0 long tasks | rAF recorder | 1 |
| New world after a detailed moment | the old moment stays: page arrays 881 MB vs 225 MB for the same new world opened fresh (640K test); 1075 MB after a 10M session; finish worker keeps its 740 MB | `leak-check.mjs` (Runtime.queryObjects: frames not leaked), CDP heaps | 1 + 1 |
| **Phones** (emulated: 390×844 touch, the page's thread at 4×, deviceMemory 4 — workers run at desktop speed) — Evolution from a 20K, 1200 Myr link | first frame 2.8 s; history 37.4 s; renderer peak **1.42 GB** (browser 1.85 GB) while building; 640K detail 20.3 s (renderer peak 1.17 GB); after: renderer 783 MB. Views: Satellite **3.4 s** freeze, Köppen 185 ms, Geology 182 ms, Food **1.7 s**, Terrain 140 ms | `evo-phone.mjs` | 1 |
| Phone: opening the 10M planet file (284 MB) | opened in 7.2 s (282 MB of history, the desktop's detail left in the file), drawn 9.8 s after choosing it; renderer peak 1.29 GB; then 640K detail 20.9 s (peak 1.36 GB, browser 1.79 GB) | `evo-phone.mjs` with `FILE` | 1 |
| Phone: Generate, default code | first picture 5.7 s, finish 10.9 s; Satellite first open **7.3 s** freeze (not yet drawn ahead), Köppen 449 ms, Food 1.37 s; auto-rotate 125 fps | `gen.mjs` with `PHONE=1` | 1 |

### Top 5 opportunities

| # | What | Kind | Expected gain | Effort |
|---|---|---|---|---|
| 1 | **P-01** Run Add detail's per-cell stages (final climate, deposits, rocks, the picture) on the finish's own worker pool | exact | est. 10M 183 → ~125 s; 2.5M 44 → ~29 s | L |
| 2 | **P-03** Export off the main thread (and no GPU canvas for the rivers' lines) | exact (the river lines' anti-aliasing may differ by a level at their edges, as it already does between GPUs) | page usable during every export; 16384 colour map ~6 GB less | M–L |
| 3 | **P-04 / P-09** Let go of what nothing shows: the old moment after New world, the finish worker's 10M meshes on a new world, the idle terrain pool during a ≥ 2.5M detail | exact | ~0.6–1.3 GB after a new world; ~0.25–1 GB off the 10M peak (est.) | S |
| 4 | **P-02** Detailed moments repainted without freezing: cache the down-sampled picture, fuse the Food legend's tally with its paint, then (owner's call) paint detailed moments on the GPU as live frames already are | exact first; the GPU step is not byte-identical on screen (≤ 1/255, as the live terrain already is), exports unchanged | exact parts: about −60…−140 ms per repaint, −600 ms per Food change; GPU: 0.2–1.4 s → milliseconds | S / M / L |
| 5 | **P-05 / P-06** Satellite drawn ahead in a worker (three seasons in parallel); its clouds and shaders prepared during the finish | exact | ~10 s of main-thread CPU gone after every detail; first Satellite open 1.6 s → ~0.7 s (est.) | M |

Severity counts: **High 5, Medium 6, Low 4** (15 findings; P-16 lists what measured fast).

## Findings

### P-01 — Add detail runs mostly on one thread (High)

**Measured.** 10M: 183.5 s (first) and 148.7 s (second moment); 2.5M: 44.0 s. The finish worker's CPU profile at 10M
(`evo-b1-finish-worker.cpuprofile`, 161 s busy) puts **26 s** in the surface (the only stage on the pool: eight nested
terrain workers) and **~140 s of the stages on the finish worker's own thread** (plus the ~17 s mesh). The heaviest
single-threaded stages and what they are made of:

| stage (10M) | s | inside (inclusive, from the profile) |
|---|---|---|
| final climate | 32.7 | `cellClimate` 30.5 s: the per-cell callback (`finish.js:326`) — farming's climate `addFarmClimate` 12.5 s (`cropYields` 10.2 s), the land cover `landCover` 4.0 s, cell stats 3.6 s, `placeVariety` 3.2 s |
| rivers | 22.3 | `carveTerrain` 15.9 s (`carveLevel` 11.5 s: priority floods) + dissection |
| deposits | 18.2 | `depositFields` 17.9 s (the district shapes' noise `at` 8.0 s) |
| water | 14.5 | `hydrology` 13.7 s (lakes, gorges, `riverYears` 4.5 s) |
| picture | 11.7 | `finishRaster` 11.4 s: one `locate` per pixel of 8192 × 4096, the climate/geology/farming pictures beside it |
| geology | 9.5 | `classifyRocks` 14.8 s across bedrock + geology (`rocksBefore` 6.2 s) |
| mesh | ~17 | `buildSimMesh(10M)` 16.9 s (Delaunator ~9.4 s, the Fibonacci sphere, the index), run by `prepare` the moment 10M is chosen (`evolution-main.js:706`); the finish waits for it |

The pool that drew the surface is terminated straight after it (`finish.js:94`, `closePool`) "before the heavy
stages" — the eight cores then idle for ~140 s while one thread works.

**Cause.** `finishPlanet` (`v2/js/finish/finish.js:68–380`) runs every stage after the surface in the finish worker's
own thread. Several of them are independent per cell or per pixel:
- the final climate's callback (`finish.js:326–351`) reads only the cell's own twelve months and fixed fields (its
  position, height, the grid climate, the erg/loess/basalt/rock bytes) and writes only that cell's outputs — except two
  shared accumulations: `famGrid.add` (`climate/koppen-soft.js:93`, sums in cell order, taking the first 4 places per
  grid cell) and `biasTowardClimate` after the loop;
- `finishRaster` (`finish.js:527`) is a pure function of each pixel;
- `depositFields` (`geology/deposits.js:362`) writes per cell, and its grids take the per-cell maximum (`wq`/`write`);
- `classifyRocks` is per cell after its grids.

**Proposal (exact).** Keep the pool (or a second one) through the finish and hand these stages out in interleaved
chunks, as the terrain pool already does for the surface (`terrain-pool.js:221–236`, chunks dealt round-robin so the
land-heavy latitude bands are shared out). To stay byte-identical: the cells each worker computes are computed by the
same code; `famGrid` gets its wanted places chosen first in cell order (they depend only on each cell's latitude,
longitude and land), the workers return those places' shares, and the sums are made in cell order on the finish
worker; deposit grids merge by maximum (order-free); `finishRaster` bands are rows. Verify with the existing hashes of
a 640K and a 2.5M Add detail (as the 2026-10-18 and 10-27 passes did).
Also exact: build the mesh ladder's sizes in parallel (each mesh depends only on its size; the 2.5M, 640K and 160K
ones beside the 10M) and start building the 10M mesh when the Detail menu opens rather than when 10M is chosen.

**Expected gain (estimated, not prototyped).** At 10M these four stages are ~72 s; on 7 workers, with the inputs'
hand-out and the serial merges, ~12–18 s → **−55 to −60 s (≈ −30 %)**. At 2.5M: 20.4 s → ~4–5 s → **44 → ~29 s
(≈ −35 %)**. The parallel mesh ladder: ~−3 to −4 s of the 17 s.
**Effort** L (inputs sliced to workers per stage, merges, hash checks). **Risk**: transient memory — each worker gets
its slices of the inputs (at 10M ~40–60 bytes a cell → ~0.5 GB in flight, est.), so on small devices keep the serial
path; the rivers, water and sea stages (priority floods, ~43 s at 10M) stay serial.

The menu says "10M cells · 8 km (~1 min)" (`evolution.html:189`), the guide "about a minute" (`docs/evolution.md:53`)
and the engine README "10M ~53 s" (`v2/README.md:229`): all measured before the geology, the farming, the deposits and
the Satellite cover were added. VISION allows minutes for depth that "says what it costs"; until it is faster the label
should say ~3 min.

### P-02 — Detailed moments repainted on the CPU (High)

**Measured.** First paint of each view after Add detail, as one long task (2.5M / 10M): Terrain 244 / 469 ms, Köppen
434 / 416 ms, Geology 355 / 416 ms, Food 1356 / 1441 ms, Satellite 1540 / 1641 ms (of which the paint 625 / 711 ms),
Heightmap 195 ms. Coming back onto the detailed moment after a scrub paints twice: 82 ms, then 216 ms 300 ms later
(`SHARP_AFTER_MS`). Generate: each piece the pointer enters with Ctrl held repaints the whole finished picture, 71 ms
mean (p99 frame 54 ms) — in plate editing, its signature interaction.

**Cause.** `PlanetView.paintFinished` (`v2/js/view/planet-view.js:312`) → `paintFinished`
(`v2/js/evolution/finish-view.js:139`) paints the 4096 × 2048 texture per pixel on the page's thread (per-pixel closures
for the climate, geology and farming colours) and first calls `rasterAt` (`finish-view.js:66`), which allocates and
fills a fresh 4096 × 2048 heights / sea / lakes picture (~50 MB) on every paint — at 10M it averages the 8192 picture 2
× 2 each time (rasterAt's self time 683 ms over 5 paints). The Food legend (`farming-view.js:208 tally`, 600 ms) walks
every pixel with `placeAt` again — the same per-pixel work the Food paint just did — and is recomputed whenever a chip
changes the options key. Generate repaints on every hover change (`js/main.js:226` `setHovered` → `dirty` → `paint()` →
the full CPU `paintFinished`), when only the overlay's lines changed. On a phone (emulated, the page's thread at 4×) the
same views cost 1.4–1.7 s for Food and ~0.45 s for Köppen.

**Proposals.**
- *Exact, S:* keep `rasterAt`'s result per (picture, width, lakes) on the finished moment (it changes only with the
  moment): about −60 ms (2.5M) to −140 ms (10M) per repaint (rasterAt's measured share), and ~50 MB less garbage each
  time.
- *Exact, S–M:* compute the Food placement once per options key into a per-pixel class array used by both the paint and
  the tally: −~600 ms per Food view or chip change.
- *Exact, S:* Generate's Ctrl-hover: redraw only the overlay's lines (the GPU's overlay canvas, `drawLines`/`layLines`)
  when only `hoveredPiece` changed, not the picture.
- *Not byte-identical on screen (owner's call), L:* paint detailed moments on the GPU as the live terrain already is
  (`view/gpu-paint.js`): the heights, sea and lakes as data textures, the palette, hillshade and climate colours in the
  shader. The live paint went this way on 2026-10-18 ("under 1 of 255 per channel"); exports keep the CPU path. Est.
  every repaint 0.2–1.4 s → a few ms, and no 4096 canvas per moment.

### P-03 — Exports freeze the page and can exhaust memory (High)

**Measured (10M).** Export all at 8192 (141 files, 1.37 GB ZIP): **238 s, of which the main thread was blocked
234.6 s** (336 long tasks, the longest 11.3 s; the frame p95 2 s); browser peak 6.8 GB. One colour map at 16384:
21.1 s with a **10.5 s freeze**, browser private memory **11.6 GB**, the GPU process alone **6.1 GB**. Heightmap 16-bit
at 16384: 11.7 s, 4.8 s freeze, 5.8 GB. Generate (204K): colour map at 16384 16.7 s (6.9 s freeze, 8.6 GB), Export all
at 4096 55 s (48.9 s blocked).

**Cause.** The whole run is on the page's thread (`v2/js/view/export-panel.js:205–250`): each file's `produce`
(`v2/js/evolution/export.js:116–250`: per-pixel loops over 67–134M pixels at 8192–16384), the projection, and the PNG
row filter (`v2/js/view/png.js` `encodeGrayPng`/`encodeRgbPng`); only the deflate (CompressionStream) runs elsewhere.
The colour map draws its rivers on an `OffscreenCanvas(16384, 8192)` 2D context (`png.js:115 canvasOf`, used at
`export.js:145` and `:205`), which is GPU-backed: `putImageData` uploads 512 MB and `getImageData` reads it back — the
GPU process's 6 GB. Wider than the picture, `begin` keeps a full-planet fine-detail raster (16384 × 8192 × 6 bytes ≈ 800
MB) for the whole run.

**Proposals (exact).**
- An export worker: the moment's arrays copied (or, for one export, transferred and returned) once, every map produced,
  projected and PNG-filtered there, files streamed into the ZIP as they come (`ZipWriter` already takes pieces). The
  page stays live and shows real progress. M–L.
- The rivers' canvas made CPU-backed (`getContext('2d', { willReadFrequently: true })`), or the lines drawn straight
  into the RGBA buffer: no GPU round trip of half a gigabyte. S. (The lines' anti-aliased edge pixels may differ by a
  level from today's GPU-drawn ones — they already differ between GPUs; the maps' data rows are unchanged.)
- PNG: write IDAT in chunks (no single `chunk('IDAT', z)` copy of the whole compressed stream) and drop `raw` before
  building the blob. S.
**Gain.** Measured cost is the freeze itself (up to 11 s per file, 4 min for Export all); with a worker the page stays
responsive (est.), and the 16384 colour map's peak falls by about the GPU process's 6 GB (est.). **Risk:** a copy of
the moment in the worker (~0.5 GB at 10M) while it runs.

### P-04 — The previous detailed moment is kept after New world (High)

**Measured.** `leak-check.mjs`: a 600 Myr world, 640K detail, its views, then a new world (seed 777, same settings):
after GC the page's arrays hold **881 MB**; the same new world opened in a fresh browser holds **225 MB**. The history
frames are not the cause (61 alive = 61 in the new history, `Runtime.queryObjects`). After the 10M session (`evo-b1`):
1075 MB once the new world was built, against ~450–500 MB expected for its history alone.

**Cause.** `PlanetView` keeps references to the last finished moment after the world it belonged to is gone:
`this.legendFin = fin` (`planet-view.js:331`) and `this.patchClimate = fin.climate` (`:413`) are only replaced when
another detailed moment is painted; `this.tileColors.byWidth` keeps colour closures over the moment's climate. Through
them stay the moment (422–530 MB) and every cache hung on it (`fin.paths`, `fin.grids`, the WeakMaps of
`sat-style.js`, `farming-view.js`, `geology-view.js` keyed by it). `blank()` (`:172`) resets none of them.

**Proposal (exact, S).** Clear `legendFin`, `patchClimate`, `tileColors` (and `satPrep`) in `blank()` / when the
world goes (`evolution-main.js:226 leaveWorld`; Generate's and Import's `received`). **Gain:** ~0.65 GB at 640K
measured; at 10M est. ~0.8–1.3 GB (the moment plus its view caches), released before the next world's history and
detail need it.

### P-05 — The Satellite view is drawn ahead on the page's thread (High: on phones)

**Measured.** After each Add detail the season shown takes 8.9 s (2.5M) / 12.4 s (10M) to draw ahead; over a session
the page's CPU profile shows **10.2 s** in `prepareSatellite` (`sat-style.js:827`, its `rows` at `:916` alone 4.7 s
self) — 7 ms slices every 16 ms (`planet-view.js:36`), ~44 % of the main thread for those seconds. Opening Satellite
before it is done drains the rest at once: Generate at 2.56M, **2.9 s** freeze on the first Satellite open; Generate
under phone emulation (the page's thread at 4×), **7.3 s** (its paint alone 4.1 s); Evolution under phone emulation
after a 640K detail, 3.4 s (of which ~2.7 s before the paint: the clouds, P-06, at 4×).

**Cause.** `prepareSatelliteSoon` (`planet-view.js:364–391`) runs the generator jobs of `sat-style.js` in the page.

**Proposal (exact, M).** The same jobs in a worker (they are pure functions over typed arrays: the climate picture,
heights, rivers, ground), one worker per season so the three run side by side, the styled pictures sent back. The page
keeps none of the slicing. **Gain** ~10 s of main-thread CPU per detail; the three seasons ready in roughly the time
of one (est. ~4 s at 4096, down from ~25 s sliced). On a phone, whose 4× slower core runs the same 2048 picture, the
gain is larger. **Risk:** a copy of the climate picture in the worker (~40–60 MB).

### P-06 — First Satellite open: clouds and shader compile on the critical path (Medium)

**Measured.** First Satellite open = one long task of 1.59–1.64 s (6 runs at 640K, 1 each at 2.5M and 10M): ~0.47 s
before the paint (the clouds' fields, `syncClouds` `planet-view.js:352` → `cloudFields`/`cloudStorms`,
`view/clouds.js:52`: worley/lattice noise), the paint ~0.66 s, then the first render (the clouds' shader compile:
`getProgramInfoLog` 445 ms in the profile). Opening Satellite again later: 0.72 s (the clouds' fields are rebuilt
whenever the layer changes back: `cloudsShown` caches only the current one). Generate and Import: ~1.0 s.
**Prototype (measured, 3 + 3 alternating runs):** `renderer.debug.checkShaderErrors = false` alone changes nothing
(1588–1608 ms either way) — the compile is paid at the first draw instead.

**Proposal (exact).** Compile the clouds' (and the map view's: Generate's first switch to the map is a 747 ms task)
programs ahead with `renderer.compileAsync` while the finish runs; keep the cloud fields per (climate, season) on the
moment instead of rebuilding them on every return; or build them in the finish worker. **Gain (est.)** first open
~1.6 → ~0.7 s, a re-open ~0.72 → ~0.3 s (the remaining cost is P-02's paint). S–M.

### P-07 — The Food view's legend repeats its paint's work (Medium)

**Measured.** Food first view 1356 ms (2.5M) / 1441 ms (10M): `farmingLegendHTML` → `tally` 602 ms + the paint 724 ms.
Each chip change (a new options key) pays both again. **Cause.** `farming-view.js:208 tally` re-runs `placeAt` over
every land pixel that `finishedFarmingColor` (`:148`) has just placed. **Proposal (exact, S–M):** one placement pass per
options key into a per-pixel class array, read by the paint and summed by the legend. **Gain** ~600 ms per change
(est.).

### P-08 — 10M's label and expectations (Medium)

Covered in P-01's last paragraph: the menu promises ~1 min, the measured first 10M is 3 min 4 s (2 min 29 s once its
mesh exists). Exact fix: the label. The mesh's ~17 s could also start when the Detail menu is opened (est. hides most of
it when the user picks 10M and clicks within a few seconds). S.

### P-09 — Memory held by idle workers through a 10M detail (Medium)

**Measured.** During the first 10M the renderer rose from ~2.5 to **5.5 GB**; during the second (the old moment still
kept, as designed) from 3.15 to **6.9 GB** (browser 7.9 GB). Meanwhile, idle: the page's 8 terrain workers (248 MB
settled; ~1 GB of arrays right after the history, before their GC), the history worker and 4 helpers (~185 MB), the
carve and shade workers (~35 MB). After the detail the finish worker keeps **740 MB** (the 10M mesh ladder, `keep:
!SMALL_DEVICE && cells >= 2.5e6`, `evolution-main.js:654`) — also into a new world (`leaveWorld`,
`evolution-main.js:226–231`, cancels only a finish under way).

**Proposals (exact, S).** On a desktop too, let the terrain pool rest during a ≥ 2.5M finish
(`TerrainPlayer.rest`/`wake` exist for small devices, `evolution-main.js:652`; the cost is the pool's restart, < 1 s);
let the finish worker go on New world when the new world's terrain mesh differs or the user has not asked for 10M again.
**Gain (est.)** 0.25–1 GB off the 10M peak; 740 MB after a new world. Trade-off: the next 10M on the new world rebuilds
its mesh (~17 s) — keep it if the plates' resolution and the detail are the same, which is the common case.

**Issue #75's "each version takes about 320 MB, and two are kept at once":** the moment itself is now **522–530 MB at
10M** (picture 347 MB with the rocks and the food, climate 167 MB), and the page's caches for its views bring the page's
arrays to ~1.3 GB with one moment; with two (during a second detail) the renderer reached 6.9 GB.

### P-10 — Page load: a deep module graph loaded whole (Medium)

**Measured.** Evolution's page imports 166 modules (906 KB gzip; 195 requests with the workers'), six imports deep,
plus three.js (1.3 MB decoded) from jsDelivr. On 4G (150 ms RTT, 1.6 Mbps, CPU 4×): DOMContentLoaded **9.6 s** cold on
HTTP/1.1, **7.7 s** against production (HTTP/2); within the 10-minute max-age a return visit is 0.65 s, but **after it
expires every module is revalidated**: 5.9 s on HTTP/1.1 with 51 KB on the wire (the round trips, not the bytes). On 4G
the cold load is bandwidth-bound: 1.2–1.4 MB at 1.6 Mbps is ~6–7 s by itself.

**Cause.** No bundler (by design); the page's graph includes what only a detailed moment needs — the Satellite styling
(`sat-style.js` 84 KB raw), clouds, geology and food views, deposits, the export panel, PNG/ZIP, the planet file:
≥ 174 KB gzip in 19 modules (more with what only they import).

**Proposals (exact).** Load the detailed-moment views and the export/save code with `import()` the first time they
are needed (the same code; S–M), saving ≥ 20 % of the startup bytes (est.); add `<link rel="modulepreload">` for the
deepest modules so the six levels are fetched in ~two round trips (S; the list kept by a check script, no build step).
The 600 s max-age is GitHub Pages' and cannot be changed there; a service worker could cache the modules for return
visits but is a larger change with its own risks (it would also enable cross-origin isolation, which the plan notes).

### P-11 — Generate at most detail draws its ground on one thread (Medium)

**Measured.** At 2.56M regions the first picture takes 32.5 s, 24.6 s of it "Raising the ground", then the finish 44.1 s
(its picture alone 11.1 s at 8192 px). At the default 204K: 3.3 s of 4.2 s. **Cause.** `presentSynthesize`
(`v2/js/present/world.js:155–200`) calls `surfaceRange` over all cells on the planet worker's thread, then
`carveTerrain`; Evolution draws the same surface (`terrain/synthesize.js`) on the terrain pool, bit for bit.
**Proposal (exact, M):** the pool for `surfaceRange` in Generate (the plan built once, handed out, as
`TerrainPool.runHeld` does); P-01's parallel picture applies to its finish too. Not split further here (the worker's
own `ms` are not logged); est. a third to a half off the 24.6 s. Generate's profile is "seconds", and its most detail is
opt-in with a warning, so Medium.

### P-12 — Generate and Import clone the finish's job (Low)

`js/main.js` `finish()` and `js/import-main.js` `finish()` post `{ ...job, mesh: w.meshArrays, … }` to the finish worker
with no transfer list (FinishService supports `transfer`, `finish-view.js:23`): the mesh, the surface and the frame are
structured-cloned on the page's thread on every finish (Reapply, the climate sliders). Not measured in isolation (a
265 ms long task at the start of the 2.56M finish is consistent with it). Exact: transfer copies made in the worker's
reply, or keep the job in the planet worker and hand it on through a MessageChannel. S.

### P-13 — `GlobeView.resize` forces layout every frame (Low)

`app/globe-view.js:162` reads `clientWidth`/`clientHeight` each frame; during Add detail the progress updates write to
the DOM every few ms, so each read forces a layout: 1.8 s of the page's 7.3 s busy time over a 10M detail. Frames stayed
under 8 ms on this desktop. Exact: a `ResizeObserver`. S.

### P-14 — The Studio home page loads all four globe maps at once (Low)

The hero globe's four 2048-px maps (`index.html:360–363`, 1.31 MB of the page's 1.53 MB of images) load at once; on 4G
the page's `load` is at 10.8 s (first paint 1.1 s: the still shows meanwhile). Exact: fetch each view's map just before
its turn (they are shown one at a time, 6 s each). S.

### P-15 — The history's memory while it builds (Low)

During the 40K build the renderer peaks at 3.7–3.8 GB, ~1 GB of it arrays in the 8 terrain workers that become garbage
(settled 248 MB) and the finish worker's 2.5M meshes built ahead (578 MB during the build, 149 MB settled). On a desktop
harmless. Under phone emulation (the small-device rules on: 3 terrain workers, no helpers kept, no meshes built ahead)
the 20K, 1200 Myr build peaked at **1.42 GB** in the renderer (1.85 GB browser-wide) and fell to 1.16 GB after — inside
the ~2 GB a phone tab can count on, but the build, not Add detail, is now the phone's peak (640K detail: 1.17–1.36 GB).
Opening a 40K, 1600 Myr planet file peaked at 1.29 GB. Worth watching if 40K links are opened on phones; no change
proposed.

### P-16 — What is already fast (no finding)

Playback, scrubbing, the globe, the map and its projections, the fine-detail tiles at 10M (sharp within the camera's
ease, pans at 141–143 fps), Save planet (10 s at 10M, no task over 250 ms), Extend history after a detail (12 Myr/s),
Import's first picture (1.0 s). The second 10M on the same session let the first moment go cleanly (page arrays back to
1.29 GB).

## 10M specifically

**What limits it today.** *Time* first: 183 s, of which ~140 s is one thread (P-01) and ~17 s the mesh (P-08). The
rivers, water and sea stages (priority floods, ~43 s) are inherently serial. *Memory* second: 5.5 GB renderer at the
first 10M, 6.9 GB at a second (the old moment kept until the new one is done), 740 MB kept by the finish worker after,
~1.3 GB of page arrays with one moment — comfortable on this 62 GB desktop, tight on a 16 GB laptop with other tabs (a
browser-wide 7.9 GB). *GPU* is not a limit: the GPU process stays under 1 GB except in the 16384 colour export (P-03).
Zoom and pan at 10M are smooth; the view switches are not (P-02).

**What would make it comfortable.** P-01 (≈ −55 to −60 s) + P-08 (mesh ahead, parallel ladder) brings the first 10M to
roughly 1½–2 min (est.); P-09 + P-04 take ~1–2 GB off the peaks; P-02/P-05 make the detailed moment feel live; P-03
makes its exports usable. All exact.

**Issue #75 (going above 10M).** From 2.5M to 10M (4× the cells) the finish took 4.2× the time; the floods grew faster
than the cells (rivers 6.2×, water 6.6×, sea 7.6×), the per-cell stages ~4×, the picture 1.9× (its width doubles, it is
capped at 8192). Extrapolating, 20M today would be ~6–7 min and a renderer peak of ~8–9 GB (the detail's own ~3 GB
doubled, plus the rest); 40M ~15 min and well past 12 GB — beyond what a browser tab can count on. And the picture the
page shows is already capped (4096 on screen, 8192 for the moment, detail finer than that drawn as tiles), so cells
past 10M would add little that is seen unless the picture and its caches grow too (each doubling of width ×4 memory).
Recommendation: not above 10M until P-01, P-04 and P-09 are done; then, if wanted, 20M as a desktop-only option with
the time and memory it costs stated (an est. ~3 min after P-01), re-measured first.

## The plan's approximations (not re-proposed)

The seven approximations in `plans/V2_PERFORMANCE_PLAN.md` target the history (1–3) and live terrain playback (4–7).
Playback and scrubbing measured smooth here at 160K (127 fps, no long tasks; a new frame 0.4 ms to paint), so 4–7 buy
little at the default; their case rests on 2.5M playback, not re-measured here. The history (81.7 s for 1200 Myr at 40K)
matches the plan's ~85 s, so 1–3's estimates stand. "The heights on the GPU" remains the lever for the surface stage
(26 s at 10M on 8 workers), behind P-01.

## Quick wins (exact, small)

1. P-04: clear `legendFin` / `patchClimate` / `tileColors` when a world goes — ~0.65 GB measured.
2. P-08: the 10M label says ~3 min (and the guide, the README).
3. P-02: cache `rasterAt` per moment and width — about −60…−140 ms per repaint.
4. P-03: `willReadFrequently: true` on the export's river canvas — the 16384 colour map's 6 GB GPU spike.
5. P-06: keep the cloud fields per season on the moment; `compileAsync` the clouds' and map's programs during the
   finish.
6. P-13: `ResizeObserver` instead of reading the canvas size every frame.
7. P-14: the Studio's globe maps fetched one at a time.

## Not measured, and why

- **Real phones.** Emulation throttles the page's main thread (CDP `setCPUThrottlingRate`); worker threads run at the
  desktop's speed, and memory pressure / tab killing is not emulated. Phone numbers here are indicative, especially for
  the history and Add detail, which run in workers.
- **Worker profiles of the history and the terrain pool** (the plan covers them); only the finish worker was profiled.
- **2.5M playback** (the plan's approximations 4–7): not re-measured.
- **Exports per file** inside "Export all" (only the whole run was timed), other projections at 16384, and exports on a
  phone.
- **GPU memory per texture**: only the GPU process's dedicated and private memory were read.
- **Opening a planet file on a desktop** (the README has it: 2 s to open, 7 s on screen at 10M).
- **Prototypes of P-01, P-02, P-03, P-05**: estimates only. The one prototype built (P-06, shader checks off) showed no
  gain and is reported as such.
- **Runs**: most heavy measurements are single runs (a 10M detail is 2.5–3 min); the 2.5M time matches the owner's
  ~45 s, the history matches the plan's, Generate's build was stable across two runs (4.79 s both).
