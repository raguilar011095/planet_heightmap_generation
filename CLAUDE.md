# CLAUDE.md

## Project Overview

World Orogen — a browser-based procedural planet generator using Three.js and ES modules with no build step.

**World Orogen is concept art for planets, not a geophysical simulator.** Every feature should prioritize making the output *look* more believable or helping users iterate faster. Never slow down generation to chase physical accuracy — if a simpler approximation looks just as good, use it. However, the scientific grounding is what makes the output convincing: tectonic models inspired by real geology, pressure-driven wind patterns, and Köppen classification aren't optional polish — they're the reason the output passes the glance test. Preserve and extend this scientific foundation whenever it serves the visuals. The tool's job is to be the fastest path from a blank page to a world worth building on.

## Guiding Principles

All three tenets should be considered simultaneously. When they conflict, break ties in this order:

1. **Artistic appeal** — The output should look visually interesting and compelling, informed by real science but not constrained by it. Aesthetics come first.
2. **Ease of use and efficiency** — The interface should be approachable and intuitive. Generation should be fast. Don't sacrifice usability for realism.
3. **Scientific plausibility** — Terrain, tectonics, and geology should be grounded in real planetary science. Results don't need to be physically accurate simulations, but they should be believable.

## What Users Love (Protect These)

User feedback consistently highlights these as World Orogen's core strengths. Any change should preserve or enhance them — never degrade them as a side effect.

1. **Climate simulation depth** — The climate view (wind, ocean currents, precipitation, Köppen) is the single most-cited differentiator. Users call it "the only map generator with this level of detail" and say it's what sets Orogen apart from Azgaar and every other tool. Never simplify or remove climate layers. When adding features, consider whether they can leverage the climate system (e.g. rivers fed by precipitation, settlements placed by climate).

2. **Instant, in-browser, zero-friction** — No install, no account, no build step. Users love that they can open a URL and have a planet in seconds. Never add mandatory sign-up, downloads, or server dependencies. Keep generation fast — if a feature risks slowing generation significantly, make it optional or deferred (like the on-demand climate on phones above 640K regions).

3. **Interactive plate editing** — Users say "haven't seen this functionality anywhere else." The Ctrl-click multi-select → Rebuild workflow is a key differentiator. Don't break this interaction pattern. Extend it (e.g. plate direction editing) rather than replacing it.

4. **True globe with proper wrapping** — Users who came from Azgaar specifically cite the globe as a reason they switched. The globe-first experience, equirectangular map as secondary view, and seamless wrapping matter. Don't make the map view primary or break globe rendering.

5. **Free and open source** — Repeatedly praised. No paywalls, no feature-gating, no "pro" tier. This is a trust signal that drives adoption and contributions.

6. **Works on mobile** — Users are surprised it runs well on phones. Maintain the responsive bottom-sheet layout, touch targets, and pinch-to-zoom. Don't add features that only work on desktop without a mobile equivalent.

7. **Terrain aesthetics** — "Fractal-looking mountains," realistic erosion, organic coastlines. The visual quality of the terrain itself gets specific praise. Protect the artistic output of the erosion and terrain post-processing pipeline.

When proposing a new feature or change, ask: "Does this preserve all seven strengths above?" If it trades one for another, flag the tradeoff explicitly.

## Key Rules

After any code change, check whether README.md needs updating. The README documents all UI controls, features, algorithms, and project structure. If a change adds, removes, or modifies any of the following, update the README to match:

- Sliders, dropdowns, toggles, or other UI controls (names, ranges, defaults)
- User interactions (keyboard shortcuts, mouse actions, edit behaviors)
- Generation pipeline steps or algorithms
- Visual features (rendering, overlays, debug layers)
- Project file structure (new files, renamed files, removed files)
- External dependencies

After any code change, check whether the tutorial modal content (in `generate.html`, inside `#tutorialOverlay`) needs updating. The tutorial steps describe the app's features and interactions. If a change adds, removes, or modifies any of the following, update the relevant tutorial step to match:

- Core workflow (how to generate a planet, what controls to use)
- Interactive features (navigation, editing, keyboard/mouse actions)
- What the tool does or its key selling points

After any code change that adds significant user-facing features, ask the developer if they would like to update the What's New modal (in `generate.html`, inside `#whatsNewOverlay`). The modal is version-gated by the `VERSION` constant in `initWhatsNew()` in `js/main.js` — bumping this string will show the modal again to returning users on their next visit.

After any code change that affects the UI, ensure it works on mobile. The app uses a responsive bottom-sheet layout on screens ≤ 768px (`styles.css` media queries) and has touch-specific behavior throughout. If a change adds, removes, or modifies any of the following, verify and update the mobile experience:

- New buttons or controls — must have ≥ 44px touch targets on mobile (see `@media (max-width: 768px)` in `styles.css`)
- New interactions — must have touch equivalents; desktop uses Ctrl-click for plate editing, mobile uses `state.editMode` toggle (`js/edit-mode.js`); desktop uses scroll-to-zoom, mobile uses pinch (`js/scene.js`)
- Tooltips — must reposition above their trigger on mobile, not to the right (overflow off-screen)
- New overlays or modals — must be usable within the bottom-sheet layout and not be hidden behind it
- Performance-sensitive features — consider lower thresholds on touch devices (detail warnings, export limits); check `state.isTouchDevice` in `js/state.js`
- Info/hint text — update both desktop text (in `generate.html`) and the mobile-specific text set in `js/main.js` (search for `state.isTouchDevice`)

After any code change to simulation or climate code, ensure **scale invariance** — the result must look equivalent regardless of the Detail slider (numRegions from 2K to 2.5M). The key rule: never use raw cell-hop counts or neighbor-displacement magnitudes without scaling by resolution. Specifically:

- **Smoothing passes** must target a physical distance: `Math.max(minPasses, Math.round(targetKm / avgEdgeKm))` where `avgEdgeKm = (π × 6371) / √numRegions`. Never write a bare `smooth(mesh, field, 5)`.
- **Multipliers on neighbor-displacement quantities** (e.g. wind convergence, which sums `wind · displacement`) must normalize by `avgEdgeRad = π / √numRegions` since displacement magnitudes shrink at higher resolution.
- **BFS hop thresholds** must be expressed as `Math.round(targetKm / avgEdgeKm)`, not as fixed integers.
- **Thresholds in physical units** (degrees latitude, km altitude, °C, mm precipitation) are inherently scale-invariant and do NOT need scaling — e.g. "28° from ITCZ" or "heightKm > 1.5" are fine at any resolution.
- When in doubt, ask: "if I double numRegions, does this value change meaning?" If yes, it needs scaling.

Generate, Import and Evolution all run one climate — the new climate in `v2/js/climate/` (Generate and Import through `js/climate-new.js`; their Inspect layers, colours, legends and readouts in `js/climate-layers.js`; see `plans/V1_NEW_CLIMATE_PLAN.md`). Its tunable parameters live in `v2/js/climate/config.js` (mutable `PARAMS`, each with a literature range in `PARAM_PRIORS`; the terrain equivalent is `terrain-config.js`). When adding a new tunable constant to the climate, prefer adding it there (with its range in `PARAM_PRIORS`) over hardcoding. After any change to climate simulation behavior, run the automated Earth-match check: `node tuning/climate/evaluate.mjs` scores the simulated Köppen zones of an imported Earth heightmap against the real Köppen-Geiger classification, and `node tuning/climate/coupled-check.mjs --quick` scores every stage (temperature, pressure and wind, ocean, rain, Köppen) against observations (see `tuning/climate/README.md`; the reference data is downloaded once with `node tuning/climate/fetch-references.mjs`); make sure neither regressed. `node tuning/climate/coupled-check.mjs --tune` tunes the parameters against real Earth, each within its `PARAM_PRIORS` range.

After any code change that adds, removes, or modifies features, check whether the SEO and AISEO files need updating. The project has several files that describe the app to search engines and AI models. These must stay accurate — outdated claims are worse than no claims. If a change adds, removes, or modifies any of the following, update the relevant files:

- **`generate.html` `<head>` meta tags** (Generate, at `/generate`; the home page, `index.html`, is the Studio, with its own) — The `<title>`, `description`, `og:description`, `twitter:description`, and `keywords` meta tags describe what the app does. Update if core capabilities change (e.g. new simulation type, new export format, new interaction mode).
- **`generate.html` JSON-LD structured data** — The `<script type="application/ld+json">` block contains a `WebApplication` schema with a `featureList` array. Add or remove entries when major features are added or removed.
- **`generate.html` hidden `<main>` block** — The visually hidden semantic HTML block (right after `<body>`) describes the app for crawlers. Update its feature list, use cases, or description when the app's capabilities change meaningfully.
- **`llms.txt`** — A plain-text file at the project root that describes the tool for AI assistants. Update its feature list, "who it's for" section, or technical details when capabilities change. Keep it concise and factual.
- **`sitemap.xml`** — Update the `<lastmod>` date when deploying significant changes.

Files that rarely need updating: `robots.txt` (only if adding pages or restricting crawlers), `CNAME` (only if domain changes), `preview.png` (only if the app's visual appearance changes dramatically).

After any code change that adds, removes, or modifies slider controls, update the planet code encoding in `js/planet-code.js` to match. The planet code packs the seed and all slider values into a compact base36 string using mixed-radix integer packing. If a slider's range, step, or count changes, or if a new slider is added, update:

- The `SLIDERS` array (min, step, count for each slider)
- The `RADICES` array (the count values in right-to-left order)
- The `encodePlanetCode` and `decodePlanetCode` functions (packing/unpacking order)
- The corresponding slider wiring in `js/main.js` (the `map` objects in the `generate-done` handler, `applyCode`, and hash-loading code)

Every seed ever shared must build its world again. Never change `js/rng.js`'s `makeRng`, how `v2/js/core/seed.js` reads a typed seed or hashes a word, or the planet code's seed digit; seeds run 0 … 2,147,483,645 (the generator's every starting state) on both pages. After touching any of them, run `node v2/tools/check-seeds.mjs`.

After any code change to what an Evolution history frame or detailed moment holds (`v2/js/tectonics/snapshot.js`, `frame-pack.js`, `v2/js/finish/`), or to `v2/js/save/`, run `node v2/tools/check-save.mjs`: planet files (`.orogen`, the Export panel's Save planet) saved by an earlier version must keep opening. Adding data needs nothing — a new per-cell frame field goes in `snapshot.js`'s `frameArrays`, and an older file reads it as zeros. Changing the **meaning** of saved data (an enum's numbering, a byte scale, a layout, row order) needs its version bumped in `v2/js/save/versions.js`, a step from the old meaning in `v2/js/save/migrations.js` (for a detailed moment it may be none: old moments are then detailed again) and a new fixture (`node v2/tools/check-save.mjs --fixture`); see `v2/README.md`.
