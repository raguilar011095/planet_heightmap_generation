// The climate's Inspect layers on Generate and Import (plans/V1_NEW_CLIMATE_PLAN.md, "Inspect layers"): what each shows,
// its colours, its legend and its hover lines — all from the new climate (js/climate-new.js), in real units. One entry
// per quantity, with a season picker (Year · January · July) where the quantity has seasons.
//
// Land layers read each region's own values (state.curData.climate.cells: the region's twelve months at its own height);
// the sea, and the winds and currents, are sampled from the 1° climate grid at the region's latitude and longitude.

import { RAMP_FAMILIES } from '../v2/js/evolution/sat-style.js';
import { RAMPS, rampColor } from '../v2/js/climate-lab/palettes.js';

export const CLIMATE_INSPECT = [
    { id: 'pressure',    label: 'Pressure',          seasonal: true,  arrows: 'wind', itcz: true },
    { id: 'wind',        label: 'Wind',              seasonal: true,  arrows: 'wind' },
    { id: 'currents',    label: 'Ocean Currents',    seasonal: true,  arrows: 'currents' },
    { id: 'upwelling',   label: 'Upwelling',         seasonal: true },
    { id: 'ice',         label: 'Ice',               seasonal: true },
    { id: 'temperature', label: 'Temperature',       seasonal: true },
    { id: 'precip',      label: 'Precipitation',     seasonal: true },
    { id: 'tempRange',   label: 'Temperature Range', seasonal: false },
    { id: 'rainShadow',  label: 'Rain Shadow',       seasonal: true },
    { id: 'aridity',     label: 'Aridity',           seasonal: false },
    { id: 'growing',     label: 'Growing Season',    seasonal: false },
    { id: 'rainSeason',  label: 'Rain Seasonality',  seasonal: false },
];
const BY_ID = Object.fromEntries(CLIMATE_INSPECT.map(l => [l.id, l]));
export const SEASON_LABELS = { year: 'Year', jan: 'January', jul: 'July' };

/** A climate Inspect layer's description (or undefined for any other layer). */
export const climateLayer = (id) => BY_ID[id];
/** Layers that need a climate: the Inspect ones, and the Köppen and Satellite views. */
export const needsClimate = (id) => !!BY_ID[id] || id === 'koppen' || id === 'biome';

// ── sampling the 1° grid ──
/** Bilinear sample of a grid field at latitude / longitude (degrees). */
export function sampleGrid(grid, f, latDeg, lonDeg) {
    const w = grid.w, h = grid.h, step = grid.step;
    const x = (lonDeg + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - latDeg) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = (i0 + 1) % w, j1 = Math.min(h - 1, y0 + 1);
    return (1 - fy) * ((1 - fx) * f[y0 * w + i0] + fx * f[y0 * w + i1]) + fy * ((1 - fx) * f[j1 * w + i0] + fx * f[j1 * w + i1]);
}
/** Each region's latitude and longitude (degrees, Y-up), kept on the planet's data while its mesh lasts. */
export function regionLatLon(data) {
    if (data._latlon && data._latlon.n === data.r_xyz.length) return data._latlon;
    const n = data.r_xyz.length / 3, lat = new Float32Array(n), lon = new Float32Array(n), R = 180 / Math.PI;
    for (let r = 0; r < n; r++) {
        const x = data.r_xyz[3 * r], y = data.r_xyz[3 * r + 1], z = data.r_xyz[3 * r + 2];
        lat[r] = Math.asin(Math.max(-1, Math.min(1, y))) * R; lon[r] = Math.atan2(x, z) * R;
    }
    return (data._latlon = { n: data.r_xyz.length, lat, lon });
}
/** A grid field's value at a region. */
export function gridAt(data, f, r) {
    const { lat, lon } = regionLatLon(data);
    return sampleGrid(data.climate.grid, f, lat[r], lon[r]);
}

// ── colours (each [r, g, b] in 0–1) ──
const SEA = [0.06, 0.08, 0.22], LAND = [0.42, 0.40, 0.36];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A ramp of [value, colour] stops, interpolated (values ascending). */
function ramp(stops) {
    return (v) => {
        if (!(v === v)) return LAND;
        if (v <= stops[0][0]) return stops[0][1];
        for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) return lerp3(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
        return stops[stops.length - 1][1];
    };
}
/** Discrete classes: [upper bound, colour, label] — the first whose bound the value is below. */
const classes = (list) => (v) => { if (!(v === v)) return LAND; for (const [b, c] of list) if (v < b) return c; return list[list.length - 1][1]; };

// temperature, rain, pressure and the sea's warmth: Evolution's ramps (v2/js/climate-lab/palettes.js, the same on every
// page) — temperature from deep purple at −40 °C through white at 0 to dark red at +40; rain on log(1 + mm/month), sand
// through greens to deep blue; pressure and the sea against its latitude, blue below and red above
const fromRamp = (R) => (v) => (v === v ? rampColor(R, v).map(x => x / 255) : LAND);
const tempColor = fromRamp(RAMPS.temperature);
const rainColor = fromRamp(RAMPS.rain);
const pressureColor = fromRamp(RAMPS.pressure);
const WIND_STOPS = [[0, [0.95, 0.95, 0.95]], [3, [0.60, 0.85, 0.90]], [7, [0.20, 0.60, 0.75]], [11, [0.35, 0.25, 0.70]], [16, [0.45, 0.05, 0.40]]];
const windColor = ramp(WIND_STOPS);
const anomColor = fromRamp(RAMPS.oceanAnom);
const UPWELL_STOPS = [[0, [0.06, 0.10, 0.30]], [0.1, [0.10, 0.30, 0.55]], [0.3, [0.15, 0.65, 0.70]], [0.8, [0.55, 0.95, 0.70]], [2, [0.95, 1.00, 0.80]]];
const upwellColor = ramp(UPWELL_STOPS);
const RANGE_STOPS = [[0, [0.15, 0.30, 0.70]], [10, [0.20, 0.65, 0.60]], [20, [0.75, 0.80, 0.25]], [35, [0.95, 0.50, 0.10]], [55, [0.65, 0.05, 0.10]]];
const rangeColor = ramp(RANGE_STOPS);
// UNEP aridity classes (P / PET)
const ARIDITY = [[0.05, [0.55, 0.10, 0.05], 'Hyper-arid'], [0.2, [0.90, 0.45, 0.15], 'Arid'], [0.5, [0.95, 0.80, 0.30], 'Semi-arid'],
    [0.65, [0.70, 0.80, 0.35], 'Dry sub-humid'], [1.0, [0.30, 0.65, 0.30], 'Humid'], [Infinity, [0.10, 0.40, 0.45], 'Very humid']];
const aridityColor = classes(ARIDITY);
const GROW_STOPS = [[0, [0.80, 0.82, 0.86]], [2, [0.65, 0.58, 0.45]], [5, [0.75, 0.75, 0.30]], [8, [0.35, 0.65, 0.25]], [12, [0.05, 0.35, 0.15]]];
const growColor = ramp(GROW_STOPS);
// Walsh & Lawler's seasonality classes
const SEASONALITY = [[0.2, [0.15, 0.35, 0.70], 'Very equable'], [0.4, [0.30, 0.60, 0.75], 'Equable, a wetter season'], [0.6, [0.55, 0.75, 0.55], 'Rather seasonal'],
    [0.8, [0.90, 0.80, 0.35], 'Seasonal'], [1.0, [0.95, 0.55, 0.20], 'Markedly seasonal'], [1.2, [0.85, 0.25, 0.15], 'Most rain in ≤ 3 months'], [Infinity, [0.50, 0.05, 0.15], 'Extreme']];
const seasonColor = classes(SEASONALITY);
// the mountains' share of the rain: shadow red-brown, windward blue (log₂ of the ratio)
const OROG_STOPS = [[-1.5, [0.90, 0.20, 0.13]], [-0.4, [0.75, 0.50, 0.45]], [0, [0.55, 0.55, 0.58]], [0.4, [0.45, 0.55, 0.80]], [1.5, [0.15, 0.40, 0.95]]];
const orogColor = ramp(OROG_STOPS);

/** Ice: sea ice (0–1) over a dark sea; an ice sheet (0–1) over the land's own colour. */
const SEA_ICE_RGB = [[0.10, 0.20, 0.45], [0.92, 0.95, 1.00]], ICE_SHEET_RGB = [0.97, 0.98, 1.00], SNOW_RGB = [0.84, 0.87, 0.92];
const seaIceColor = (f) => lerp3(SEA_ICE_RGB[0], SEA_ICE_RGB[1], Math.max(0, Math.min(1, f)));
/**
 * A quantity's colour ([r, g, b], 0–1) from its value, for the pages that colour their own way (Evolution's
 * v2/js/evolution/climate-view.js): pressure (hPa), wind (m/s), upwelling (m/day), seaIce (0–1), tRange (°C), rainShadow
 * (the ratio of the rain with mountains to without), aridity (P / PET), growing (months), rainSeason (Walsh's index).
 */
export const QUANTITY_COLORS = {
    pressure: pressureColor, wind: windColor, upwelling: upwellColor, seaIce: seaIceColor, tRange: rangeColor,
    rainShadow: (v) => orogColor(Math.log2(Math.max(1e-3, v))), aridity: aridityColor, growing: growColor, rainSeason: seasonColor,
};
export { ICE_SHEET_RGB, SNOW_RGB };
/** The class a value falls in, for the class layers (aridity, rainSeason): its label — or '' for any other. */
export function classLabel(id, v) {
    const list = id === 'aridity' ? ARIDITY : id === 'rainSeason' ? SEASONALITY : null;
    return list && v === v ? (list.find(([b]) => v < b) ?? list[list.length - 1])[2] : '';
}

/**
 * The colour of a climate layer at each region, as a function r → [r, g, b] — or null when the layer is not a climate
 * Inspect layer or the planet has no climate.
 */
export function climateColorFn(id, season, data) {
    const L = BY_ID[id], C = data?.climate;
    if (!L || !C) return null;
    const s = L.seasonal ? (season in SEASON_LABELS ? season : 'year') : 'year';
    const g = C.grid, cells = C.cells, elev = data.r_elevation;
    const sea = (r) => !(elev[r] > 0);
    const at = (f, r) => gridAt(data, f, r);
    switch (id) {
        case 'temperature': return (r) => tempColor(sea(r) ? at((g.Tsea ?? g.T)[s], r) : cells.t[s][r]);
        case 'precip': return (r) => rainColor(sea(r) ? at(g.P[s], r) : cells.p[s][r]);
        case 'pressure': return (r) => pressureColor(at(g.slp[s], r));
        case 'wind': return (r) => windColor(Math.hypot(at(g.u[s], r), at(g.v[s], r)));
        case 'currents': return (r) => (sea(r) ? anomColor(at(g.sstAnom[s], r)) : LAND);
        case 'upwelling': return (r) => (sea(r) ? upwellColor(at(g.upwelling[s], r)) : LAND);
        case 'ice': return (r) => (sea(r) ? seaIceColor(at(g.seaIce[s], r))
            : lerp3(g.snow ? lerp3(LAND, SNOW_RGB, Math.max(0, Math.min(1, at(g.snow[s], r)))) : LAND, ICE_SHEET_RGB, Math.max(0, Math.min(1, at(g.iceSheet, r)))));
        case 'tempRange': return (r) => (sea(r) ? SEA : rangeColor(cells.tRange[r]));
        case 'rainShadow': { const og = s === 'year' ? g.orographic : g.orographicSeasons[s]; return (r) => (sea(r) ? SEA : QUANTITY_COLORS.rainShadow(at(og, r))); }
        case 'aridity': return (r) => (sea(r) ? SEA : aridityColor(cells.aridity[r]));
        case 'growing': return (r) => (sea(r) ? SEA : growColor(cells.growing[r]));
        case 'rainSeason': return (r) => (sea(r) ? SEA : seasonColor(cells.rainSeason[r]));
    }
    return null;
}

// ── legends ──
const css = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
const gradient = (stops, lo, hi, labels) => {
    const span = hi - lo;
    return `<div class="legend-gradient" style="background:linear-gradient(to right,${stops.map(([v, c]) => `${css(c)} ${(100 * (v - lo) / span).toFixed(1)}%`).join(',')})"></div>` +
        `<div class="legend-labels">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
};
/** An Evolution ramp's bar (log ramps on log(1 + v), as Evolution draws them) with labels where their values fall:
 *  `marks` [value, text]. */
const rampLegend = (R, marks) => {
    const s = R.stops, tx = R.log ? (x) => Math.log1p(Math.max(0, x)) : (x) => x, lo = tx(s[0][0]), span = tx(s[s.length - 1][0]) - lo;
    const at = (v) => (100 * (tx(v) - lo) / span).toFixed(1);
    return `<div class="legend-gradient" style="background:linear-gradient(to right,${s.map(([v, c]) => `rgb(${c.join(',')}) ${at(v)}%`).join(',')})"></div>` +
        `<div class="legend-labels" style="position:relative;display:block;height:1.5em">${marks.map(([v, t], i) =>
            `<span style="position:absolute;left:${at(v)}%;transform:translateX(${i === 0 ? 0 : i === marks.length - 1 ? -100 : -50}%);white-space:nowrap">${t}</span>`).join('')}</div>`;
};
const swatches = (list) => `<div class="legend-classes">${list.map(([, c, label]) => `<span><i style="background:${css(c)}"></i>${label}</span>`).join('')}</div>`;
const note = (text) => `<div class="legend-note">${text}</div>`;

/** The legend's HTML for a climate layer and season. */
export function climateLegendHTML(id, season) {
    const L = BY_ID[id]; if (!L) return '';
    const sn = L.seasonal ? ` · ${SEASON_LABELS[season] ?? 'Year'}` : '';
    switch (id) {
        case 'temperature': return rampLegend(RAMPS.temperature, [[-40, '−40'], [-20, '−20'], [0, '0'], [20, '20'], [40, '40 °C']]) + note(`Air temperature, °C${sn} — over the sea, its surface`);
        case 'precip': return rampLegend(RAMPS.rain, season === 'year' ? [[0, '0'], [10, '120'], [60, '720'], [500, '6,000 mm/yr']] : [[0, '0'], [10, '10'], [60, '60'], [500, '500 mm/month']]) + note(`Precipitation${sn}`);
        case 'pressure': return rampLegend(RAMPS.pressure, [[990, '990'], [1012, '1012'], [1034, '1034 hPa']]) + note(`Sea-level pressure${sn} · arrows: the wind · green line: the ITCZ`);
        case 'wind': return gradient(WIND_STOPS, 0, 16, ['0', '8', '16 m/s']) + note(`Surface wind speed${sn} · arrows: its direction`);
        case 'currents': return rampLegend(RAMPS.oceanAnom, [[-6, '−6'], [0, '0'], [6, '+6 °C']]) + note(`The sea against its latitude’s average${sn} (warm and cold currents) · arrows: surface currents — seasonal in the tropics`);
        case 'upwelling': return gradient(UPWELL_STOPS, 0, 2, ['0', '1', '2 m/day']) + note(`Cold, nutrient-rich water rising where the wind pushes the surface away${sn}`);
        case 'ice': return gradient([[0, SEA_ICE_RGB[0]], [1, SEA_ICE_RGB[1]]], 0, 1, ['Open sea', 'Sea ice']) + note(`Sea ice${sn}; on land, snow${sn} and the ice sheets`);
        case 'tempRange': return gradient(RANGE_STOPS, 0, 55, ['0', '20', '40 °C']) + note('Warmest month minus coldest — continentality: small by the sea, large deep inland');
        case 'rainShadow': return gradient(OROG_STOPS, -1.5, 1.5, ['Rain shadow', 'No effect', 'Windward']) + note(`How mountains move the rain${sn}: wetter windward slopes, drier lands in their lee`);
        case 'aridity': return swatches(ARIDITY) + note('UNEP aridity index: precipitation ÷ potential evaporation');
        case 'growing': return gradient(GROW_STOPS, 0, 12, ['0', '6', '12 months']) + note('Months warmer than 10 °C — where forests and crops can grow');
        case 'rainSeason': return swatches(SEASONALITY) + note('Rain seasonality (Walsh & Lawler): how unevenly the rain falls through the year');
    }
    return '';
}

// ── hover lines ──
const fmt = (v, d = 0) => (v === v ? (Math.round(v * 10 ** d) / 10 ** d).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
/** The climate's lines for the hover readout at a region (HTML, using the readout's .hi-label). */
export function climateReadoutLines(data, r) {
    const C = data?.climate; if (!C) return [];
    const g = C.grid, cells = C.cells, isSea = !(data.r_elevation[r] > 0), lines = [];
    const at = (f) => gridAt(data, f, r);
    if (isSea) {
        const Ts = g.Tsea ?? g.T;
        lines.push(`<span class="hi-label">SST</span> ${fmt(at(Ts.jan))}°C Jan · ${fmt(at(Ts.jul))}°C Jul`);
        const ice = Math.max(at(g.seaIce.jan), at(g.seaIce.jul));
        if (ice > 0.05) lines.push(`<span class="hi-label">Sea ice</span> ${fmt(100 * at(g.seaIce.jan))}% Jan · ${fmt(100 * at(g.seaIce.jul))}% Jul`);
    } else {
        lines.push(`<span class="hi-label">Temp</span> ${fmt(cells.t.jan[r])}°C Jan · ${fmt(cells.t.jul[r])}°C Jul`);
        lines.push(`<span class="hi-label">Precip</span> ${fmt(cells.p.year[r] * 12)} mm/yr · ${fmt(cells.p.jan[r])} Jan · ${fmt(cells.p.jul[r])} Jul`);
        const ar = ARIDITY.find(([b]) => cells.aridity[r] < b);
        if (ar) lines.push(`<span class="hi-label">Aridity</span> ${ar[2]} (${fmt(cells.aridity[r], 2)})`);
    }
    return lines;
}

/** The wind or current vector (east, north; m/s) at a latitude / longitude, for the arrows. */
export function vectorAt(grid, kind, season, latDeg, lonDeg) {
    const s = season in SEASON_LABELS ? season : 'year';
    const U = kind === 'wind' ? grid.u[s] : grid.currentU[s], V = kind === 'wind' ? grid.v[s] : grid.currentV[s];
    return [sampleGrid(grid, U, latDeg, lonDeg), sampleGrid(grid, V, latDeg, lonDeg)];
}

// ── on the page ──
/** The arrows a layer shows, in the season chosen: each built (or cleared, with null). */
export function showClimateArrows(layer, season, buildWind, buildCurrents) {
    const a = BY_ID[layer]?.arrows;
    buildWind(a === 'wind' ? season : null);
    buildCurrents(a === 'currents' ? season : null);
}
/** The Satellite view's legend: its climates' lowland colours, and what it shows, in the season chosen. */
export function satelliteLegendHTML(season) {
    const F = Object.fromEntries(RAMP_FAMILIES.map(f => [f.name, f]));
    const stops = [['desert', 'Desert'], ['steppe', 'Steppe'], ['savanna', 'Savanna'], ['temperate', 'Forest'], ['taiga', 'Taiga'], ['tundra', 'Tundra'], ['ice', 'Ice']]
        .map(([k, label]) => ({ c: F[k].summer.low[0], label }));
    const grad = stops.map((s, i) => `rgb(${s.c.join(',')}) ${Math.round(i / (stops.length - 1) * 100)}%`).join(', ');
    const sn = season in SEASON_LABELS && season !== 'year' ? ` in ${SEASON_LABELS[season]}` : '';
    return `<div class="legend-gradient" style="background:linear-gradient(to right,${grad})"></div>` +
        `<div class="legend-labels"><span>${stops[0].label}</span><span>${stops[3].label}</span><span>${stops[6].label}</span></div>` +
        note(`Each climate's colours${sn}, climbing with the land to rock and snow`);
}
/** Wire the season picker: `onChange(season)` after state.climateSeason is set. */
export function initSeasonPicker(state, onChange) {
    const sel = document.getElementById('climateSeason');
    if (!sel) return;
    sel.value = state.climateSeason;
    sel.addEventListener('change', () => { state.climateSeason = sel.value; onChange(sel.value); });
}
