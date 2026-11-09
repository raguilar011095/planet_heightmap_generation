# Page patterns

How the pieces make the four kinds of page.

## The Studio

- A utility line (“Free planet tools · In your browser · No account”, then GitHub, Follow, Support in `accent`), then the masthead: the lockup at 42px with the name at 34px, the tools on the right. The double rule under it.
- **Hero:** text left: an `og-eyebrow` (“A studio of worldbuilding tools”), the `hero` headline with its italic accent phrase, on three lines (Build your / world, from / the ground up.) on every screen but a phone's, where it takes two, set at 1.1 so the y of “your” clears the h of “the”; a `lede` with three layer highlights (plates, mountains, rain), then, above the buttons, “Free and open source” in a gold tag with “No account, no install, you own every map you make.” beside it, then Generate your world (primary) and Evolve your world. Right: the globe in its degree ring with numerals every 30°, turning slowly (a turn in 100 s, eastward) and fading from one view to the next (Satellite, Terrain, Climate, Rocks: six seconds each); the caption under it names the world and the view, with a quiet pause button (a finger's size on a phone). It rests off screen; with reduced motion, or without WebGL 2, it is its still.
- **Orogen tools:** the tools and their worlds in one. A `title`; the line (“Different ways to your believable world, and worlds made with each.”) on the left, and level with its last line, right-aligned above the map, the open tool's views (Satellite first; for Import's worlds also Hot & dry or Cold & wet). Below, a tool card per tool down the left, each a head (its icon tile in its layer's tint, its name, its tag, a chevron) that opens it, one open at a time and always at the top: opening another slides it up (the cards glide to their places; none with reduced motion). The open card shows the line, a note, its two worlds side by side on a tinted panel and Open … on a hairline, and keeps the height of the tallest, so the map beside it stays one size. On the right the map of the world chosen, its name and what it shows just below; the two columns end together (the map trimmed a little at its sides where the cards run longer). Narrower than 1280 px, one column: the line, the open card, the map, its views, the other cards.
- **Orogen Explains:** a featured essay card with an engraved sketch, then two more.
- A footer on a hairline: “World Orogen · orogen.studio” and “Free and open source · GPL-3.0 · Your maps are yours”.
- No Roman numerals, no layer band, no ink-and-gold frames.

## A tool

- The masthead with the current tool underlined; Inspect, Export and the theme on the right.
- The control panel: groups under section heads with their layer bars (The land, The climate); sliders; the main button (Build new world); Rebuild and Regenerate with their dots; a hint; the planet code at the foot.
- Over the map: Globe | Map (segmented), the view tabs, Year | Jan | Jul (segmented). The view’s title in `view-title` with a `note`.
- The map on `desk`, in its frame: a single hairline neatline with degree ticks and numerals on a flat map; the degree ring around the globe.
- Right: the key as a legend card. Under the map: pinned places. Beside the globe: the same list, compact.

## The atlas print

- The plate keeps the engraved look: a hairline frame inset 18px, the title row (“THE WORLD OF” in gold capitals over the world’s name at 50px, the line beneath right-aligned in italic), a hairline under it, the main map in a double neatline with degree numerals, the globe inset in a gold ring with its caption, About this world under it, then a double rule and three columns: Key, Places named (small capitals), This plate (and “Drawn by World Orogen · orogen.studio”).
- Papers: Ivory (`paper-ivory`, `paper-ink`, `paper-gold`) and Midnight (`paper-midnight`).
- The controls around it are the tool’s: a masthead with “Evolution / Atlas print”, a status line and Print this plate (primary); a panel with The plate (Map, Main map, Globe faces as segmented controls) and The words (Title, Line beneath, About this world, Place names), and Paper.
- The plate lies on `desk` with `shadow-paper`. Eighteen by twelve inches, landscape.

## An Orogen Explains essay

- The masthead with Explains underlined.
- A layer tag and “Orogen Explains · 4 min”, the `display` title (an italic accent word is allowed), the dek in italic.
- The `essay` column with layer highlights; sidenotes in the side column level with what they explain.
- Figures on a mat (`surface`, a `rule` border, `radius-lg`): an engraved diagram in ink hatching, its slider, two bars and a caption (“Figure 1.” in `label`, then italic).
- An “In Orogen” section with a real render of a world, then the call to action.
- More from Orogen Explains (three essay cards), then the footer.
