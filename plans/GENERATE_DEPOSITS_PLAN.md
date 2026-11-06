# Generate's deposits: Evolution's look and shares

Owner, 2026-11-05: "Ok now we need to revisit the deposits and food. deposits in perticuclar, it doesnt look like
evolution or have similar distribution".

Generate's Geology and Food are Evolution's own finish (plans/SHARED_CORE_PLAN.md U1). Its rocks, deposits and food
read one thing that is Generate's: the geological record, which Evolution's history keeps as it goes
(`v2/js/tectonics/step/geology.js`) and Generate writes in closed form (`v2/js/present/record.js`). So the work was to
compare that record, field by field, with Evolution's, and fix it where they differ, for the right reason each time.

## How it was measured

- `v2/out/rec-compare.mjs`: the record on the land's sim cells, for three Evolution moments (seed 432175 at 300 Myr,
  2024 at 900, 542650052 at 2180: render-deposits.mjs's) and Generate's four default planets. Settings' shares, the
  cover, its age and make-up, the wear, the arcs, each deposit system's potential, and where hosts and settings overlap.
- `v2/out/dep-compare.mjs`: the finished deposits, rocks and food, drawn by the page's own painting at 640K. Each metal's
  share of the land by latitude and setting, each system's share, and the food's soil, people, staples and ways of life.
  `--page` sends the Frame exactly as the page's worker does.
- `v2/out/dep/index.html`: Generate before and now, side by side, with Evolution's worlds below.

## What was wrong

Three bugs, and a record that left out most of what a long history leaves behind.

1. **The page's finish had no clock.** The worker copied the Frame's fields that were truthy. The present-day world's
   `time` is 0, so it was dropped, and every age-dependent rock and deposit rule in the finish read `undefined`. On the
   page: copper on 0–0.1 % of the land (Evolution: 4.5–11 %), gold under 1 %, volcanic rock 1–2 %. The checks finished
   the Frame directly, so they never saw it.
2. **The wrong clock.** Even with `time` 0, Evolution's deposit rules read "now" as the history's length: how long since
   a belt or an arc is capped at it, and a belt last active before 0 is "from before the history". So nothing faded with
   age, and every old range read as the start world's.
3. **Forelands had no fill.** The record read `recForelandKm`, which was never defined. Every foreland's cover was NaN,
   packed as 0.

The record's gaps, against Evolution's:

| Record (share of land) | Evolution | Generate before |
|---|---|---|
| Foreland basins | 35–74 % | 2–4 % |
| Rift basins | 10–21 % | under 1 % |
| Ophiolite | 2–11 % | 0.5 % |
| Basement worn (median) | 14–21 km | 0–2 km |
| Salt in the cover (90th percentile) | 0.07–0.13 | 0 |
| Organic mud on top (≥ 0.1) | 15–19 % | 5–8 % |
| Collision belts on old shelves | 25–75 % | 12–15 % |
| Flood basalts | 4–7 % | 0 |

The unworn basement was the visual one. Evolution's old crust is worn 6–16 km before its history starts, and its belts
deeper since, which turns it to granite and gneiss and wears its iron veins away. Generate's was not, so iron veins
survived on half the land: the red speckle over everything.

## What changed

- **The clock** (`present/layers.js historyFrame`, `finishFrame`). The finish gets the Frame on the history's clock: its
  time is the history's length (the cores' age, 2000 Myr), and every time is shifted by it. A docked arc's crust is born
  when its arc began. The worker sends that Frame, with its time, and the checks finish the same one. The hover's
  stories read it too. The terrain reads only differences of times, so the first picture is unchanged.
- **The record** (`present/record.js`), the history's own steps in order:
  - **The start's wear**: a shield by its own amount, the mobile belts about it 6–16 km (Evolution's `beltExhumKm`), the
    uplands more.
  - **Each belt since**: worn by its age (an old range to gneiss, its outer zone a third as deep); a live one by how much
    it stands.
  - **The platform** in the start world's sags (Evolution's `seedGeology` formula), worn off where the land stood above
    the sea since.
  - **Forelands** in front of every foreland belt, today's (still filling) and the past's (filled when it stood, worn
    since), and the overprinted ones.
  - **Rift basins** along every passive margin (where an ocean opened), each failed arm and each old parting seam.
  - **The cover's make-up laid layer on layer**, the youngest on top, as `step/geology.js deposit` keeps it, each at the
    latitude it lay at:
    - the platform, the rift basins, past forelands, inland seas (at a high stand), the shelf wedge, today's forelands;
    - carbonate in warm water far from high ground;
    - salt in the dry belt's restricted seas and rifts;
    - coal in the wet belts' forelands and coastal plains;
    - black mud in restricted seas, rift lakes and high-stand shelves.
  - **Collision belts' folded shelves**: the margins of the sea they closed, their carbonate banks (marble, skarns).
  - **The arcs**: each docked island arc with its own time in the arc, ended when it docked. An Andean margin's older arcs
    lie inland of its live one, dead the longer the further in (the Sierra Nevada behind the Cascades). Some live arcs
    saw their slab flatten or steepen.
  - **Ophiolite** on more of the sutures.
  - **Old flood basalts** (records only, in the Frame on the history's clock): 2–5 provinces, 250–1500 Myr old, worn
    to their feeders. Nickel and platinum at a craton's edge.
- **The supercontinent's iron bounds** in check-present loosened: iron ≥ 1.5 × copper (Evolution's 2180-Myr world has
  1.9 ×), and Iron Age iron ≥ 3 %. It is a desert world (dunes over 27M km²) with belts worn as deep as Evolution's
  oldest, so bog iron, laterite and iron veins are scarce. It passed before only because of bug 2.

## Numbers

From `v2/out/dep/*/summary.json`, at 640K, with Evolution at the same detail. Generate's four default planets: seeds 2,
6, 10 and 12345. "Before" is the page's own path.

| Share of land (%) | Evolution (3 worlds) | Generate before | Generate now |
|---|---|---|---|
| Iron | 19.3–26.2 | 10.4–15.1 | 17.6–18.8 |
| Copper | 4.5–11.2 | 0.0–0.1 | 2.7–4.8 |
| Gold | 3.5–5.4 | 0.6–0.9 | 1.8–2.3 |
| Lead and zinc | 5.3–7.9 | 0.9–1.2 | 2.3–3.9 |
| Tin | 0.1–2.5 | 0.0 | 0.2–0.4 |
| Nickel | 0.5–1.6 | 0.1–0.3 | 0.1 |
| Salt | 3.6–8.3 | 2.2–4.4 | 2.3–4.4 |
| Coal | 4.5–6.1 | 6.0–11.1 | 3.8–8.0 |
| Oil and gas | 8.0–16.0 | 4.8–5.9 | 5.2–6.3 |
| Rock: plutonic | 9.3–11.9 | 2.9–4.1 | 8.7–10.7 |
| Rock: volcanic | 5.3–11.0 | 1.2–1.7 | 2.5–3.5 |
| Rock: metamorphic | 19.1–21.2 | 16.8–24.8 | 16.9–21.5 |
| Rock: sedimentary | 38.8–46.8 | 48.8–54.0 | 41.2–46.0 |
| Food: people a km² | 19.8–22.4 | 19.6–24.2 | 19.8–25.1 |
| Food: farming | 53.1–60.7 | 52.4–63.2 | 51.8–63.1 |
| Food: herding | 26.0–33.6 | 20.6–25.7 | 20.5–26.0 |

check-present: 290/290.

## Open

- Gold, lead-zinc and oil reach about half to two-thirds of Evolution's shares. Their potentials match Evolution's young
  world (seed 432175). The finished ground has more young sediment over its bedrock than Evolution's (river plains,
  dunes and loess: about 25 % of the land against 19 %), from Generate's own terrain and climate, and that hides
  basement ores.
- Volcanic rock is 2.5–3.5 % against Evolution's 5–11 %. Generate's worlds have fewer arcs and young flood basalts than
  a long history piles up.
- Food was already within Evolution's shares and barely moves: soil, people, farming and herding. Herding runs a little
  lower, fish and paddy a little higher. What looks off in it is still to be named.
