# World Buildr — V1 Product Review

## What's Good (Strengths)

### Technical Foundation is Impressive
- The geology pipeline is genuinely sophisticated — tectonic plates, collision detection, stress propagation, distance fields, island arcs, hotspot volcanism, rift valleys, back-arc basins. This isn't a noise-on-a-sphere generator; it's a real tectonic simulation. That's the differentiator and it's strong.
- Deterministic planet codes with URL sharing is a killer feature for virality. Compact 11-char codes that fully reproduce a planet (including manual edits) is smart product thinking.
- Zero build step, no install, CDN-loaded deps. The lowest possible friction to get it running.

### UI is Clean and Focused
- The sidebar panel is well-organized with collapsible sections. Slider hints ("Coarse / Fine", "Supercontinent / Archipelago") are excellent — they tell users what the slider *means*, not just what it *does*.
- The `?` tooltip system on each slider is unobtrusive but available.
- The stale indicator (button turns orange "Rebuild" when sliders change) communicates state without words.
- Hover-to-highlight-plate with contextual info is discoverable and satisfying.
- The tutorial is lightweight (4 steps) and dismissable. Correct approach for a tool like this.

### Artistic Appeal is Solid
- Atmosphere rim shader, translucent water sphere, starfield — the globe looks like a planet, not a texture demo. The color ramp produces believable earth tones with good contrast between ocean/land/mountain/snow.

---

## What Needs Work for Market-Ready V1

### 1. Performance & Perceived Speed (High Priority)

**Generation blocks the main thread.** The `setTimeout(..., 16)` in `generate.js` lets the button state repaint, but the actual work is synchronous — at 200K+ cells, the browser locks for multiple seconds. Users will think the app is frozen.

- **Move generation to a Web Worker.** This is the single biggest UX improvement possible. It unblocks the UI, lets you show a progress bar, and prevents the browser's "page unresponsive" warning at high detail levels.
- At minimum, add a visible progress indicator (spinner, progress bar, or pulsing animation on the button) beyond just the text changing to "Building...".

### 2. Mobile & Responsive (High Priority)

- The UI panel is absolutely positioned at `top: 16px; left: 16px` with a fixed `min-width: 270px`. On mobile screens this will cover most of the viewport. There's no way to collapse or dismiss it.
- No `@media` queries anywhere in CSS. No touch gesture handling. Ctrl-click is impossible on mobile.
- **For V1:** At minimum, make the sidebar collapsible/toggleable on small screens. Consider touch-to-select as the mobile equivalent of Ctrl-click.

### 3. First Impression & Empty State (High Priority)

- When the page loads, it immediately starts generating a planet. That's fine — but there's no loading state visible before JS loads and executes. On slower connections, users see a black screen.
- **Add a lightweight loading indicator in pure HTML/CSS** (no JS dependency) that gets replaced when the app initializes.

### 4. Export & Practical Utility (Medium-High Priority)

Right now users can look at planets and share codes. But what can they *do* with what they've made? For a tool going to market, you need at least one export path:

- **Image export** — "Save as PNG" for the current view (globe or map). This is trivial with `renderer.domElement.toDataURL()` and immediately makes the tool useful for worldbuilding, RPGs, wallpapers.
- **Heightmap export** — a grayscale equirectangular PNG of the elevation data. This makes the tool usable in Unity, Unreal, Blender, and other 3D tools. This is the bridge from "cool demo" to "useful tool."
- **Consider STL/OBJ export** for 3D printing enthusiasts (lower priority but high wow-factor).

### 5. Color Map & Biome Richness (Medium Priority)

The current color map (`color-map.js`) is a single elevation-to-color function with 8 linear interpolation bands. It works, but:

- No latitude-based variation — polar regions look the same as the equator. Adding even a simple latitude tint (white toward poles, warmer at equator) would dramatically increase visual appeal.
- No biome differentiation — deserts, forests, tundra, ice caps are all absent. Even a simple noise-modulated biome layer on top of the elevation coloring would make planets feel more alive and give users something to discover as they rotate.
- The ocean coloring is uniform depth-based blue. Real oceans have color variation from coastal shallows (teal/cyan) to deep abyssal (near-black). The data is already there in `dist_coast`.

### 6. Accessibility & Discoverability (Medium Priority)

- **Ctrl-click is not discoverable.** It's mentioned in the tutorial and in small text at the bottom, but there's no visual affordance. Users who dismiss the tutorial will never find this feature. Consider a mode toggle button ("Edit Plates" on/off) that makes regular clicks toggle plates.
- **Keyboard shortcuts are absent.** Space to generate, R to toggle rotation, W for wireframe, etc. — these are cheap to add and power users will expect them.
- **No undo for plate edits.** Ctrl-click is destructive (triggers a full recompute). A simple undo stack (even just "undo last edit") would make editing feel safe.

### 7. Branding & Polish (Medium Priority)

- **Favicon** is `data:,` (empty). Add a real favicon — even a simple colored globe emoji rendered to a canvas.
- **No Open Graph / social meta tags.** When someone shares a planet URL on Twitter/Discord/Slack, it will show nothing. Add `og:title`, `og:description`, `og:image` (a static preview image) at minimum.
- **The title bar just says "World Buildr."** Consider dynamically updating it: "World Buildr — #a7f3kq9xp2b" when a planet is loaded, so browser tabs are identifiable.
- **No 404/error handling for bad hash codes.** If someone visits a URL with a corrupted hash, the error is silent. Show a brief toast message.

### 8. Code Architecture for Future Growth (Low-Medium Priority)

- **`elevation.js` is 970 lines** doing collision detection, stress propagation, distance fields, rift BFS, ridge BFS, fracture BFS, back-arc BFS, coastal roughening, island arcs, hotspot volcanism, and final elevation assembly — all in a single function. This will become unmaintainable. Even a basic extraction of each geological feature into its own function/file would help.
- **`buildDriftArrows` has an early `return`** on line 373 of `planet-mesh.js` — the entire function is dead code after it. Either remove it or finish it.

### 9. Map View Quality (Low-Medium Priority)

- The equirectangular map projection works but has visible triangle seams near the poles and antimeridian. For a market product, these artifacts reduce confidence in quality.
- Map view has no grid lines, labels, or legend. Even a simple lat/lon grid overlay would make it feel like a proper map.

### 10. Documentation & Landing (Low Priority for MVP, High for Marketing)

- The README is thorough for developers but there's no landing page, no screenshots, no GIF/video showing the tool in action. For a product going to market, the first thing someone sees should be a compelling visual, not a markdown file.
- Consider a simple landing section or splash that shows off the best-looking generated planet before asking users to interact.

---

## Priority Summary

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| **Must Have** | Web Worker for generation (no UI freeze) | Medium | |
| **Must Have** | Mobile-responsive sidebar (collapsible) | Low-Medium | Done |
| **Must Have** | Loading state before JS initializes | Low | Done |
| **Must Have** | Image export (PNG screenshot) | Low | |
| **Should Have** | Heightmap export (grayscale PNG) | Medium | |
| **Should Have** | Latitude-based color variation / basic biomes | Medium | |
| **Should Have** | OG/social meta tags for link previews | Low | |
| **Should Have** | Real favicon | Low | |
| **Should Have** | Edit mode toggle (not just Ctrl-click) | Low | |
| **Should Have** | Undo for plate edits | Low-Medium | |
| **Nice to Have** | Keyboard shortcuts | Low | |
| **Nice to Have** | Elevation.js refactor | Medium | |
| **Nice to Have** | Map view polish (grid lines, pole fixes) | Medium | Done |
| **Nice to Have** | Landing page / hero visual | Medium | |

---

## Bottom Line

The core of this product is genuinely strong — the tectonic simulation, the planet codes, and the clean UI put it well ahead of most procedural planet generators. What's missing for V1-to-market is mostly in the **"last mile" category**: making the output *usable* beyond just looking at it (exports), making it *work everywhere* (mobile), and making it *feel* polished (favicon, social previews, loading states, no UI freezes). The geology engine is the hard part, and that's already done. The rest is packaging.
