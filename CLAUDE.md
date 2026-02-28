# CLAUDE.md

## Project Overview

World Orogen — a browser-based procedural planet generator using Three.js and ES modules with no build step.

## Guiding Principles

All three tenets should be considered simultaneously. When they conflict, break ties in this order:

1. **Artistic appeal** — The output should look visually interesting and compelling, informed by real science but not constrained by it. Aesthetics come first.
2. **Ease of use and efficiency** — The interface should be approachable and intuitive. Generation should be fast. Don't sacrifice usability for realism.
3. **Scientific plausibility** — Terrain, tectonics, and geology should be grounded in real planetary science. Results don't need to be physically accurate simulations, but they should be believable.

## Key Rules

After any code change, check whether README.md needs updating. The README documents all UI controls, features, algorithms, and project structure. If a change adds, removes, or modifies any of the following, update the README to match:

- Sliders, dropdowns, toggles, or other UI controls (names, ranges, defaults)
- User interactions (keyboard shortcuts, mouse actions, edit behaviors)
- Generation pipeline steps or algorithms
- Visual features (rendering, overlays, debug layers)
- Project file structure (new files, renamed files, removed files)
- External dependencies

After any code change, check whether the tutorial modal content (in `index.html`, inside `#tutorialOverlay`) needs updating. The tutorial has three steps that describe the app's features and interactions. If a change adds, removes, or modifies any of the following, update the relevant tutorial step to match:

- Core workflow (how to generate a planet, what controls to use)
- Interactive features (navigation, editing, keyboard/mouse actions)
- What the tool does or its key selling points

After any code change that affects the UI, ensure it works on mobile. The app uses a responsive bottom-sheet layout on screens ≤ 768px (`styles.css` media queries) and has touch-specific behavior throughout. If a change adds, removes, or modifies any of the following, verify and update the mobile experience:

- New buttons or controls — must have ≥ 44px touch targets on mobile (see `@media (max-width: 768px)` in `styles.css`)
- New interactions — must have touch equivalents; desktop uses Ctrl-click for plate editing, mobile uses `state.editMode` toggle (`js/edit-mode.js`); desktop uses scroll-to-zoom, mobile uses pinch (`js/scene.js`)
- Tooltips — must reposition above their trigger on mobile, not to the right (overflow off-screen)
- New overlays or modals — must be usable within the bottom-sheet layout and not be hidden behind it
- Performance-sensitive features — consider lower thresholds on touch devices (detail warnings, export limits); check `state.isTouchDevice` in `js/state.js`
- Info/hint text — update both desktop text (in `index.html`) and the mobile-specific text set in `js/main.js` (search for `state.isTouchDevice`)

After any code change to simulation or climate code, ensure **scale invariance** — the result must look equivalent regardless of the Detail slider (numRegions from 2K to 2.5M). The key rule: never use raw cell-hop counts or neighbor-displacement magnitudes without scaling by resolution. Specifically:

- **Smoothing passes** must target a physical distance: `Math.max(minPasses, Math.round(targetKm / avgEdgeKm))` where `avgEdgeKm = (π × 6371) / √numRegions`. Never write a bare `smooth(mesh, field, 5)`.
- **Multipliers on neighbor-displacement quantities** (e.g. wind convergence, which sums `wind · displacement`) must normalize by `avgEdgeRad = π / √numRegions` since displacement magnitudes shrink at higher resolution.
- **BFS hop thresholds** must be expressed as `Math.round(targetKm / avgEdgeKm)`, not as fixed integers.
- **Thresholds in physical units** (degrees latitude, km altitude, °C, mm precipitation) are inherently scale-invariant and do NOT need scaling — e.g. "28° from ITCZ" or "heightKm > 1.5" are fine at any resolution.
- When in doubt, ask: "if I double numRegions, does this value change meaning?" If yes, it needs scaling.

After any code change that adds, removes, or modifies slider controls, update the planet code encoding in `js/planet-code.js` to match. The planet code packs the seed and all slider values into a compact base36 string using mixed-radix integer packing. If a slider's range, step, or count changes, or if a new slider is added, update:

- The `SLIDERS` array (min, step, count for each slider)
- The `RADICES` array (the count values in right-to-left order)
- The `encodePlanetCode` and `decodePlanetCode` functions (packing/unpacking order)
- The corresponding slider wiring in `js/main.js` (the `map` objects in the `generate-done` handler, `applyCode`, and hash-loading code)
