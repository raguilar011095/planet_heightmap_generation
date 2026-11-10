# World Orogen — performance audit 2 (2026-11-10): the three tools, exact speed-ups

Owner: "comprehensively audit performance across the 3 tools of the site. I need pixel perfect similarity in simulations,
but want if possible order of magnitude speedups in tectonics, climate, and other parts."

Branch `claude/vibrant-thompson-7lk7q2`, from v3.0.1 (ed466f9). The rule for every change: **the same output, to the
bit** — proven by fingerprints of every array each pipeline makes, in Node and in the page. It follows the audit of
2026-11-06 (`PERFORMANCE_AUDIT.md`), whose measurements stand; this one adds a bench that makes "exact" checkable in one
command, profiles every pipeline, and builds what it found.

## The short answer

**An order of magnitude is not there to be had exactly.** Every pipeline was profiled; none has a hot spot: the
largest single function in Generate's whole build-and-finish is 6 % of the time, in the history 10 %, in the climate
(its solver's relaxation) 25 %. The earlier exact passes took what was concentrated. What is left is many loops of a few
percent each, most of them already tight — so the levers that keep every bit are **doing independent pieces side by
side** and **not repeating work**, and both are bounded: by the cores a machine has, and by the stages that are one
chain of steps by nature (the history's steps, the climate's coupled rounds, the carving's and the hydrology's floods).

What was built gives, on the 4-core machine this was measured on (a cloud Xeon, about half the development desktop's
speed a core, with a software GPU in the browser):

| | before | after | |
|---|---|---|---|
| Add detail's **picture** (640K cells, 4096 px) | 12.1 s | 5.9 s | 2.1× |
| Generate's and Import's **picture** (204K, 2048 px) | 3.7 s | 1.9–2.2 s | 1.8× |
| Add detail's **final climate** (640K) | 4.1 s | 3.0 s | 1.4× |
| **Add detail**, 640K, all of it | 48.4 s | 38.3 s | 1.26× |
| **Add detail at 10M**, 8192 px, all of it (its own section below) | 324 s | 264 s | 1.23× |
| Generate: **Reapply**'s ground | 3.5 s (Node) · 7.0 s (Chromium) | 2.8 s · 3.7 s | 1.25× · 1.9× |
| Generate: the **first picture** (Node) | 8.9 s | 8.0 s | 1.1× |
| Import: finish + picture | 17.7 s | 15.6 s | 1.13× |
| the **history**, 600 Myr at 40K | 79.1 s | 72.5 s | 1.09× |
| the **climate** on its grid | 6.7 s | 6.7 s | — (see below) |

(Each "after" is of the last clean run of `perf-bench.mjs`, the machine idle; runs differ by a few percent — the
history ran 72.1, 72.5, 72.5 and once 76.1 s. One number in the Node bench is not the page's: there Generate's finish
runs in the same process as the ground's pool, and its stages come out ~10 % slower after a pooled ground than after
one drawn in place — the same code, on the same thread. In the page the two are separate workers, and Chromium shows no
such thing: the finish's climate took 7.6 s on v3.0.1 and 7.5 s here.)

The pooled stages scale with cores: the pool here had 3 workers; the development desktop's has 7, and the stages that
moved to it are the ones the first audit measured as Add detail's single-threaded tail. They were not measured on that
machine (this audit had no access to it): a first run there is the next step, with `perf-bench.mjs` and
`check-pages-exact.mjs`.

Nothing in the output changed. The same seeds, links and planet files give the same worlds.

## How it was measured, and how "exact" is checked

- **`node v2/tools/perf-bench.mjs <pipeline>`** runs each tool's real code in Node — `history` (the Evolution history as
  the page builds it), `terrain` (one frame's live terrain), `finish` (Add detail and its picture), `generate`
  (js/planet-worker.js itself, its messages caught, then its finish), `edit` (a Rebuild and a Reapply), `import` (a drawn
  map through Import's worker and finish), `climate` (the climate alone) — and prints each stage's time with a
  fingerprint (SHA-256 over every typed array's bytes, every number and string) of what it made. `--json` keeps a run;
  `--compare` checks a later one against it stage by stage and exits 1 on any difference. Copied into an older checkout it
  makes that checkout's baseline. `--serial` runs without the pools.
- **`node v2/tools/check-pages-exact.mjs generate|import|evolution`** opens two copies of the site in headless Chromium,
  taps every message their workers send back (the first picture, each history frame, the finished moment, a Reapply),
  fingerprints and times them, and prints both side by side — the proof in the page itself: module workers inside
  workers, transfers, the real message shapes.
- **`node v2/tools/lib/cpu-profile.mjs`** sums a `--cpu-prof` profile by function (own time, and with what it calls).

Checked identical, before against after: the history's every frame and its event log (600 Myr and 200 Myr at 40K); a
160K terrain frame; Add detail at 640K with the geological record — heights, rivers, drivers, stats, geology, farming,
climate, and the picture's every layer — in place and pooled; Generate's default planet — the worker's message, the
finish, the picture — in place and pooled; a Rebuild after two pieces are edited and a Reapply with other knobs; Import.
In Chromium: Generate (desktop, and as a phone), Generate's Reapply and its second finish, Import (its random mesh seed
pinned for both copies), Evolution's 31 history frames and a 640K Add detail at a fixed moment: every message the same.
The repo's own checks pass (see the end).

## What was built

### 1. A pool for work that splits into independent pieces — `v2/js/core/task-pool.js`

A small pool of module workers (worker threads in Node) that run named tasks. A task is the same function the caller
would run in place, on a piece of the same values; the caller hands out pieces and takes results in. Two pieces are in
flight per worker and a worker is fed before its result is taken in, so it never waits on the thread that deals. Where
workers cannot be started, or the machine has fewer than three cores, there is no pool and the caller works in place —
one code path either way, which is what the fingerprints compare.

### 2. The picture — `v2/js/finish/finish-raster.js` (was in finish.js)

The picture of a finished planet is 2–33 million pixels, each blended over the mesh triangle under it. Before: one
loop, with the farming's, the stats' and the crops' arrays looked up by name per pixel, and the Satellite look after
it — all on one thread (the first audit's P-01: 6.2 s of a 2.5M Add detail, 11.7 s at 10M).

- **One function draws a pixel** (`pixelDrawer`): the same arithmetic in the same order, its arrays resolved once.
  In place this alone is 17 % faster.
- **Pooled, the pixels are dealt out by the run of mesh cells they fall on.** A worker needs the mesh around its
  pixels; sending every worker the planet would cost a copy of everything per worker (at 10M, more memory than the
  finish has). A mesh's cells are numbered along the sphere, so the pixels whose cells fall in one run of numbers are a
  band of the planet, and need only that run of every per-cell array, a few cells wider. Latitude bands would do for
  Evolution's meshes, numbered north to south — but Generate's are numbered along another axis (measured: a latitude
  band there touches up to the whole mesh), so the deal goes by the cells, not the rows, and is right for both. The
  thread that deals computes each pixel's first guess of its cell (the sphere index's table: cheap), the worker walks from
  it — the same walk, the same cell. A walk that would leave its slice stops the piece, and the picture is drawn in
  place: never a wrong pixel.
- **The Satellite look**, which was one pass over the picture: its neighbourhood statistics on one worker while the
  rivers' ribbons and the lakes' fringes are stamped on the finish's own thread, as before; then its rows in bands.
  (The ribbons dealt out by reach over the pool were built too, and exact — a pixel's riverside is the *most* of what
  covers it, so reaches can be stamped in any order and joined by each pixel's most; rounding to the Float32 it is kept
  in is monotone, so the most of the rounded values is the rounded most — but on three workers they were no faster
  than one thread beside the statistics, and each worker took a 40 MB copy of the picture: taken out again. With more
  workers they would gain; the look's whole-picture part is 1.7 s of a 640K picture and 3.7 s of a 10M one.)

### 3. The final climate — `v2/js/finish/finish-cells.js`

Each land cell's cover and its riverside's, its measures beyond Köppen, the deposits' climate tests and the farming's
seasons come from its own twelve months: in runs of cells on the pool. One thing was order-bound — the climate's shares
for the Satellite view's transitions take each grid cell's *first four* land places, summed in the cells' order — so
those places are settled first, the workers return their shares, and the sums are made in order. Used from 400K cells:
below that each worker meets the code cold (the JIT's warm-up is most of a small planet's stage) and it gained nothing.

### 4. Generate's ground — `v2/js/present/ground-tasks.js`, `world.js`, `js/planet-worker.js`

"Raising the ground" was the first audit's P-11. The surface — every cell sampled on the sim mesh and read from the
plan — is what Evolution's terrain pool already draws in pieces; Generate drew it on one thread. `present/world.js` now
asks for its surface the way the history asks for a rift's search (a generator's yield): `presentWorld` answers in place,
the worker answers from a pool it keeps for the next Rebuild and Reapply. The sampling warp's tables (a noise tabulated
over a cube map, ~0.8 s here) would have been filled by every worker for itself: they are filled a face at a time on
the pool, once per seed and warp, and handed to each.

### 5. The fine mesh, built under the surface's time — `finish.js`, `terrain-mesh.js`, `finish-worker.js`

Add detail built its mesh (a Delaunay triangulation: 17 s at 10M on the development desktop, 36 s here), then drew
the surface on the pool while its own thread waited. But the surface needs only *where the cells are* — the Fibonacci
points, known in a moment — not how they are joined. So when the mesh is not built yet, the workers start on the surface
at once and the finish's thread triangulates meanwhile: the mesh costs no time of its own. The same points, the same
mesh (`sphere-mesh.js` `spherePoints` / `sphereFromPoints`: `buildSphere` in its two halves). The worker's `prepare`
(the page's "build the meshes ahead") still builds the coarser meshes at once, and the fine one after five seconds'
pause if no finish has come: a finish that arrived while the fine mesh was being built there had to wait for it — the
first audit's "~17 s of mesh before the stages" on a first 10M.

### 6. The history's growth step — `v2/js/tectonics/step/resolve.js`, `gather.js`

Counted over a history: each step looks at ~5,000 candidate cells for new crust and ~110 are born. 43 % are turned down
because another plate has crust there, 29 % because none of their own plate's crust is within reach — each after a
search of up to 37 cells' rings. Now the cheap answers come first: a candidate off the crust and outside the gather's
own marks of what lies near the crust's edge has none within reach (the marks are of the crust as the gather met it;
cells it then subducted are marked too, so the test never says "none" wrongly); a candidate under another plate's crust
is turned down before the grower's own search. The growth step and the gap owners also read the gather's
world-cell → raster-cell map rather than looking the same cells up again. −9 %.

## Add detail at 10M

Measured in Node on the same 4-core machine (3 pool workers; `perf-bench.mjs finish --cells 10000000 --width 8192`),
v3.0.1 against this branch, every output's fingerprint the same — heights, rivers, drivers, stats, geology, farming,
climate, and the 8192-px picture's every layer:

| stage | v3.0.1 | now | |
|---|---|---|---|
| mesh | 36.5 s | (46.6 s, under the surface) | |
| surface | 41.9 s | 9.9 s after the mesh | mesh + surface 78.4 → 56.5 s |
| climate | 12.1 s | 12.4 s | |
| bedrock | 9.8 s | 9.8 s | |
| rivers | 42.1 s | 42.9 s | serial: the carving's floods |
| sediment · hillslopes · ice age · wind | 14.8 s | 15.0 s | |
| sea | 12.3 s | 11.7 s | serial: floods |
| water | 33.0 s | 32.3 s | serial: floods, river years |
| detail | 2.5 s | 2.7 s | |
| geology | 13.6 s | 13.7 s | per cell: not pooled yet |
| **final climate** | 52.3 s | 21.8 s | pooled |
| deposits | 26.1 s | 26.6 s | per cell: not pooled yet |
| farming | 5.6 s | 5.8 s | |
| **picture** (8192 px) | 20.8 s | 12.6 s | pooled |
| **all of it** | **323.6 s** | **264.2 s** | **1.23×** |

On the development desktop the first audit measured the same Add detail at 183 s (149 s with the mesh built): the stages
that moved to the pool here were 44 s of that on one thread (final climate 32.7, picture 11.7) and would run on 7
workers, and the 17 s of mesh goes under the surface's 26 s. A fair expectation there is ~125–135 s for a first 10M;
it is the next thing to measure.

**Memory at 10M** (the process's resident memory, sampled five times a second from a thread of its own, this thread's
garbage collected at each stage's start: `--mem` with `node --expose-gc`):

| during | v3.0.1 | now |
|---|---|---|
| mesh / surface | 2.2 / 2.8 GB | 4.0 / 3.4 GB (the mesh is built while the workers hold their slices) |
| rivers | 4.7 GB | 4.5 GB |
| geology · final climate · deposits | 4.5 · 4.2 · 4.5 GB | 4.4 · 4.3 · 4.5 GB |
| farming | **4.9 GB** (the peak) | 4.9 GB |
| picture | 4.3 GB | **5.2 GB** (the peak) |

The pooled picture's stage holds ~0.9 GB more than drawing it in place did, and the peak moves from 4.9 to 5.2 GB. It
first held 1.3 GB more (5.6 GB); what brought it down:
- a piece's arrays are emptied the moment they are done with (`task-pool.js` `release`: `ArrayBuffer.prototype.transfer`
  — a worker's inputs when its task ends, the results once taken in) instead of waiting for the collector;
- the pixels are dealt into as many runs as keep a run to ~60K cells and ~200K pixels (168 at 10M and 8192 px, not 64),
  and no guess is kept per pixel (134 MB at 8192 px): it is worked out again for each piece;
- the final climate's runs are at most 120K cells (at a pool's sixth each they held ~0.6 GB between them);
- the rivers' ribbons went back to the finish's own thread, beside the statistics' worker: dealt out over three workers
  they were no faster, and each took a 40 MB copy of the picture.
What is left of the difference is the pool itself — an isolate a worker, each with the finish's code — the pixels' order
(134 MB at 8192 px) and the pieces in flight. With 7 workers it will be a little more (an isolate each; the pieces in
flight are two a worker, ~15 MB each). The first audit put a first 10M at 5.5 GB in the renderer: expect ~6 GB.

**What limits 10M now**, in order: the floods (rivers, water, sea: 87 s here, one thread by nature); the mesh and the
surface (57 s, both already side by side); the deposits and the rocks (26.6 + 23.5 s with bedrock: per cell, the next
to move to the pool — a third of what is left to gain exactly); the final climate (21.8 s on 3 workers: it scales with
the pool); the picture (12.6 s, of which 3.7 s is the look's whole-picture part: the rivers' ribbons, one thread).

## What was looked at and left, and why

- **The climate on its grid (6.7 s here, ~3 s on the desktop; the largest stage of Generate's and Import's finish).**
  It is three passes of the energy balance (each several rounds of three multigrid solves), two of the circulation and
  the ocean, and the rain — one chain: each reads the one before. Its profile: the solver's relaxation 25 %, the rest
  spread over forty functions. Considered:
  - *The solver on real numbers where the problem is real* (the yearly mean, the air masses, the rain, the ocean):
    about −10 % of the climate. Not exact in general: the complex arithmetic's zero imaginary parts carry signs that
    decide the sign of an exact zero in the real part, and where water is exactly zero the two paths can leave −0 and
    +0. No pixel would change, but the bytes could; it would need a proof per call site. Left.
  - *The three harmonics' solves, and the twelve months' air masses, side by side*: they are independent, and worth
    −15 to −20 % of the climate on enough cores — but the climate is synchronous through and through, and its stages
    would have to become steps that can wait on workers (as the history's and now Generate's ground are). A contained
    refactor, exact; the next thing to do for Generate's and Import's finish.
  - *Starting the climate early in Generate* — it reads only the uncarved surface, which exists ~2 s before the first
    picture is sent: the finish could begin its climate then. Exact, ~−2 s of the wait for the layers; page plumbing.
  - Its unused outputs in the coupled rounds are already lazy; the anchors' are milliseconds.
- **The history on more cores.** The gather's lookups and the birth decisions are independent pieces (~25 % of a step),
  but they read every plate's rasters, which change every step: handing them to helpers each step would cost about
  what the helpers would save (estimated, not built: a few MB a step to each helper against ~18 ms of decisions). The
  2026-09-28 assessment (~1.3× at best) stands. Its second
  resolve of a step cannot be skipped where nothing changed either: it is where a gap's second layer of crust is born.
- **Deposits and rocks** (2.9 s and 2.3 s of a 640K Add detail here; 4.5 s and 3.8 s of the desktop's 2.5M): per cell,
  their grids joined by maximum — poolable exactly, as the first audit said. Each is one long function closing over a
  dozen grids; moving them to the pool is the same work again as the final climate was, for ~8 % each. Next after the
  climate's solves.
- **Carving, hydrology, the sea** — priority floods over the whole mesh: serial by nature. Unchanged.
- **Small planets and the pool.** A worker meets its code cold. At 204K cells the final climate gained nothing from the
  pool, and Generate’s *first* ground gains less (8.9 → 8.0 s) than a Reapply’s (the pool warm: its surface 2.4 → 1.1 s).

## What an order of magnitude would take

Not exactness-preserving, so not done — the owner's call, as before:
- the history: the approximations of `plans/V2_PERFORMANCE_PLAN.md` (longer steps, slow rules less often, the world view
  by bands: together ~2–2.5×);
- the heights on the GPU (WebGPU compute; float32, so not bit-identical with today's): ~10–30× on the surface stage;
- the climate's energy balance on a coarser grid: `climate/config.js` records that at 3° it scored the same on Earth
  for about half the cost, and was turned down for its look — ice sheets in 3° blocks. Not offered again.

## The first audit's findings, now

P-01 (Add detail on one thread): the picture and the final climate are on the pool; the deposits and the rocks are not
yet. P-11 (Generate's ground on one thread): done. P-02, P-03, P-05, P-06, P-07, P-09, P-10, P-12 (the page's thread,
exports, memory, page load): not touched here — this audit kept to the simulations.

## Verification run

- `perf-bench.mjs` `--compare` against the v3.0.1 baselines: history, terrain, finish (640K, pooled and `--serial`),
  generate (pooled and `--serial`), edit, import — identical. Add detail at 10M cells and 8192 px — identical.
- The same against a v3.0.1 checkout on other seeds and sizes: histories at 20K (seed 777, 400 Myr) and 80K (seed 4242,
  150 Myr); Add detail of the 80K history's end at 640K and at 160K (the record cells as 32-bit: over 65,535 sim cells);
  Generate at 50K (below the pools' sizes: all in place) and at 1M; a Rebuild and a Reapply at 500K; Import at 1M —
  identical. The larger the planet, the more the pools give: Import at 1M 52 → 39 s, Generate at 1M 77 → 63 s (timed
  while other checks ran: indicative).
- `check-pages-exact.mjs` v3.0.1 against this branch: generate, generate `--reapply`, generate `--phone`, import,
  evolution (20K, 300 Myr, Add detail at 640K) — every message the same.
- The repo's checks, on this branch: `check-seeds` pass; `check-style` pass; `check-save` pass (both kept planet files
  open, their terrain and every export map drawn); `check-farming` 39 of 39; `check-geology` 57 of 57;
  `check-invariants` 21 of 21; `check-scale` 7 of 7.
- `check-phase8a` (3 of 47 fail) and `check-phase8b` (4 of 24 fail) were run on a v3.0.1 checkout too: the same checks
  fail there, and the two outputs are the same line for line — the terrain's own open misses (a range behind its coast,
  rivers downhill, flood basalt benched) and two time budgets this machine is too slow for. `check-present`: every
  verdict the same as v3.0.1's but for its time budgets ("ground at 60K in … ms"), of which one to four fail on either
  checkout here, by the machine's load.
- Not run: `tuning/climate/evaluate.mjs` and `coupled-check.mjs` (their reference data cannot be downloaded in this
  sandbox). The climate's code is unchanged but for two read-only additions to `koppen-soft.js`'s grid (`index`, `size`,
  `perCell`); its every output is in the fingerprints above.

## To reproduce

```
npm install                                             # delaunator, pngjs
node v2/tools/perf-bench.mjs finish --json before.json  # on the checkout to compare with (copy the tool into it)
node v2/tools/perf-bench.mjs finish --compare before.json
node tuning/dev-server.mjs 8123 &                       # and the other checkout's on 8124
node v2/tools/check-pages-exact.mjs evolution
```
