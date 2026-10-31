// The export's rasters, shared by the pages (Generate and Import through js/export-generate.js, Evolution through
// v2/js/evolution/export.js): a layer is a picture ({ kind: 'rgba' | 'gray16' | 'gray8', W, H, data }) — colour as
// shown, or the numbers themselves as a greyscale on a fixed, documented scale (the README.txt that goes in the ZIP says
// which) — before it is projected (projections.js) and encoded (png.js). DOM-free.

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
    hillshade:   { unit: 'light (0 dark … 255 lit; light from the north-west)', lo: 0, hi: 1 },
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
 * A hillshade of an equirectangular height picture (`h` in km, W × H), lit from the north-west as the Evolution page
 * shades its terrain (finish-view.js paintFinished): the light on each pixel's slope, 0…255 — flat ground 180, a
 * north-west slope brighter, a south-east slope darker. `exaggeration`: the slope's vertical exaggeration.
 */
export function hillshade8(h, W, H, exaggeration = 20) {
    const out = new Uint8Array(W * H), pxKm = 2 * Math.PI * 6371 / W, Le = -0.5, Ln = 0.5, Lu = Math.SQRT1_2;
    for (let y = 0; y < H; y++) {
        const cl = Math.max(0.05, Math.cos(((y + 0.5) / H - 0.5) * Math.PI)), up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, row = y * W;
        for (let x = 0; x < W; x++) {
            const ge = (h[row + (x + 1) % W] - h[row + (x - 1 + W) % W]) / (2 * pxKm * cl), gn = (h[up + x] - h[dn + x]) / (2 * pxKm);
            const px = -exaggeration * ge, py = -exaggeration * gn, len = Math.sqrt(px * px + py * py + 1);
            out[row + x] = Math.round(255 * Math.max(0, (px * Le + py * Ln + Lu) / len));
        }
    }
    return out;
}

/**
 * A picture of classes (`data`, R.w × R.h: a class per pixel, 0 none — the sea) at width W, each land pixel (`sea`, W ×
 * W/2, 0) its class: averaged down, the class most of its block has; enlarged, the class the nearest four by four pixels
 * weigh most by a cubic B-spline (smooth, positive weights: the classes' stair-stepped borders rounded into curves). Land
 * the picture marks as none (a coast a pixel apart) takes the nearest class. `n`: how many classes. (The Köppen zones'
 * export; Evolution's rocks.)
 */
export function classIndexMap(R, data, n, W, sea) {
    const H = W >> 1, out = new Uint8Array(W * H);
    const s = R.w / W, K = Math.max(1, Math.round(s)), votes = new Float32Array(n), bx = [0, 0, 0, 0], by = [0, 0, 0, 0];
    const bspline = (t, w) => { const t2 = t * t, t3 = t2 * t, u = 1 - t; w[0] = u * u * u / 6; w[1] = (3 * t3 - 6 * t2 + 4) / 6; w[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; w[3] = t3 / 6; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x;
        let z = 0;
        if (!sea[p]) {
            votes.fill(0);
            if (s >= 1) {
                for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) votes[data[Math.min(R.h - 1, y * K + dy) * R.w + Math.min(R.w - 1, x * K + dx)]]++;
            } else {
                const u = (x + 0.5) * s - 0.5, v = (y + 0.5) * s - 0.5, x0 = Math.floor(u), y0 = Math.floor(v);
                bspline(u - x0, bx); bspline(v - y0, by);
                for (let j = 0; j < 4; j++) {
                    const row = Math.min(R.h - 1, Math.max(0, y0 - 1 + j)) * R.w;
                    for (let i = 0; i < 4; i++) votes[data[row + ((x0 - 1 + i) % R.w + R.w) % R.w]] += bx[i] * by[j];
                }
            }
            for (let c = 1; c < votes.length; c++) if (votes[c] > votes[z]) z = c;
            if (!z) z = nearestClass(R, data, Math.min(R.w - 1, Math.floor((x + 0.5) * s)), Math.min(R.h - 1, Math.floor((y + 0.5) * s)));
        }
        out[p] = z;
    }
    return out;
}
/** The nearest class to a picture's pixel (a ring at a time, up to 3 pixels out), or 0. */
function nearestClass(R, data, cx, cy) {
    for (let d = 1; d <= 3; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const yy = cy + dy;
        if (yy < 0 || yy >= R.h) continue;
        const z = data[yy * R.w + ((cx + dx) % R.w + R.w) % R.w];
        if (z) return z;
    }
    return 0;
}

/** The season's word in a file name and the README. */
export const SEASON_NAMES = { year: 'the year', jan: 'January', jul: 'July' };

/**
 * The README.txt that goes in a ZIP: what every file is, its kind and scale, and how the export was made.
 * `files`: [{ name, row, variant, season, file, kind, about, W, H }] (kind 'file': not a map — `about` says what it is);
 * `about`: { page, planet, link, width, height, projection, centerLon, hillshade, notes }; `lists`: more numbered lists
 * after the Köppen classes' ([{ title, items }]: a class index file's classes).
 */
export function readmeText(about, files, koppenClasses = null, lists = []) {
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
        const kind = f.kind === 'file' ? f.about : f.kind === 'rgba' ? 'colour PNG' : f.kind === 'gray16' ? '16-bit greyscale PNG' : '8-bit greyscale PNG';
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
    for (const { title, items } of lists) {
        L.push('', title, '-'.repeat(title.length));
        items.forEach((t, i) => L.push(`${String(i).padStart(2)}  ${t}`));
    }
    L.push('', 'Data files are linear greyscales on the scale given: value = lo + grey / top × (hi − lo). The 16-bit files',
        'open in GIMP, Photoshop, QGIS, Blender and most game engines; a viewer that reads only 8 bits shows the top byte.',
        'Equirectangular maps wrap: the left and right edges meet. The planet is a sphere of Earth\'s size (6371 km radius).');
    L.push('', 'These maps are yours to use however you like, including commercially.');
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
