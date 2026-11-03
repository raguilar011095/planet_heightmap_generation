# Maps and the globe

The globe is the product. These defaults decide how every world looks in every tool.

## The globe’s defaults

- **Light:** atlas light, a soft light from the upper left (the side the relief is shaded from), never dark. The face does not go flat and nothing falls into night. A day-and-night sun is an option for later, not the default.
- **Relief under every colour:** gentle. Shade thematic colours by `1 + ½ × (shade − 1)`, about 72–112 % of the colour, in every tool. (Evolution shades them fully today, which darkens the classes; Generate draws Köppen and climate flat.)
- **The quiet sea:** every land-only layer sits on `map-sea`, shaded gently by the sea floor. Layers that live at sea (rain, currents) keep their own sea.
- **Nothing here:** land with nothing to show is `map-paper`; ice is `map-ice`; lakes `map-lake`.
- **Around the globe:** the stage follows the page theme (`desk`: paper by day, navy at night). Black space with stars (`stage-space`) is an option, never the default.
- **Air:** a thin rim of `map-air`. No heavy glow.
- **Lines:** the 30° graticule in `map-grid`; the equator and tropics dashed in `map-tropics`, optional and useful in Climate; the degree ring in `gold` at home zoom.
- **Names:** `map-land`, `map-sea`, `map-range`, white with `map-halo`.
- **Pins:** numbered, `pin-fill` and `pin-ink`, an open pin filled; a founder’s ring in `pin-founder`; a crop’s home ◆.
- Flat maps use the same colours and relief, with no globe light.

## Colour by job

Every map mode answers one question. The question picks the colours.

| The question | The rule | Examples | Palette |
|---|---|---|---|
| A standard exists | Use it exactly. Never restyle a standard. | Köppen (Beck et al. 2018), Relief and the other height palettes, Satellite, Rocks after the geological map’s families | `koppen-*`; the height and rock tables in code |
| How much | One hue, pale to dark. More than one hue only when the neighbours are kin. | Crop variety, people, one metal’s richness, when farming came, rain | `ramp-variety-*`, `ramp-came-*`, `rain-*` |
| Which side | Two hues and a quiet middle at the line that matters. | Temperature around 0 °C, pressure around 1012 hPa, currents | `temp-*`, `pressure-*` |
| Which kind | At most eight hues on screen; a family gets one. Members are words. | Staple food, ore families, animals, hearths | `staple-*`, `ore-*`, `cat-1` … `cat-8` |
| Where | Marks, not colour. | Hearths, districts, pinned places, a crop’s home, rivers, isochrones | pins, ◆, thin lines |

**Never generate hues.** No ±14° turns per crop, no cycling a palette. When there are more kinds than eight, colour the families and let the legend, the readout and the finder name the members. A picked member takes the spotlight: it lights up in its family’s hue, in strength, and everything else goes quiet.

**Patterns keep one meaning each.**

- Stripes: a second answer nearly as good (a place whose second staple does nearly as well).
- Hatching: a barrier (the fly belt). Don’t also hatch “could grow but hasn’t arrived”; leave that pale.
- Stipple (`map-stipple` on `map-paper`): lived off the wild, not farmed.

**The categorical eight** (`cat-1` … `cat-8`): ochre, teal, brick, periwinkle, olive, plum, sea blue, rose. Assign in order for invented kinds (hearths 1–8, animals). Every pair is at least 15.6 apart for normal sight and 7.2 for colour-blind readers, so always back it with labels or the readout.

**Ore families:** `ore-alloy` (iron, nickel, platinum and chromium), `ore-base` (copper, tin, lead and zinc, aluminium), `ore-precious` (gold, silver, diamonds), `ore-salt`. They pass every check (21.1 / 8.2). Three views: by family; worth mining (moderate or richer only); one metal at a time, in its family’s colour, richness by strength (Poor, Moderate, Rich), its richest districts numbered.

**Staple food:** `staple-paddy`, `staple-cool`, `staple-warm`, `staple-roots`, `staple-livestock`, `staple-fish`, `staple-tree`, and wild foods as stipple. Paler where it feeds less well; striped where a second does nearly as well. These keep the Food view’s own hue choices, tuned to pass (16.7 / 7.5, with labels).

## Legends, readouts and finders

- **The legend card** holds at most eight rows: swatch, name, share. Members fold inside their row as words; a finder lists every item; settings sit in one folded line at the foot. Never a chip per item.
- **The readout** names everything at one place, richest first, with the view’s own labels and real values. It carries what the colours leave out.
- **The finder** searches every item a view knows (“Find a crop: 208 of 245 grow on Arden”); one the world doesn’t grow says why.
- **Pinned places** list the user’s pins under the map: number, class swatch, name, where, the values for the view.

## Adding a map mode

1. Name its question: a standard, how much, which side, which kind, or where.
2. If a standard exists, use it and stop.
3. Draw from the palettes above, in their fixed order.
4. Keep the map to eight hues; group the rest into families with a spotlight.
5. Put the rest in words: readout, legend rows, finder.
6. Check it: every pair through the colour check (on a map any two colours can touch), then look at it on the globe, on paper and at night.

## Checked, not eyeballed

| Palette | Colours | Closest pair (normal) | Colour-blind | Verdict |
|---|---|---|---|---|
| Ores before (all metals) | 11 | 5.0, copper and aluminium | 3.6 | Fails |
| Ore families | 4 | 21.1, precious and base | 8.2 | Passes |
| Staples before | 8 | 8.6, warm grains and tree crops | 3.2 | Fails |
| Staples, tuned | 7 + stipple | 16.7, tree crops and warm grains | 7.5 | Passes with labels |
| The categorical eight | 8 | 15.6, olive and ochre | 7.2 | Passes with labels |

The floor is 15 for normal sight and 8 for colour-blind readers (6 to 8 allowed when labels back it up), measured over every pair.
