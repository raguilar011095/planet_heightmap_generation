// The export's rasters, shared by the pages (Generate and Import through js/export-generate.js, Evolution through
// v2/js/evolution/export.js): a layer is a picture ({ kind: 'rgba' | 'gray16' | 'gray8', W, H, data }) — colour as
// shown, or the numbers themselves as a greyscale on a fixed, documented scale (the README.txt that goes in the ZIP says
// which) — before it is projected (projections.js) and encoded (png.js). DOM-free.

import { pictureShader } from './terrain-shade.js';

/** The data layers' scales: each quantity's greyscale is linear from `lo` (0) to `hi` (65535, or 255 at 8 bits). */
export const DATA_SCALES = {
    temperature: { unit: '°C', lo: -60, hi: 60 },
    precip:      { unit: 'mm/month', lo: 0, hi: 1000 },
    pressure:    { unit: 'hPa', lo: 950, hi: 1050 },
    windSpeed:   { unit: 'm/s', lo: 0, hi: 40 },
    windU:       { unit: 'm/s (east)', lo: -40, hi: 40 },
    windV:       { unit: 'm/s (north)', lo: -40, hi: 40 },
    sstAnom:     { unit: '°C against the latitude\'s mean', lo: -10, hi: 10 },
    currentU:    { unit: 'm/s (east)', lo: -3, hi: 3 },
    currentV:    { unit: 'm/s (north)', lo: -3, hi: 3 },
    upwelling:   { unit: 'm/day', lo: 0, hi: 5 },
    seaIce:      { unit: 'fraction', lo: 0, hi: 1 },
    snow:        { unit: 'fraction', lo: 0, hi: 1 },
    iceSheet:    { unit: 'fraction', lo: 0, hi: 1 },
    tempRange:   { unit: '°C (warmest − coldest month)', lo: 0, hi: 80 },
    rainShadow:  { unit: 'ratio (rain with the mountains ÷ without)', lo: 0, hi: 4 },
    aridity:     { unit: 'P / PET', lo: 0, hi: 5 },
    growing:     { unit: 'months above 10 °C', lo: 0, hi: 12 },
    rainSeason:  { unit: 'Walsh seasonality index', lo: 0, hi: 1.5 },
    hillshade:   { unit: 'light (0 dark … 180 flat … 255 lit; the shading style, strength and light shown)', lo: 0, hi: 1 },
    landmask:    { unit: 'land 255, sea 0', lo: 0, hi: 1 },
    koppenIndex: { unit: 'Köppen class index (0 = sea; the README lists the classes)', lo: 0, hi: 255 },
    plateId:     { unit: 'plate number', lo: 0, hi: 255 },
};

/** A value's share of a scale, 0…1 (NaN as 0). */
export const scaled = (v, sc) => (v === v ? Math.min(1, Math.max(0, (v - sc.lo) / (sc.hi - sc.lo))) : 0);

/** 0…1 values as 16-bit greys. */
export function to16(values) {
    const out = new Uint16Array(values.length);
    for (let i = 0; i < values.length; i++) { const v = values[i]; out[i] = v === v ? Math.round(65535 * Math.min(1, Math.max(0, v))) : 0; }
    return out;
}
/** 16-bit greys as 8-bit (a class index written as index / 255 comes back exactly). */
export function gray16to8(g16) {
    const out = new Uint8Array(g16.length);
    for (let i = 0; i < g16.length; i++) out[i] = Math.round(g16[i] / 257);
    return out;
}

/**
 * The relief shading of a picture of heights `h` (km, W × H; `sea`: 1 on the sea, or null for none), 8-bit: 0 facing away
 * from the light, 180 on flat ground, up to 255 facing it — in the shading shown (terrain-shade.js pictureShader:
 * `shading` {exaggeration, style, azimuthDeg, …}, or a number: the classic light's exaggeration).
 */
export function hillshade8(h, W, H, shading = 20, sea = null) {
    const opts = typeof shading === 'number' ? { exaggeration: shading } : shading;
    const shadeAt = pictureShader(h, sea ?? new Uint8Array(W * H), W, opts), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = Math.round(Math.min(255, 180 * shadeAt(x, y)));
    return out;
}

/** The season's word in a file name and the README. */
export const SEASON_NAMES = { year: 'the year', jan: 'January', jul: 'July' };

/**
 * The README.txt that goes in a ZIP: what every file is, its kind and scale, and how the export was made.
 * `files`: [{ name, row, variant, season, file, kind, W, H }]; `about`: { page, planet, link, width, height, projection,
 * centerLon, hillshade, notes }.
 */
export function readmeText(about, files, koppenClasses = null) {
    const L = [];
    L.push(`World Orogen — export from the ${about.page} page`, `https://orogen.studio/`, '');
    if (about.planet) L.push(`Planet: ${about.planet}`);
    if (about.link) L.push(`Link: ${about.link}`);
    L.push(`Made: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    L.push(`Projection: ${about.projection || 'equirectangular'}${about.projectionNote ? ` (${about.projectionNote})` : ''}`);
    L.push(`Centre longitude: ${about.centerLon ? `${Math.abs(about.centerLon)}°${about.centerLon > 0 ? 'E' : 'W'}` : '0°'}`);
    L.push(`Size: ${about.width} × ${about.height} px${about.sizeNote ? ` (${about.sizeNote})` : ''}`);
    if (about.hillshade != null) L.push(`Hillshade on the colour maps: ${about.hillshade ? 'on' : 'off'}`);
    for (const n of about.notes || []) L.push(n);
    L.push('', 'Files', '-----');
    for (const f of files) {
        const kind = f.kind === 'rgba' ? 'colour PNG' : f.kind === 'gray16' ? '16-bit greyscale PNG' : '8-bit greyscale PNG';
        const season = f.season ? `, ${SEASON_NAMES[f.season] || f.season}` : '';
        let scale = '';
        if (f.file?.scale) {
            const sc = f.file.scale, top = f.kind === 'gray8' ? 255 : 65535;
            scale = sc.lo === 0 && sc.hi === 255 && f.kind === 'gray8' ? ` — ${sc.unit}` : ` — ${sc.unit}: 0 = ${sc.lo}, ${top} = ${sc.hi}, linear`;
        }
        L.push(`${f.name}`, `    ${f.label}${season} — ${kind}${scale}`);
    }
    if (koppenClasses) {
        L.push('', 'Köppen classes (the index in the class-index file)', '----------------------------------------------');
        koppenClasses.forEach((k, i) => L.push(`${String(i).padStart(2)}  ${k.code || 'sea'}${k.name ? `  ${k.name}` : ''}`));
    }
    L.push('', 'Data files are linear greyscales on the scale given: value = lo + grey / top × (hi − lo). The 16-bit files',
        'open in GIMP, Photoshop, QGIS, Blender and most game engines; a viewer that reads only 8 bits shows the top byte.',
        'Equirectangular maps wrap: the left and right edges meet. The planet is a sphere of Earth\'s size (6371 km radius).');
    return L.join('\n') + '\n';
}

/** A file name's pieces joined: `orogen-temperature-jul-data-0009j7…-c90E.png`. */
export function fileName(parts, ext = 'png') {
    return parts.filter(Boolean).map(p => String(p).replace(/[^A-Za-z0-9+-]+/g, '-').replace(/^-|-$/g, '')).join('-') + '.' + ext;
}

/** The climate maps both pages export, in the Inspect order: each as Colour (its legend's colours) and as Data files. */
export function climateRows(needs = 'climate') {
    const d = (key, suffix, label) => ({ key, suffix, label, scale: DATA_SCALES[key], bits: 16 });
    const row = (id, label, seasonal, data, tip) => ({ id, label, colour: true, seasonal, needs, data, tip });
    return [
        row('temperature', 'Temperature', true, [d('temperature', '', 'Temperature')], 'Air temperature at the surface (the sea\'s surface at sea)'),
        row('precip', 'Precipitation', true, [d('precip', '', 'Precipitation')], 'Rain and snow, mm a month (the year: the monthly mean)'),
        row('pressure', 'Pressure', true, [d('pressure', '', 'Sea-level pressure')], 'Sea-level pressure, hPa'),
        row('wind', 'Wind', true, [d('windSpeed', 'speed', 'Wind speed'), d('windU', 'u', 'Wind, eastward'), d('windV', 'v', 'Wind, northward')], 'Surface wind: its speed, and as data its east and north parts too'),
        row('currents', 'Ocean Currents', true, [d('sstAnom', 'warmth', 'Sea surface temperature against its latitude\'s mean'), d('currentU', 'u', 'Current, eastward'), d('currentV', 'v', 'Current, northward')], 'Warm and cold currents (the sea against its latitude\'s average), and the current itself as data'),
        row('upwelling', 'Upwelling', true, [d('upwelling', '', 'Upwelling')], 'Cold water rising where the wind pushes the surface away, m a day'),
        row('ice', 'Ice', true, [d('seaIce', 'sea-ice', 'Sea ice cover'), d('snow', 'snow', 'Snow cover on land'), d('iceSheet', 'ice-sheet', 'Ice sheet')], 'Sea ice, the season\'s snow on land and the ice sheets — three data files'),
        row('tempRange', 'Temperature Range', false, [d('tempRange', '', 'Temperature range')], 'Warmest month minus coldest, °C'),
        row('rainShadow', 'Rain Shadow', true, [d('rainShadow', '', 'Rain shadow')], 'The mountains\' share of the rain: the ratio of the rain with them to without — for the year, January or July, as the winds turn'),
        row('aridity', 'Aridity', false, [d('aridity', '', 'Aridity')], 'P / PET: rain against what the sun could evaporate'),
        row('growing', 'Growing Season', false, [d('growing', '', 'Growing season')], 'Months above 10 °C'),
        row('rainSeason', 'Rain Seasonality', false, [d('rainSeason', '', 'Rain seasonality')], 'How much of the rain falls in a few months (Walsh\'s index)'),
    ];
}
