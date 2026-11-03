# World Orogen style guide

World Orogen is a free studio of planet tools that run in the browser: Generate, Import Heightmap and Evolution. Its look is a calm modern instrument with a classic atlas callback. Engraved type, a degree ring and a print’s frames mark the moments that present a world; rounded, quiet controls do the work. The planets are always the star: nothing in the interface competes with the globe.

## Where it lives

- **`tokens.css`** (the project root): every colour, type family, spacing step, corner, line, size and shadow as a CSS custom property. Paper (light) by default, Night (dark) by the device or by `data-theme` on `<html>`. It declares the fonts and has an `og-t-<style>` class for each type style.
- **`assets/fonts/`**: the five font files and their licence, `OFL.txt`.
- **`assets/brand/`**: the mark (`orogen-mark.svg`, and `orogen-mark-night.svg` for Night) and the line icons (`icons/`).
- **[Components](components.md)**: the twenty pieces as plain HTML and CSS (prefix `og-`), with `components.css` and `components.js` as their reference implementation. The app doesn't load these yet.
- **[Maps and the globe](maps.md)**: how every world looks, and the colours of every map mode.
- **[Page patterns](pages.md)**: how the pieces make the Studio, a tool, the atlas print and an Orogen Explains essay.
- **The theme**: `js/theme.js`, a classic script in each page's `<head>`, puts a saved choice on `<html>` before the first paint, wires the switch at the end of the top bar (`#themeToggle`) and tells the globes when the theme changes (`window.orogenTheme`).
- **The check**: `node v2/tools/check-style.mjs` finds literal colours in the pages' CSS, new `--ui-*` roles and undefined `var(--…)`. For Claude Code, `.claude/skills/orogen-look/` turns this guide into a checklist, and a hook runs the check after each edit to a stylesheet, a page or interface JS.
- **The redesign**: [`plans/REDESIGN_PLAN.md`](../../plans/REDESIGN_PLAN.md) moves the app onto this guide, phase by phase. Until a page has moved, its colours are the `--ui-*` variables at the top of `styles.css`, which the redesign retires. New rules use the tokens and never a literal colour.

## Voice

Write the way a knowledgeable friend talks: plain, warm and concrete.

- Say what the person gets, not how the code works: “your mountains have a history”, “Bring a map you drew. See what its winds, rain and climate zones would really be.”
- Be science-forward without jargon. Name the phenomenon (rain shadow, rift, supercontinent, porphyry copper) and skip the equations.
- Name controls by their effect, as the app does: “Temperature”, never “Greenhouse”. Ask before swapping in a precise term.
- Never hype or overclaim. Say what is true now: Evolution is “best on a desktop for now”; its Geology and Food tabs are “in beta”.
- Say “simulated”. Never call the planets “AI-generated”.
- Near people and food, say what the land allows, not what its people are: *could*, not *will*. Earth likenesses are likenesses: “emmer-like”, “a different world”.
- The tagline is **Believable worlds, from the ground up.** The one-line description: *A free, open-source planet generator that runs in your browser.*
- No emoji, no exclamation marks, no stock phrases.

**Casing.** Sentence case for every button, label, heading and chip: “Build new world”, “Pinned places”, “Worlds to explore”. Names keep their capitals: World Orogen, Generate, Import Heightmap, Evolution, Orogen Explains, and the layers Plates, Land, Climate, Rock, Food. Capitals appear only in tags and eyebrows (`eyebrow` style, 11px, letterspaced): “CLIMATE · FOUR MINUTES”.

**Numbers.** A unit follows a space: 34 °C, 2,350 mm, 640 m, 30%. Coordinates read “18.0° S, 36.0° W”. Use thousands separators and tabular figures (`figure` style) in tables. Counted things are 1, 2, 3, never Roman numerals. Write long spans in words where they are a story (“nine hundred million years in”) and in digits where they are data (900 Myr).

**Buttons say exactly what happens**, verb first: “Build new world”, “Print this plate”, “Open Arden →”. Errors say what went wrong and how to fix it, without apology.

## Colour

Two themes, **Paper** (light) and **Night** (dark). They follow the device and the person can switch. Every colour is a token in `tokens.css`.

- Page: `bg` is the ground, `surface` raises a card, `panel` holds a group, `desk` is the stage behind a globe or a print, one step off the page.
- Text: `ink` for what reads first, `body` for running text, `muted` for captions and meta. Each note in the tokens names the grounds it reads on (4.5:1 or better in both themes).
- `accent` (oxblood) is for doing: the one primary action on a view, links that act, the italic accent phrase in a display heading. Text on it is `on-accent`. One primary button per view.
- `gold` is ornament only: the degree ring, the active-tab underline, a founder’s ring. It is never clickable and never text; gold text is `gold-ink`, for small-caps eyebrows only.
- Controls: `chip-track` and `chip-on` for segmented controls; `rule` for every hairline; `focus` for the keyboard ring.
- **Layer colours mark the interface, never the data.** `layer-plates`, `layer-land`, `layer-climate`, `layer-rock`, `layer-food` colour a section bar, a tab dot, a sidenote rule; their `-ink` and `-tint` pairs make tags, highlights and icon tiles. They never colour a map, so Food’s green can’t be mistaken for a crop. Add a layer by adding the same three tokens.
- Map colours (the `map-` tokens and every data palette) are the same in both themes: the globe is an object, not chrome. See [Maps and the globe](maps.md).
- Never pure black or pure white buttons; never a gradient for decoration.

## Type

Three families, three jobs. The files are in `assets/fonts/`: one woff2 per family and style, Latin letters, every weight in one variable file (about 200 KB for all five). All three are under the SIL Open Font License, so they ship with the app, with the licence beside them (`assets/fonts/OFL.txt`). `tokens.css` declares them with `font-display: swap`, so a page draws at once in the fallback and never waits on another server, and a browser fetches a font only when text uses it.

- **Cormorant Garamond** (`display`): headings and names, 20px and up only. The Studio’s headline is `hero`; page titles `display`; sections `title`; the map’s title `view-title`; cards `card-title`; control groups and legend heads `section`; slider values `value`.
- **EB Garamond** (`text`): what people read, and the names of controls. Essays `essay` (21px in a 720px column); cards and notes `reading`; slider and field names `control-label`; hints `note` (italic, `muted`); captions `caption`.
- **Libre Franklin** (`ui`): every button, tab, chip, label and number. `button`, `nav`, `control`, `label`, `meta`, `figure` (tabular), and `eyebrow` for tags.
- Map names: continents in `map-land` (Cormorant capitals, wide spacing), seas in `map-sea` (EB Garamond italic), ranges in `map-range`. All white on the map with `map-halo` behind.
- One italic accent per heading at most (“Believable worlds, *from the ground up.*”). Headings take `text-wrap: balance`.

## Layout and spacing

- Spacing runs on 4px: `space-1` to `space-10`. Lay out with flex and grid gaps.
- Page gutter: `space-10` (64px) on the desktop, 16px on phones.
- A tool: the masthead (64px), a control panel on the left (`size-panel`, 300px), the map in the middle on `desk`, its key on the right, pinned places under the map.
- The Studio: content 1312px wide; hero text left, globe right.
- An essay: a `size-column` (720px) reading column with a 300px side-note column, set 190px in from the left.
- Every control is at least `size-touch` (44px) tall.

## Shape, depth and lines

- Soft corners by role: `radius-xs` for highlights and swatches, `radius-sm` inside chips, `radius-input` for fields, `radius-md` for buttons and tracks, `radius-lg` for cards beside the map and icon tiles, `radius-xl` for Studio cards, `radius-2xl` for big panels, `radius-full` for pins and tags.
- Depth is quiet: `shadow-card` for floating cards, `shadow-chip` for the chosen chip, `shadow-pin` for pins, `shadow-paper` for a print on the desk.
- Lines: every border and divider is `line-hair` in `rule`. **One double rule per page**, under the masthead (`line-masthead`, double, `ink`). Nothing else gets a double line.
- Never the ink-and-gold double outline on a card, a figure or a button; never corner squares on a frame in the interface.

## Ornament

Ornament frames the world and never the controls.

- **The degree ring** circles the globe at home zoom: a `gold` circle with ticks every 5°, longer every 30°, and it fades as you zoom in. The Studio’s hero globe may carry numerals every 30° in `meta`.
- **Hachure** (a few fine diagonal lines in `rule`) may flank a section title on the Studio (“Three ways in”).
- **The atlas print** keeps its frames: a hairline frame, a double rule above the key, degree numerals on the map, a gold ring on the globe inset (see [Page patterns](pages.md)).
- **The eyebrow** (`og-eyebrow`): a short gold line and small capitals in `gold-ink`, once per section at most.
- Never: a compass rose, Roman numerals, corner squares, ornament inside a control panel or a legend.

## Iconography

- Line icons on a 24px grid, 1.6 stroke, round caps and joins, no fill. Inline them as SVG with `stroke="currentColor"` so they take the text colour; the files in `assets/brand/icons/` are drawn in `ink` (#1B2A3A) for places that can only take an image.
- At 16px in buttons beside a label; at 30px in a tool card’s icon tile (`size-tile`, the layer’s tint and ink).
- The set so far: generate (sliders), import (a map sheet), evolution (drifting continents), inspect, export, print, light mode, dark mode. New icons follow the same grid and stroke; there is no outside icon library.
- No emoji, anywhere.

## Logo

The mark is a ring of `ink` holding three strata, `logo-violet`, `logo-ochre`, `logo-blue`: Plates, Land and Climate, the ground up. The lockup sets it beside **World Orogen** in Cormorant Garamond 600 (see Logo in [Components](components.md); the files are `assets/brand/orogen-mark.svg` and `orogen-mark-night.svg`).

- 34–36px in a tool header with the name at 26px; 40–42px on the Studio with the name at 34px; 32px and 16px as the favicon.
- On Night the ring turns `ink`’s ivory; the strata keep their colours. Never recolour or outline them, never add the degree ring to the mark.
- This mark is the current choice; its colours may still change.

## Motion

- Keep the interface still. State changes take 150–200ms, ease-out; nothing bounces, nothing animates to decorate.
- The world moves, the chrome doesn’t: a history playing, a globe turning under the hand.
- Respect `prefers-reduced-motion`: no automatic turning, no cross-fades.
- A Studio globe that turns between worlds and views is planned, not yet designed.

## Phones

- Up to 768px the control panel becomes a bottom sheet; the map takes the screen.
- Tabs scroll sideways; the key folds into a sheet; the readout opens from a tap.
- Tap targets 44px; tooltips sit above their trigger, never to the side.
- Generate is the most phone-friendly tool; Evolution’s phones explore and export.

## Accessibility

- Text holds 4.5:1 on its grounds in both themes (3:1 at 24px and up); marks and borders that carry meaning hold 3:1. The token notes give the numbers.
- Keyboard focus: a 2px solid `focus` ring, offset 2px, on every control.
- Colour is never alone: the readout names every value, legends name every colour, numbered pins carry the names, and patterns carry the second answers. Map palettes are checked over every pair for normal and colour-blind sight (see [Maps and the globe](maps.md)).
