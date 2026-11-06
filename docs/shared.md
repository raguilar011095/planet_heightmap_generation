# Shared by every tool

Generate, Import Heightmap and Evolution share one layout, one climate and one export panel. Each tool's own controls
are in [generate.md](generate.md), [import.md](import.md) and [evolution.md](evolution.md). Back to the
[README](../README.md).

## Navigation

A top navigation bar connects the pages. It opens with the World Orogen mark and name, which lead home to the Studio; the current page's tab is underlined in gold, and a double rule runs under the bar:
- **Studio** (`/`, the home page) — the three tools side by side, what each is for, and curated worldbuilding resources (blogs, YouTube channels, other tools); a Generate link from before Generate moved (`/#code`) goes on to `/generate#code`
- **Generate** (`/generate`) — procedural planet generation with tectonic plates, erosion, and climate
- **Import** (`/import`) — import your own equirectangular B&W heightmap, view it on a 3D globe, and run climate simulation. Black (0) = ocean, brighter = higher elevation. Supports PNG, JPEG, and WebP.
- **Evolution** (`/evolution`, best on a desktop for now; its Geology and Food tabs are in beta) — watch a planet's tectonic history unfold, stop on a moment and add detail, then explore and export it: see [evolution.md](evolution.md)

On narrow phones the Import tab reads just "Import".

After the tabs, past a short divider: GitHub, then **Follow** with Bluesky, X and Threads, then **Support** with Ko-fi (plain links that open in a new tab; nothing is loaded from those sites). On phones and tablets the bar keeps only the tabs, and the same links sit at the foot of the side panel (a row a desktop shows too): GitHub, the three follow icons and **Support** with the Ko-fi cup. The Studio has GitHub and the follow links under its introduction, and Ko-fi in its footer.

At the bar's far end, on every page and on phones too, the **theme switch** (a moon on Paper, a sun on Night) swaps the light and dark themes. Until it is used, the page follows the device's own light or dark setting; once used, the browser remembers the choice on every page. The stage behind the globe follows the theme: the page's desk colour, paper by day and navy at night. (The style guide's Colour section: `docs/style-guide/README.md`.)

## The view: layers over the planet

Generate, Import and Evolution share one layout (plans/VIEW_UI_PLAN.md): the sidebar holds what builds the world, and what
you look at sits over the planet — the **view strip**, the **layer bar** under it, and the **legend** beside the planet.

- **Layer bar** (`v2/js/view/layer-bar.js`, made once for every page; the planet under it drawn by `v2/js/view/planet-view.js`; plans/SHARED_CORE_PLAN.md) — **Terrain** · **Satellite** · **Climate** · **Geology** · **Food** · **Heightmap** · **Plates** (Import has no Geology or Plates: an image has no history and no plates). On Generate and Import the finished views (Satellite, Climate, Geology, Food) come a few seconds after the planet — Evolution's finish runs in the background; on Evolution they come with Add detail:
  - **Terrain** — the land coloured by height and the sea by depth, in the **Colours** chosen in the view strip (Relief by default), hillshaded, the sun glinting softly off the sea; on a finished planet its rivers (by flow: Few, Normal or Many; coloured by their year with **By Regime**) and lakes
  - **Satellite** — the planet as from space, from the finish's land cover (`v2/js/finish/finish-cover.js`, `v2/js/evolution/sat-style.js`): each climate's colours climbing with the land to rock and snow, rivers and fresh lakes greening dry country, dunes, snow and ice from its climate, its clouds over it (the **Clouds** switch), for the year, January or July
  - **Climate** — its own row of maps: **Köppen** (the Köppen-Geiger classes, swatches for all 30), **Temperature**, **Rain**, **Wind** and **Currents**, and under **More…** the rest; the tab opens on the climate map shown last. With the row, the **Season** — Year, January or July (the same in both hemispheres — January is the southern summer) — for the layers that change through the year (Satellite too):
    - **Atmosphere** — Pressure (sea-level pressure in hPa, blue = low, red = high, with the wind's arrows and the ITCZ as a green line), Wind (speed in m/s, with arrows)
    - **Ocean** — Ocean Currents (the sea's temperature against its latitude's average — warm and cold currents — with current arrows; the currents are seasonal in the tropics), Upwelling (m/day: cold, nutrient-rich water rising where the wind pushes the surface away), Ice (sea ice, with a summer pack where winters are long; on land, the season's snow and the ice sheets)
    - **Land** — Temperature (°C: purple and blue below freezing, white at 0 °C, yellow through red above; the sea's surface temperature at sea), Precipitation (mm/month, or mm/year for the Year), Temperature Range (warmest month − coldest: continentality), Rain Shadow (blue windward slopes, red-brown rain shadows), Aridity (the UNEP aridity index), Growing Season (months above 10 °C), Rain Seasonality (Walsh & Lawler's index)
  - **Geology** — its own row: **Rocks**, **Deposits** (with its picker: everything, one metal or fuel, or a kind of deposit — made from the deposits' own list) and **Ages** (with the age and its resources' pickers); the hover tells the rock and its record, the deposits or the age's resources and the district's story
  - **Food** — its own row: **Farmland**, **Staple food**, **Lifestyle**, **People**, **Soil**, **Growing season**; the legend's chips switch the farming techniques and show a staple alone
  - **Heightmap** — black-to-white on a fixed absolute scale, so the same height always maps to the same shade
  - **Plates** (Generate, Evolution) — Generate's: each moving plate in its own hue (continents light, ocean dark, each piece a shade of its own), the boundaries as bands in the colour of their kind (ridge, rift, trench, collision, transform, inactive seam) and the motion as arrows; Ctrl-click (⌘-click on a Mac) a piece to reshape it works in every view (`js/generate-plates.js`)
- **View strip** (`js/view-strip.js`) — above the layer tabs, folded behind the **arrow** at their left; opened, the tabs move down to make room (the browser remembers which). It shows only what applies:
  - **Globe | Map**
  - **Projection** (map only) — the ten the export offers: equirectangular, Mercator, Robinson, Equal Earth, Mollweide, Hammer, Winkel Tripel, the globe as two hemispheres, azimuthal equidistant and Van der Grinten, each with its own options. The browser remembers it, the same on all three pages, and the export opens on it. The map is drawn by the globe's renderer through the projection's inverse (`v2/js/view/projection-glsl.js`); scroll to zoom and drag to pan in any projection; hover readouts and Ctrl-click plate editing work in every one.
  - **Centre** (map only) — shifts the map's central meridian to any longitude from 180°W to 180°E. Exports are centred the same way (the file name notes it, e.g. `-c120E`).
  - **Auto-Rotate** (globe only) — spin the globe continuously
  - **Grid Lines** and the **grid spacing** — a latitude/longitude grid, every 30°, 15°, 10°, 5° or 2.5°
  - **Colours** — how the Terrain view and its Colour Map export colour heights: Evolution's sixteen palettes, by height in km — the maps Relief (the default), Topographic, Natural, Swiss, School Atlas, ETOPO, DEM, Scientific, Blue Marble (by height), Grey and Antique, and the other worlds Arid, Frozen, Lush, Alien and Volcanic (`v2/js/evolution/looks.js`). Each page's browser remembers its own.
  - **Hillshade**, **Clouds** (over the Satellite view), **Rivers & Lakes** with **By Regime** and the rivers' density — on a finished planet
- **Legend** — a card beside the planet (bottom right) for the layer shown.
- **Beside the sidebar** — the bar is centred over the planet; where the open sidebar would be under it (a narrow window, a tablet), it moves right just enough to clear it, as far as the room before the help button allows.
- **On phones** — the bar becomes one layer list at the top, the season beneath it and the legend under that; the view strip sits at the top of the bottom sheet, never folded, every control a 44 px touch target. The tutorial, What's New and the export panel scroll when they are taller than the screen (a phone on its side), so their buttons are always within reach.

## The climate

Every tool runs the same climate (`v2/js/climate/`, in Evolution's finish on every page): a seasonal energy balance (sunlight for the planet's tilt, snow and sea-ice albedo, ice sheets, air masses carried inland, clouds; sea ice that thickens through the winter — slower as it thickens — and melts back through the summer, so a pack lasts the summer where winters are long — never past the winter's edge — and pulls back from warm currents well offshore), pressure belts and winds from it (the ITCZ at the thermal equator, the Hadley and Ferrel cells, monsoon thermal lows and highs — the tropical trough running into a summer continent's heat low, so the monsoon reaches the Himalayan foothills, and a monsoon trough deeper the warmer its heat low (deep where a plateau heats the air aloft, shallow over a flat desert) — friction), a wind-driven ocean (gyres with western boundary currents like the Gulf Stream, circumpolar currents, coastal upwelling, the overturning's heat — its currents seasonal in the tropics, so the monsoon seas' currents reverse), and a rain budget of the water each air column carries (evaporation, transport, rain-out, storms — the mid-latitudes' and the tropics' monsoon depressions and easterly waves, where the low-level winds turn cyclonically; a baseline of frontal rain along each hemisphere's polar front, moving with the seasons and kept out of the highs and the rain shadows — windward slopes and rain shadows) — coupled, and solved for all twelve months on a fixed 1° grid, so it takes a few seconds at any detail and looks the same at every resolution. Each region's twelve months, at its own height, give its Köppen class. Against real Earth it matches the observed Köppen map on about half the land (the old climate: about 38 %); see `plans/CLIMATE_REBUILD_REPORT.md`.

## Export

Click **Export map** at the foot of the sidebar (on Evolution, **Export** on a detailed moment) to open the export panel (`v2/js/view/export-panel.js`) — the same maps on every page, drawn from the finished planet (`v2/js/evolution/export.js`; on Generate and Import once the finish is done):

- **Width** — from 1024 px, doubling, to 16,384 px (4096 on phones): the finished picture's own width, averaged down, or enlarged with the detail finer than the mesh drawn in. The height follows the projection (width / 2 for equirectangular).
- **Projection** — equirectangular, Mercator, Robinson, Equal Earth, Mollweide, Hammer, Winkel Tripel, orthographic hemispheres, azimuthal equidistant (polar) and Van der Grinten; each with its own options where it has them. Equirectangular is the plain 2 : 1 map that re-imports; the others are drawn from it pixel by pixel through the projection's inverse (`v2/js/view/projections.js`), colours and classes by the nearest pixel, numbers bilinearly, the outside transparent.
- **Centre longitude** — the map view's Centre when the panel opens; any longitude. The file name notes it (`-c90E`).
- **Season** — Year, January, July, or all three as separate files, for the maps marked ☼.
- **The maps**, in groups, each with a **Colour** box (as shown, in its legend's exact colours) and / or a **Data** box (a greyscale on a fixed scale; the scale is in the README.txt and in the row's tooltip):
  - *Maps* — Colour Map (the Terrain view, its rivers and lakes with Rivers & Lakes), Satellite (☼), Satellite with clouds (☼), Clouds (☼, on a transparent ground), Climate zones (Köppen; data: the class index, 8-bit), Rivers & Lakes (on a transparent ground)
  - *Elevation* — Heightmap with sea floor (16-bit, −11 to +9 km), Land heightmap (16-bit, 0 to +9 km, the sea black — re-imports on the Import page), Land mask, Hillshade (8-bit)
  - *Climate* — Temperature, Precipitation, Pressure, Wind (data: speed, east and north parts), Ocean Currents (data: the sea's warmth against its latitude, east and north parts), Upwelling, Ice (data: sea ice, snow, ice sheet), Temperature Range, Rain Shadow, Aridity, Growing Season, Rain Seasonality
  - *Geology* (Generate, Evolution) — Plates (Generate: colour; data: the plate number), Rocks (data: the rock type's index, 8-bit, listed in the README.txt), Deposits (data: a richness mask per metal, mineral and fuel), each technological age's map (data: a mask per resource), the districts as GeoJSON and CSV, and a resource atlas
  - *Food* — Farmland (data: with the techniques chosen and by rain alone, 0…1), Staple food (data: the staple food's index), Lifestyle (data: the lifestyle's index), People (data: a km²), Soil (data: fertility), Growing season (data: months, by rain and watered)
- **All / None** select every map or clear the list; the choice, width, season and projection are remembered.
- **Export** — one map saves as a PNG; several save as one ZIP, with a **README.txt** (optional) naming every file, its kind, units and scale, the projection and the centre. A progress bar in the panel follows the drawing, projecting and encoding.

## Sidebar & loading (Generate and Import)

The control panel can be collapsed and expanded with the **«** toggle button in the sidebar header. On small screens (≤ 768px) the sidebar becomes a bottom sheet with a drag handle — starts collapsed, showing only the handle and header. Drag up or tap the handle to expand. An overlay with spinner, title, and progress bar covers the planet during every generation and import — fully opaque on initial load, semi-transparent on subsequent builds so the previous planet is dimmed behind it. It sits behind the page's controls: the sidebar, the top bars and the buttons stay in view, held (they take no clicks) until the build is done or has failed. Stage labels (shaping, plates, oceans, mountains, painting) update as the pipeline progresses.

## Previous versions

`orogen.studio` always runs the newest release; from 2.1 on, each minor release also stays online at `orogen.studio/v/<major>.<minor>/` (its last patch, e.g. `orogen.studio/v/2.1/generate#…`), so a planet can be opened in the version it was made with even after later releases change how worlds are built. The deploy (`.github/workflows/deploy.yml`) unpacks each from its release tag; search engines are asked to leave them out.
