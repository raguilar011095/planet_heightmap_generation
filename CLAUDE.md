# CLAUDE.md

## Project Overview

World Buildr — a browser-based procedural planet generator using Three.js and ES modules with no build step.

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

After any code change that adds, removes, or modifies slider controls, update the planet code encoding in `js/planet-code.js` to match. The planet code packs the seed and all slider values into a compact base36 string using mixed-radix integer packing. If a slider's range, step, or count changes, or if a new slider is added, update:

- The `SLIDERS` array (min, step, count for each slider)
- The `RADICES` array (the count values in right-to-left order)
- The `encodePlanetCode` and `decodePlanetCode` functions (packing/unpacking order)
- The corresponding slider wiring in `js/main.js` (the `map` objects in the `generate-done` handler, `applyCode`, and hash-loading code)
