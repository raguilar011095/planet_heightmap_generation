# Satellite look: natural, real, textured, the land readable — at every scale (plan)

Owner (2026-11-01): make the Satellite view at once
1. **more naturalistic**: organic shapes and borders;
2. **more realistic**;
3. **more textured and interesting**, with seamless blending between biomes;
4. **more of the terrain and height visible and obvious**;
and "all of this should be true at every scale … planet wide and close up both interesting. I don't want it to just look
blended and boring up close too."

Standing taste (memory): artistic and evocative over literal; mountains obvious at a glance; variety yes, overdone no;
the hillshade was once "too strong"; zoomed-in detail subtle and varied, never samey; rivers stay lines; one feature at a
time, each judged by eye, Today beside New.

## Where it stands (what limits it)

The Evolution Satellite view of a finished moment is built in three layers:
- **the worker's picture** (`finish/finish-cover.js`, ≤ 4096 px wide, ~10 km a pixel): each place's cover (trees, grass,
  bare, snow) from its twelve months, pulled toward its climate's colour, plus `terrainLook` (rock on rugged ground, dry
  slopes and valleys, the flow texture, a noise "mountain texture", river green);
- **the page's styling** (`evolution/sat-style.js`): each family of climates' colour by height, the families' shares
  box-blurred over 60 km and warped by noise, the worker's picture kept as brightness detail and 25 % of its colour;
- **the globe and the zoom tiles** (`climate-view.js satelliteColor`, `finish-view.js paintWindow`): that colour × the
  hillshade.

Seen on the renders (seeds 2024 @ 900 Myr, 432175 @ 300):
- **Blended, not organic.** Climates hand over as wide airbrushed gradients: two colours averaged into a muddy middle
  band (olive between green and tan), long smooth bands across continents. Every input is blurred (rain 80 km, families
  60 km, climate pull 100 km), so nothing has an edge.
- **The land reads only in the mountains.** Away from the ranges the colour barely depends on the ground: plains,
  plateaus, basins and escarpments look alike; the relief shows only as faint hillshade and the flow texture's veins.
- **Mountains read by noise, not by their ridges.** The "mountain texture" is ridged noise lit like relief; it does not
  follow the real crests and valleys. Snow sits as specks and a contour band, not in the ranges' gullies and cirques.
- **Close up it is a blur.** The zoom goes to ~0.3 km a pixel (level 9), but the colour comes from the ~10 km picture,
  enlarged 30×; only the shading has fine detail. That is the "blended and boring up close".
- **Inside a biome, one tone.** A desert is a single tan with veins; a forest a single green; an ice sheet flat white.

## The approach

Four mechanisms, shared by the planet picture and the zoom tiles, all sized in km (the same look at every Detail, as
CLAUDE.md's scale invariance asks), each with its own noise stream and its own dials (start subtle):

- **Terrain in the colour.** The heights decide the colour, not just its light: hollows and valleys vs ridges and spurs
  (the height against its surroundings, at a few sizes), the sky's light (open crests a little brighter, deep valleys and
  enclosed basins a little darker), highlands vs lowlands within a climate. The lines on mountains (trees, rock, snow) bend
  with the ground: higher on sunny slopes and spurs, lower in shaded hollows, snow lingering in gullies.
- **Mosaic edges instead of averaged ones.** Where two climates, or trees and grass, or grass and bare ground meet, a
  pixel leans to one side or the other by a patchy, multi-size, warped noise plus the terrain (forest reaching up wet
  valleys into the grassland, desert reaching along dry ridges, a steppe island on a plateau). The share of each still
  changes gradually across a wide zone, so the handover stays seamless, but its pieces are crisp (soft over a pixel or
  two), the way an ecotone looks from space. Smooth weighting throughout, no hard cut-off.
- **Detail made at the scale you look at.** Each zoom tile adds the next octaves of the same mosaic and terrain colouring
  from its own fine heights, so zooming in shows more structure rather than a blur. The same functions of place and height
  as the planet picture, so tiles meet their neighbours exactly and nothing jumps between zoom levels.
- **Ground with character.** Textures real satellites show, from the world's own data: dune seas streaked along the
  planet's winds, dark rocky plateaus and lava fields, pale gravel plains, salt pans, dry washes; rock banded along a
  range's grain; canopy mottle and glades; ice sheets with blue-white variety and darker outlet glaciers.

## Phases (each shown Today vs New, planet and close-up, before the next)

Each phase gets a comparison page (a `render-satellite` tool after `render-litho`): three worlds, each at planet scale, a
region (~3 km/px) and two zoom levels (L7, L8), Year / January / July; it opens on the close-up where the change shows,
labelled Today / New. Plus the cost: the picture stage's time at 640K and 2.5M, a tile's time.

- **P1 — The land in the colour.** Terrain position (valleys vs ridges) and the sky's light, in every climate (strong in
  dry country, gentle under forest); highlands vs lowlands within a climate; tree, rock and snow lines bent by aspect and
  hollows. Planet picture and tiles both. *Check*: plains, plateaus, basins and escarpments read at planet scale without a
  stronger hillshade; mountains show their real ridges and gullies; snow is dendritic, not a band.
- **P2 — Organic edges.** The mosaic handover between climates and between covers, replacing the blurred blends; the
  mottled one-tone interiors broken into patches. *Check*: no muddy bands where climates meet; edges look like coastlines,
  not airbrush; still no hard lines.
- **P3 — Close up.** The tiles' own colour octaves (the P1 and P2 fields continued finer, from the fine heights), varying
  place to place. *Check*: zooming from planet to level 9 keeps revealing structure; nothing blurry; no seams, no
  "samey" texture; within the tile budget (6 ms a frame, 4 on phones).
- **P4 — Ground character**, one feature at a time, each its own look: (a) deserts: dune seas by the wind, dark plateaus,
  gravel, pans, washes; (b) mountains: rock banded by the grain and the rocks; (c) forests and grassland: mottle and glades;
  (d) ice sheets and sea ice. Owner picks the order and which to keep.
- **P5 — Generate and Import** (if wanted): their Satellite view is per region, with no finished heights picture; the P1
  and P2 ideas carry over per region, close-up limited by the mesh.

## Costs and guards

- Time: the picture stage is ~5–6 s at 2.5M today. Aim: all phases together ≤ +1.5 s there; zoom tiles within budget.
  No lower resolution as a shortcut (owner: quality crutches are not optimisations).
- Worlds unchanged: only colours change; seeds build the same planets. New noise gets new streams, so no existing pattern
  re-rolls.
- Saves: if the satellite picture is stored in a detailed moment, run `node v2/tools/check-save.mjs`; old files then show
  the new look.
- README, tutorial, SEO: the Satellite view's description where it changes; What's New asked at the end.

## Questions for the owner

1. Pages: Evolution first, Generate/Import as P5 after (recommended), or all together?
2. Start order: P1 (terrain) first, since P2 and P3 use its fields (recommended), or P3 (close-up) first?

## Decided (owner, 2026-11-01)

- Build P1, P2 and P4 for now, on Evolution, off `main` (branch `satellite-look`). P3 (close-up colour) parked: exports
  must stay the same as the view — it could work "through the scales" (an export at a size equal to the zoom at that size,
  as the fine shading already is), to revisit later. P5 not now.
- **P2 takes the owner's scalar climate**: each place's share of its climate and the two it is most like, from how near it
  sits to each Köppen threshold (coldest month by 18° / 0°, warmest by 10° / 22°, rain by the dry line) — transitions wide
  where the climate changes slowly, tight across a rain shadow; P2's mosaic decides where each share's pieces go.
- The rivers' green "a little too heavy handed and samey … tightened up … should probably extend to around freshwater
  lakes too" → P1b.

## P1 and P1b built (2026-11-01), awaiting the owner

- **P1** (`sat-style.js SAT_TERRAIN`): the topographic position at 40 / 120 / 350 km (each on its own coarse grid, then
  laid on the finest); hollows × (0.62, 0.8, 0.6)^lean, ridges × (1.3, 1.2, 1.05)^lean, lean 0.5 wet → 1 dry; sky light
  ± 30 %; highlands up to 35 % greyer from 0.6 to 3 km; tree and snow lines bent by 1.2 / 1.4 × the height above the
  40 km mean, ± 0.2 / 0.35 km by aspect, ± 0.2 / 0.3 km of noise (70 km); the snow's edge 0.45 × as wide. Tuned on the
  regions by eye (four strengths side by side): the first cut was too faint, a stronger one crumpled the plains evenly,
  so the larger sizes weigh most.
- **P1b** (`RIPARIAN`): ribbons 3.5 → 9 km to each side (was a 15–50 km cone), a soft bell, × 1.6 on floodplains; the
  place's own colour × (0.34, 0.58, 0.28)^share (was one fixed green), patchy along the course (± 40 % per sd of a 55 km
  noise); fresh lakes' shores 7 km.
- Cost: styling a season 1.5 → 2.0 s (the year 1.9 → 2.4 s, the first time the view is shown; 2.5M, 4096 px). Most of the
  styling's time is the climates' blend (its warp noise and blurs), which P2 replaces.
- Renders: `node --max-old-space-size=16000 v2/tools/render-satellite.mjs --phase …` → v2/out/satellite/index.html.

## P2 and P4 built (2026-11-01), all versions on the page for the owner to pick between

Owner: "do all the next versions and let me tweak between them as needed"; and, mid-way: "make sure … we are blending
things that make sense, for example height generated snow/ice should track the mountaintops closely".

- **P2** — `climate/koppen-soft.js`: `softFamilies` (Köppen's tests with soft steps — at zero softness it gives
  classifyCell's family: 200 000 random climates, all agree; the shares sum to 1); the finish gathers them on a 1024 × 512
  grid (≤ 4 places a cell, so the work is bounded at any detail; ~5 MB, saved with the moment as `climate.raster.families`;
  older moments keep the old blend). Page: `SAT_MOSAIC` — the families take turns along one warped noise (90 km, four
  octaves), wet to dry, each over its share; the ground leans it (hollows and pole-facing slopes wetter); edges soft over
  0.04 of the noise; 12 % of the plain average kept. The lines: the family colours split into the lowland colour (BIOME,
  by the mosaic), the rock's share and colour (RT, ROCKP) and the snow's share (SNOWS) — by the smooth shares, so rock and
  snow follow the height, never the patches; the snow's noise wobble cut to ±0.06 km (was 0.3), the tree line's ±0.12.
- **P4** — `SAT_GROUND`, each part switchable: rocks (bedrock tints on bare ground, 55 %), dunes (the drivers' erg, wind,
  duneMode: stripes 45 km apart, ±22 %), bands (fold, foldDir: 42 km, ±25 %, 45 % under plants), cover (canopy patches
  75 km, denser in hollows, regional variety), ice (bluer margins, flow streaks, darker outlets). Stripes narrower than four
  pixels fade out.
- Versions on the page: P2, P4a (rocks + dunes), P4b (+ bands), P4c (+ cover), P4d (+ ice) — rendered from one code with
  `render-satellite.mjs --set SAT_GROUND.x.on=false,…` (any setting can be changed that way per render).
- Cost (2.5M, 4096 px, the first time a season is shown): today 1.5 s (the year 1.9 s) → P2 2.0 s → P4d 2.6 s (the year
  3.0–3.4 s). A speed pass after the owner picks what to keep (season-independent parts computed once; noise on coarser
  grids). check-save passes (old files keep the old blend).

## P2b (2026-11-01): smooth, layered (owner: P2 "way too sharp")

Owner: "It should blend way way more smoothly, the idea is the share would help blending but this sort of did the opposite
… combined with some blending (or maybe also some like 'similarity aware blending' over longer distances) and then
layered onto one another." Now (`SAT_BLEND`, `blendShares`): the shares blurred over ±140 km, then a blur over ±600 km
guided by the lowland colours (each neighbour × exp(−Δ² / 2 · 0.16²) of their sRGB difference; on a grid 4× coarser),
laid over at 60 %; the mosaic only a quarter over that (`blend` 0.75), its edges softer (0.1), unwarped while faint,
three octaves, shares ≥ 5 %. Speed: boxBlur's columns a row at a time and its rows without modulo — byte-identical, 4×
faster (231 → 56 ms a call at 4096; it runs twice a season, today's look included). P4d: a season 2.2–2.5 s, the year
2.7–3.1 s (today 1.5 / 1.9 s; today's own would now be ~1.15 / 1.55 s with the faster blur).

## P6 (2026-11-01): calmer close detail, large-scale features, a smooth zoomed-out globe

Owner: "when zooming out, the planet looks a bit too noisy … P1 being too detailed/strong … or little long range/high
scale noise/features outside of climate and mountain ranges"; "lets do all 3 at once".

Measured (land brightness variation, rms % by scale, planet at ~20 km/px): today fine 5.6 / small 4.6 / mid 5.2 /
large 7.3 → P4d 7.3 / 5.6 / 5.4 / 7.1 — the added variation was all fine and small; the large scale had calmed.
- **P1 rebalanced**: each size of the topographic position against the next smaller one's mean (a band: the 120 and 350
  km sizes had carried every pixel's bump through "− the place's own height"); weights [0.12, 0.3, 0.58]; the 40 km size
  only where the place stands 60–220 m off its surroundings (`tpGateKm`). → fine 6.2, small 4.8 (today +10 %, +6 %).
- **`SAT_MACRO`**: bedrock provinces (rock tints averaged over ±220 km, 35 % under plants), basins and plateaus (the
  ±900 km mean against the 120 km mean, ±0.45 km full), floodplain belts along rivers ≥ 1500 m³/s on low ground (22–75 km
  to each side), the ice age's scoured ground (drivers ice × scour, over ±70 km) — on a 1024 grid, once per moment.
  Mostly colour, not brightness: large-scale colour variation +3 % (planet) … +11 % (zoomed out).
- **The globe's texture with mipmaps** and 8× anisotropy (globe-view.js `look`; gpu-paint.js's target); the map view
  picks its level from the box's own scale (textureLod; GLSL 1 falls back to the old sampling). Zoomed out (the 4096
  texture at a quarter): fine variation −22 … −28 % against today's globe. +⅓ texture memory (~11 MB at 4096).
- Comparison page: "Zoomed out (as the globe shows it)" — today point-sampled (rendered from main's own code in a scratch
  worktree), P6 averaged. Headless smoke test (load a planet file, Satellite on the globe and the map): no shader errors;
  the only error, "the terrain pool was closed", happens on main too (a file loaded while the first world builds).
- Cost: a season 2.5–2.9 s, the year 3.2–3.7 s on first view (speed pass pending).

## P7 (2026-11-01): a little more close detail, a little less blending

Owner on P6: "strictly better, but maybe we lost a little too much detail up close"; "maybe slightly decreasing the
blending on 2b could help too". With the globe's mipmaps averaging fine detail away when zoomed out, more of it can come
back close in: `tpWeight` [0.27, 0.3, 0.48], `tpGateKm` [0.025, 0.1], `tpDepthKm[0]` 0.11 (between two tried levels: at
region scale both brought back P4d's crinkle in the hills; zoomed out they raised fine variation only 1–4 %);
`SAT_BLEND` short 140 → 100 km, long 600 → 500 km at 45 % (was 60 %); the mosaic 30 % (was 25 %). Zoomed out (averaged,
rms brightness % fine / small / mid / large): today 8.2 / 4.3 / 6.1 / 9.5, P6 5.9 / 3.9 / 6.2 / 9.1, P7 6.0 / 3.9 / 6.2 /
9.2; large-scale colour today 7.1 → P7 7.6. Cost: a season ~2.5–2.8 s, the year ~3.2–3.6 s on first view.

## P8 (2026-11-01): a baseline colour cube — realistic, to hybridise

Owner: asked how much the view follows temperature and rain outside the classes — measured, within each family's
lowlands (driest vs wettest quarter, colour distance): the view kept ~25–60 % of the cover model's own response (steppe
6 vs 19, continental 4 vs 16, taiga 4 vs 8 for rain). Then: "a simple blended baseline color 'cube' colored by rain,
temperature and maybe slope/height … another color layer that helps blend everything together"; and "those colors …
closer to the 'dull colors' that are more realistic as well as a way to nicely blend or hybridize with this stylized
version". `SAT_CUBE`: a colour per (the year's mean °C, log rain) — `realism` 1: the cover model (finish-cover.js
landCover + coverRgb, Blue Marble's fit) run on a smooth year at each grid point (9 × 8; the seasons' swing 2 → 22 °C
from the tropics to the cold; its snow removed, so snow stays the climate's own), for the year, January and July;
`realism` 0: a hand-made Whittaker chart (5 × 5, winter dormant where cool) — toward rock with height and slope, laid
over the families' colours at `share` (40 %) before P6/P4/P1. Versions: P8 (realistic 40 %), P8-more-real (60 %),
P8-stylised-cube (stylised 40 %). Cost: the cube ~0.35 s a season; a season ~3.1 s, the year ~3.9 s on first view
(today 1.5 / 1.9 s) — the speed pass is due once the look settles.

## Chosen: the realistic cube at 60 % (owner: "the more real 60% is the way to go for sure"); the speed pass begun

`SAT_CUBE.share` 0.6 (the page's P8-more-real). Exact speed work (fingerprints of the styled pictures, three worlds ×
three seasons, sha-256, identical before and after): latBlur's columns a row at a time and its rows without modulo (2–3×
on the grids); the stylised cube skipped where the realistic one replaces it. ~10 % — the rest is spread over the
per-pixel work (the loop 44 %, noise 15 %, blurs 16 %), no single hotspot. Today a season ~3.0–3.3 s, the year ~3.3–3.6 s
on first view (main: 1.5 / 1.9 s). The visible wait needs a structural change (to decide with the owner): styling in the
background after Add detail (time-sliced on the page, ready by the time the view is opened), or in the finish worker
(adds ~5 s to Add detail), or across workers.

## Drawn ahead in the background (owner chose option 1, 2026-11-01)

`sat-style.js`: the styled picture is a job (`styledJob`): its shared fields one step each (the climates' shares, the
banks, the land's means, the large-scale features), the season's own set-up in three (the realistic picture's detail,
its blur, the land's blur, ≤ ~55 ms each), then its rows eight at a time; `styledSatellite` runs it to the end,
`prepareSatellite(…, budgetMs)` a slice of it. Byte-identical either way (fingerprints, nine pictures, run whole and in
10 ms slices). `evolution-main.js prepareSatelliteSoon`: with a detailed moment shown, its season drawn ~7 ms every 16 ms
(the globe draws all the time: idle callbacks came only at their timeout); the other two once the Satellite view is open.
Headless check (a planet file loaded): the year ready ~4.5 s after loading, January and July after the view was opened.
The first season's shared steps are 90–160 ms each (once a moment). Found on the way: a dev server started from another
checkout had served old code to the first browser checks — re-run with the right one: globe and map draw, no errors.

## Proposed next: clouds (P9) — owner, 2026-11-01: "an atmosphere/cloud simulation … partially inspired by the climate/rain
too (but still realistic looking)" — plan to be agreed before building.

## P9 built (2026-11-01): clouds

Owner: "on by default with a toggle. Can drift over time but only on visual, Clouds as a layer and satellite with clouds";
"there are a ton of implementations of this out there that look really good, we do not need to reinvent the wheel …
start with noise patterns/techniques that already work and just gently shift things."
- `v2/js/view/clouds.js`: `CLOUDS` settings; `cloudCover(C, season)` (360 × 180 bytes: base + rain × (1 − e^(−P/90 mm))
  − pressure above 1013 hPa; a zonal pattern with no climate); `CLOUD_GLSL` — integer-hash value noise, fbm with
  Quilez's rotated octaves, domain warp, squeezed north–south (stretch 1.8), threshold ½ + spread × (½ − cover)
  (cover 0.1 → 9 % of the sky, 0.5 → 46 %, 0.9 → 87 %), × contrast; `cloudDensityAt` / `cloudPicture` its JavaScript twin
  (an export: drawn ≤ 4096 wide and enlarged; ~4 s at 2048 × 1024 in node).
- `globe-view.js`: two shells (shadow 1.0015, clouds 1.004) and the map view's composite share the uniforms; the
  atmosphere's halo drawn after; `cloudTick` redraws ~12 a second while they show and drift; `setClouds({on, cover,
  octaves, shadow})`. `evolution-main.js syncClouds`: on Terrain and Satellite, the cover from the detailed moment's
  climate, else the moment's calculated one, else the latitudes; phones 4 octaves, no shadows. `export.js`: rows
  `satelliteClouds`, `clouds`.
- Headless checks (desktop and an emulated iPhone 13): globe and map draw them, no console problems.

## P9 redone (2026-11-01): clouds between the two attempts, after a look at what others do

Owner: v1 "looks kind of bad, have it only be in the satellite mode after the world climate can shift it"; then, between
v1 (warped fbm) and v2 (Perlin-Worley, cotton balls): "somewhere in between the 2. Also, research how other people
procedurally generate clouds on globes". Found: Musgrave's planetclouds (fBm over a noise-distorted domain, an offset
where clouds vanish), Quilez's warp of a warp, latitude-belt cover (vvanhee/earth-wallpaper: ITCZ, subtropical highs,
storm tracks), curl noise / vortices for storms (Bridson; Gaseous Giganticus), Schneider's Perlin-Worley erosion; and
that some (Space Nerds in Space, early SpaceEngine) gave up and used NASA cloud images. v3: the 3-D texture (R Perlin fbm
normalised, G B A Worley fbm) through the double warp; the cover cuts it (mid 0.54 ± 0.32 × (½ − cover), crisp ±0.09),
a veil under the cut, Worley erosion at the edges; 11 storms a world (seed) in 35–63°, Rodrigues spiral (twist 4 ×
strength × e^(−r²), 900 km × 0.6–1.4); lit toward the north-west; shadow. Satellite view only, from the detailed
moment's own climate. GLSL and JS share it; the export's storms from the export look's seed. Headless checks (desktop,
iPhone 13): no console problems.

## P9 v4 (2026-11-01): physical layers, real circulation, evolving

Owner: "what about actual atmospheric circulation as well as adding different physical layers of clouds … different types
of cloud coverage at different latitudes"; and on v3 live: "the clouds are just moving with the same noise not changing
… a 3d or 4d noise … we scroll through … that can change over time that is manipulated by the climate a bit".
- `cloudFields(C, season)`: four covers (RGBA, 1°): low (cool upwelling seas × high pressure × 8–55°; polar sea stratus),
  convective (warm × wet; warm summer land), frontal (storm tracks 28–76° × (wet, low pressure against the latitude's
  mean); cool rainy country; less under highs), cirrus (frontal + tropical anvils, less under highs) — smoothed ±3° (±5°);
  and the season's wind (RGBA).
- `cloudStorms(seed, C, season)`: the season's slp minima in 35–68° (local, ≥ 2 hPa below the row's mean, ≥ 18° apart),
  then seeded along wet tracks, then ≤ 3 tropical cyclones over ≥ 27 °C seas at 8–24° (size < 0.6: tighter, convective).
- `cloudRaw` (GLSL and JS alike): the four noises — frontal (warp of a warp, main octave smeared ±130 km along the wind),
  low (Worley 8-cell fbm + Perlin), convective (Worley 16 + Perlin clusters), cirrus (5-tap LIC ±350 km along the wind);
  cut by each one's quantiles (`cloudQuantiles`: measured, in CLOUDS.Q*). Over time: the warps' inputs move through the
  noise at different velocities (`evolve` 0.009 /s), and a two-phase flow map carries each phase along the local wind
  (`flowKm` 120 per m/s per `flowPeriod` 9 s), cross-faded with the variance kept.
- Composite: low (grey 0.86, 78 %), then convective/frontal (frontal lit), then cirrus (38 %); the shadow from all but
  cirrus. Export ≤ 2048 px drawn, enlarged beyond (~5 s at 2048 in node).
- Headless (desktop, iPhone 13): compiles, draws, frames 8 s apart differ by re-formed shapes.
- Owner on v4: "the swirls are too strong and defined … the speeds at the equator are slightly too fast and at the north
  slightly too slow" → storms twist 4 → 2.2 over 1100 km (was 900), cover boost 0.15 → 0.1, tropical ×1.2 (was 1.4);
  drift by a speed profile on the ground (`cloudDriftRate`: −0.55 at the equator, +0.95 at 52°, width 22°; deg/s at 0°
  0.25 → 0.14, 50° 0.14 → 0.24, 70° 0.07 → 0.12), and the wind flow × 0.55 in the tropics → × 1.35 from 45° (`flowLat`).
- Owner: "slightly too ribbony around the tropics … not really as 'cloudy' … I think it will trick me into thinking its
  more cloudy" → the wind smear × 0.25 in the tropics rising to all from 18 → 38° (`streakLat`: the jets' streets, the
  trades' broken cells); the cues real-time clouds use: billowy (cauliflower) erosion — the inverted cellular detail
  (`billow` 0.7); thickness past the cut (`thick` 0.14): thin edges greyer (0.82) and more see-through (0.68 of the
  opacity), dense cores white; the billows' relief lit from the north-west (a second read of the detail a quarter-cell
  toward the light, `relief` 0.55) — in place of the 60 km light step (a second full evaluation: the shader is cheaper).
- Owner: "the swirls should be way way weaker … larger scales. The ribbons look to be too evenly spaced" → storms twist
  2.2 → 0.6, their cloud 0.1 → 0.04; masses 4500 → 6000 km; a weather noise ~11× larger (`weatherScale` 0.11) scaling
  every layer's cover × (1 ± 0.6) — clear stays clear — and, read again at 1.7×, whether a region streaks (`streakVary`
  0.6), both slowly evolving; the cirrus from two sizes (× 1 and × 2.3) through the frontal warp, so its streaks bunch
  and part (quantiles re-measured).
- Owner: "as we let the clouds just keep going it looks like everything is getting super thin" — the drift was a turn by
  latitude that grew without bound: neighbouring latitudes slid ever further apart and sheared the clouds into threads
  (and it ran backwards: the tropics east, the westerlies west). Now the drift is part of the flow map (east by its
  rate × cos latitude × the period, reset each period with the wind's), the storms' centres turned with it at their own
  latitude. Measured (JS, July, 360 × 180): mean cloud 0.35 / 0.38 / 0.39 and the N-S / E-W edge ratio 1.47 / 1.52 /
  1.51 at 0 / 5 / 20 minutes — no thinning.
- Owner: "the noise in the months should be not the same, or maybe just correlated" → each season reads the noise at its
  own offset (`CLOUD_SEASON_OFFSET`, carried in cloudFields' result: January and July ±(0.42, −0.3, 0.25), the year
  between): past a cloud mass, but a fraction of a weather system. Measured (frontal layer, flat cover): the clouds as
  drawn correlate 0.04–0.11 between seasons, their large pattern (±15°) 0.39–0.49 — related, not the same.
- Owner: that change "was good but slightly too strong, tone it down a little" → a third of the way back: masses 5400 km,
  storms twist 1.1, cloud 0.06; weather × (1 ± 0.45), streak patchiness 0.45; the cirrus warped 0.45, its finer size 30 %
  (`cirrusWarp`, `cirrusFine`; quantiles re-measured).

## Efficiency pass (2026-11-01, owner: "lets find ways to improve efficiency")

Measured first (the globe on SwiftShader — CPU-emulated, so relative: auto-rotate, a redraw each frame): clouds on 229 ms,
off 28 ms — the clouds ~88 % of the drawing; the export's cloud picture 14.5 s at 2048; the noise texture 607 ms.
- Noise texture: each lattice's gradients and cell points worked out once (`lattice`) — byte-identical, 607 → 461 ms.
- Shader: a layer whose cover is under 1 % is not worked out (all four: clear sky, nothing more); the shadow's pass
  (`fast`) without cirrus, veil, billows or the wind's smear; cirrus 3 + 3 taps (1.6 × apart) for 5 + 5; the storms'
  drifted centres on the CPU once a frame (`cloudStormsAt`) — they were three trig functions per storm per pixel; the warp
  of a warp worked out once and shared by the flow's two phases. Clouds 201 → 139 ms (−31 %).
- Export: the shadow read from the clouds' own grid where each place's shadow falls from, not the clouds again; with the
  above, 14.5 → 5.9 s at 2048.
- Look: the same but for fewer stray specks over near-clear skies and slightly different cirrus wisps (alpha mean |Δ|
  9.8/255). Headless checks (desktop, iPhone 13): draws, no console problems.

## Review fixes (2026-11-01, PR #89 review, owner: "lets take on 1-15")

- Clouds: the drift's clock starts when the clouds are shown (and with fresh fields or storms), not at page load (1); the
  export's storms from the world's numeric seed — a word seed's text gave other storms than the globe's (2); the shadow
  falls toward the local north-west (`cloudTowardLight`, a step along the sphere) on the globe, the map and the export,
  not one fixed 3-D offset (4); on a phone the map's composite skips the shadow too, as the globe does (7); the export
  keeps one cloud grid per moment and season (`cloudGrid`, ≤ 2048 wide) for both cloud rows (13) and lays it over the
  picture in place (`cloudOver`) — no second full-size picture (12); "Satellite with clouds" equals the Clouds layer laid
  over the Satellite picture to the byte.
- Stripes (3): the dunes, the fold bands and the ice's flow streaks were waves across km east of the 0° meridian
  (lon × cos lat) — sheared away from it (far from it to aliased speckle) with a seam at the date line. Now phasor noise
  (Tricard et al. 2019) on a 3-D lattice of kernels 4 stripes apart, the waves across the local direction: no seam, no
  shear, the odd fork where kernels meet; their wavering and breaks from 3-D noise. A kernel's phase needs no sine of its
  own (the place's term drops out — the direction is a tangent): four complex factors and a sine table; stripes fainter
  than 0.2 % not worked out. Whole picture +2 % (3.57 → 3.63 s, a 4096 picture).
- The banks and the floodplains were stamped half a pixel south-east of their rivers and lakes (5): one shared stamp
  (`stampRibbon`, 14), each pixel's centre at its index.
- Drawn ahead (6, 8, 9): every shared step is a generator yielding every 64 rows (or a few ms), the rows one at a time at
  4096 wide — longest slice ~15–25 ms (was 90–160; the first rows' JIT the longest), byte-identical whole or in slices
  (nine fingerprints); a step that throws drops its job (the next call starts afresh) and the page stops drawing that
  moment ahead (it says so in the console); the page stops when its moment is let go (another detailed, a retry after
  running out of memory, a new world). The blurs are one (`blurGen`: a radius per row) and the cold-dry test one
  (`coldDry`, Generate and Import's too) — byte-identical (14).
- Legend and Satellite tab: no longer "cloud-free"; the fresh lakes named (10). The climates' shares: the
  months-above-10 °C line between 3 and 4 (3½ ± softness — a count of 4 had half the continental share); with softness 0
  still classifyCell's family for 200 000 random climates of 200 000 (11). The render tool finishes a cached moment again
  when its cache predates that (a version in the cache, 15).
- Checks: check-save passes; headless desktop globe, map and iPhone 13: draws, no console problems.

## Clouds: soft edges, no loop (2026-11-01, owner: "some of the clouds have very sharp edges" / "the 3d noise loops but you can see it going from the end to the start and it isnt smooth at all")

- Edges, found by rendering the clouds alone and finding the sharpest steps: (1) a layer under 1 % cover was skipped
  (the efficiency pass), but its cut there still let ~5 % of the sky through — clouds cut off along that cover's contour,
  the veil likewise at 2 %: the cut now goes on past the 95 % quantile toward none and each layer fades out by 1–4 %
  cover; (2) the cumulus and low decks' edges a pixel wide on the globe (their noise steeper than its edge): edges wider
  (low 0.08, convective 0.065, frontal 0.09) and every edge at least its layer's 90 % noise steepness × a pixel
  (`CLOUDS.aa`, measured: low 22.6, convective 38.7, frontal 30.8, cirrus 63 noise units a radian) — about two pixels
  however far out, its own width up close; (3) the texture's finest Worley octave was a cell a texel (noise per texel —
  faceted shards): octaves to two texels a cell (QConv re-measured); (4) a storm's turn was cut at 26° from its centre
  though the largest reach further — a circular seam: the turn fades to nothing at 2.2 of its sizes. Sharp steps (alpha
  > 90/255 between neighbours at 2048): 89 000 → 31 000.
- The loop: each flow phase came back to the same noise every period — the clouds glided forward and then faded back to
  where they started; the billows switched phase abruptly half-way. Now each period a fresh place in the noise (offsets
  from a low-discrepancy sequence by the period's number: the first period at none, so the globe at time 0 is the
  export's moment), the phases faded by sin² (smooth), the billows of both cross-faded; period 12 s, its distance 160 km
  per m/s (the same speed). Alike one period on: 0.51 → 0.38 (what is left: the cover, the weather, the warps).
- Cost (SwiftShader, relative): clouds 139 → ~155 ms (the second phase's billows); on a phone (unlit) no billow relief
  is worked out, so no more texture reads than before.
