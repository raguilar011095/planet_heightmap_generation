// The geology's exports (plans/V2_GEOLOGY_PLAN.md G6; finished moments only, as every export): a group of rows in the
// export panel (export.js CATALOGUE, view/export-panel.js), so they come in its widths and projections, centred as the
// map is, over the hillshade or flat. Each view's map in its own colours — the Rocks, the Deposits as shown, each age's,
// the record's — and as data its numbers: the rock types' index, a greyscale richness mask per resource (0 none … 255 the
// richest, the sea black: to paint with downstream). And two that are not maps: the districts as GeoJSON and CSV with
// their stories, and a resource atlas — each landmass's resources and its richest districts, in words.

import { paintFinished, rasterAt } from './finish-view.js';
import { finishedGeologyColor, rocksColor, rockPixel, subjectsOf, districtsOf, districtTale, gradeOf, rankWords } from './geology-view.js';
import { METALS } from '../geology/deposits.js';
import { AGES, resourceField, potentialField } from '../geology/ages.js';
import { landmasses, landmassName, landmassShares, fmtKm2 } from '../geology/districts.js';
import { Rock, ROCK_INFO, ROCK_COUNT } from '../geology/rocks.js';
import { KOPPEN_CLASSES, KOPPEN_ID } from '../climate/koppen.js';
import { classIndexMap } from '../view/export-raster.js';

// ── the panel's rows ──
const MASK = { unit: 'richness (0 none … 1 the richest)', lo: 0, hi: 1 };
const ROCK_INDEX = { unit: 'rock type index (0 = sea; the README lists the types)', lo: 0, hi: 255 };
const kebab = id => id.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const mask = (key, suffix, label) => ({ key, suffix, label, scale: MASK, bits: 8 });
const textFile = (key, ext, label) => ({ key, suffix: '', ext, label });
/** The ages a people's technology makes (the rest — fuel, gems, building stone — are what lies there). */
const TECH = new Set(['stone', 'copper', 'bronze', 'iron', 'industrial']);
const OFF = 'Needs the moment\'s geology: add detail again (a moment detailed before the geology was, or saved before it, has none)';
const row = (id, label, needs, geology, more) => ({ id, label, needs, geology, offTip: OFF, ...more });
/** The Geology group of the export panel: each row's `geology` the view it draws (or the file it writes). */
export const GEOLOGY_GROUP = { id: 'geology', label: 'Geology', rows: [
    row('rocks', 'Rocks', 'geology', 'geoRocks', { colour: true, data: [{ key: 'rockIndex', suffix: 'index', label: 'Rock type index', scale: ROCK_INDEX, bits: 8 }],
        tip: 'The Rocks view: what the land is made of at the surface, in a geologic map\'s colours; as data, each pixel\'s rock type as a number (the README lists them)' }),
    row('deposits', 'Deposits', 'deposits', 'geoDeposits', { colour: true, data: METALS.map(m => mask(`m.${m.id}`, kebab(m.id), `${m.name} richness`)),
        tip: 'The Deposits view as shown: the metals and minerals together, or the metal, fuel or kind of deposit chosen there; as data, a richness mask for every metal, mineral and fuel (0 none … 255 the richest)' }),
    ...AGES.map(a => row(`age-${a.id}`, a.name, 'deposits', 'geoAges', { age: a.id, colour: true,
        data: [...a.resources.map(r => mask(`${a.id}.${r.id}`, kebab(r.id), TECH.has(a.id) ? `${r.name}, as the ${a.name} could reach it` : `${r.name} richness`)),
            ...(a.potential ? [mask(`${a.id}.potential`, 'potential', `${a.potential.name} potential: ${a.potential.words}`)] : [])],
        tip: `${a.name}: ${a.words}. Its map, all of it; as data, a richness mask for each${a.potential ? `, and where ${a.potential.name.toLowerCase()} could be made` : ''}` })),
    row('belts', 'Mountain belts', 'geology', 'geoBelts', { colour: true, tip: 'Mountain belts by when each was last active: red while active, orange while its range stands, tan as it wears, violet once worn flat' }),
    row('seas', 'Past seas', 'geology', 'geoSeas', { colour: true, tip: 'Where shallow seas lay over the continents, and when' }),
    row('sediment', 'Sediment', 'geology', 'geoCover', { colour: true, tip: 'The sediment laid on the continents — sand and mud, limestone, salt, coal, black shale — by its top, deeper the thicker' }),
    row('erosion', 'Erosion depth', 'geology', 'geoWear', { colour: true, tip: 'How deep erosion has cut into the basement: the rock now at the surface once lay this deep' }),
    row('districts', 'Districts', 'deposits', 'districts', { data: [textFile('districtsGeojson', 'geojson', 'Districts'), textFile('districtsCsv', 'csv', 'Districts')],
        tip: 'Every district of every metal, fuel and gem — its kind of deposit, grade, area, landmass, rank on the world and the story of how it formed — as GeoJSON points (longitude, latitude) and a CSV table. Not maps: the projection and centre leave them as they are' }),
    row('atlas', 'Resource atlas', 'deposits', 'atlas', { data: [textFile('atlas', 'md', 'Resource atlas')],
        tip: 'Each landmass\'s rocks, metals, fuels and gems, bronze and ironworking, and its richest districts with their stories — in words (Markdown)' }),
] };
/** The README's list of the rock types (the rock type index file's numbers), when the export has one. */
export const rockTypesList = files => (files.some(f => f.file?.key === 'rockIndex') ? [{ title: 'Rock types (the number in the rock type index file)', items: ROCK_INFO.map(r => r.name) }] : []);

/** The picture at width W, and painted at it — the moment's own, averaged or enlarged (export.js passes its own: with the
 *  detail finer than the mesh where an export wider than the picture drew it). */
const PLAIN = { pictureAt: (fin, W) => rasterAt(fin.raster, W), paintAt: (fin, W, image, lut, opts) => paintFinished(fin.raster, { width: W, image }, lut, opts) };

/**
 * One file of a geology row, W wide, as the panel asks for it (`job`: {row, variant, file}), unturned (export.js centres it):
 * a map ({kind, W, H, data}) or a file that is not one ({kind: 'file', blob, about}). `lk`: the look ({lut, exaggeration,
 * shaded, deposit (the Deposits view's pick), frame (the moment's), simMesh, seed}); `pic`: the picture at W, and painted
 * ({pictureAt, paintAt}: export.js's, the detail finer than the mesh where drawn).
 */
export function produceGeology(fin, W, lk, job, pic = PLAIN) {
    const r = job.row, H = W >> 1;
    if (job.variant === 'colour') return geologyMap(fin, W, r.geology, lk, { pick: lk.deposit ?? 'all', age: r.age ?? 'bronze' }, pic);
    const key = job.file.key;
    if (key === 'rockIndex') return { kind: 'gray8', W, H, data: rockIndexMap(fin, W, pic) };
    if (key === 'districtsGeojson') return { kind: 'file', blob: textBlob(districtsGeoJson(districtRows(fin, lk.frame)), 'application/geo+json'), about: 'GeoJSON: a point per district (longitude, latitude in degrees) with its resource, kind of deposit, grade, area, landmass, rank and story' };
    if (key === 'districtsCsv') return { kind: 'file', blob: textBlob(districtsCsv(districtRows(fin, lk.frame)), 'text/csv'), about: 'CSV: a row per district — resource, kind of deposit, grade, richness, area, landmass, rank, latitude, longitude, story' };
    if (key === 'atlas') return { kind: 'file', blob: textBlob(resourceAtlas(fin, lk.frame, { seed: lk.seed }), 'text/markdown'), about: 'Markdown text: each landmass\'s resources and its richest districts' };
    return { kind: 'gray8', W, H, data: maskMap(fin, W, maskField(fin, key), pic) };
}

/**
 * A geology view's map at width W, as on screen: its colours, shaded by the relief (unless `lk.shaded` is false), the
 * lakes as water — wider than the picture, over the detail finer than the mesh where the export drew it (`pic`). The
 * rocks, a picture as wide as the climate's, are drawn narrower from their commonest there (export-raster.js
 * classIndexMap; the ice caps' veil from the Köppen zones', likewise), wider as the view draws them zoomed in
 * (geology-view.js rockPixel: contacts running smoothly between its pixels, the finer coast's land its nearest rock).
 */
export function geologyMap(fin, W, layer, lk, { pick = 'all', age = 'bronze', agePick = 'all' } = {}, pic = PLAIN) {
    const H = W >> 1, image = { data: new Uint8ClampedArray(4 * W * H) }, G = fin.raster.geology;      // (no canvas: DOM-free)
    let colorAt;
    if (layer === 'geoRocks' && W < G.w) {
        const { sea } = pic.pictureAt(fin, W), K = fin.climate?.raster, ef = KOPPEN_ID.EF;
        const kop = K?.koppen ? classIndexMap(K, K.koppen, KOPPEN_CLASSES.length, W, sea) : null;
        colorAt = rocksColor(fin, W, { rock: classIndexMap(G, G.rock, ROCK_COUNT, W, sea), ice: kop && kop.map(z => (z === ef ? 1 : 0)) });
    } else colorAt = finishedGeologyColor(layer, lk.frame, lk.simMesh, W, fin, pick, age, agePick);
    pic.paintAt(fin, W, image, lk.lut, { exaggeration: lk.exaggeration, lakes: true, shaded: lk.shaded !== false, colorAt });
    return { kind: 'rgba', W, H, data: image.data };
}

/** Each pixel's rock type (ROCK_INFO's index; 0 the sea), at width W: as the Rocks map draws it — narrower than the rocks'
 *  picture its commonest there, wider the view's (rockPixel; land the picture has as sea its nearest land's rock). */
export function rockIndexMap(fin, W, pic = PLAIN) {
    const G = fin.raster.geology, { sea } = pic.pictureAt(fin, W);
    if (W <= G.w) return classIndexMap(G, G.rock, ROCK_COUNT, W, sea);
    const H = W >> 1, px = rockPixel(G, W), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (sea[p]) continue;
        const i = px(x, y);
        out[p] = (i >= 0 && G.rock[i]) || Rock.ALLUVIUM;
    }
    return out;
}

/** A mask's richness per kept grid cell (0…1), by its key: 'm.' and a metal, fuel or mineral; an age's id, '.', and one
 *  of its resources or 'potential'. And whether it counts at sea (oil and gas, on the shelf). */
function maskField(fin, key) {
    const Dp = fin.raster.geology.deposits, K = Dp.cells.length;
    if (key.startsWith('m.')) {
        const i = METALS.findIndex(m => m.id === key.slice(2)), SYS = Dp.rows - METALS.length;
        return { field: Float32Array.from(Dp.data.subarray((SYS + i) * K, (SYS + i + 1) * K), x => x / 255), offshore: METALS[i].id === 'oilGas' };
    }
    const [ageId, resId] = key.split('.'), age = AGES.find(a => a.id === ageId);
    if (resId === 'potential') return { field: potentialField(Dp, age), offshore: false };
    const res = age.resources.find(x => x.id === resId);
    return { field: resourceField(Dp, res), offshore: !!res.offshore };
}
/** A richness mask at width W: 0 none … 255 the richest, smooth between the grid's cells (as the map's washes); the sea
 *  black (but oil and gas on the shelf). */
function maskMap(fin, W, { field, offshore }, pic = PLAIN) {
    const Dp = fin.raster.geology.deposits, H = W >> 1, { sea } = offshore ? { sea: null } : pic.pictureAt(fin, W), full = new Float32Array(Dp.w * Dp.h);
    for (let j = 0; j < Dp.cells.length; j++) full[Dp.cells[j]] = field[j];
    // (each picture column's place on the grid, once)
    const gx0 = new Int32Array(W), gx1 = new Int32Array(W), fx = new Float32Array(W);
    for (let x = 0; x < W; x++) { const g = ((x + 0.5) / W * 360) / Dp.step - 0.5, x0 = Math.floor(g); fx[x] = g - x0; gx0[x] = (x0 + Dp.w) % Dp.w; gx1[x] = (x0 + 1 + Dp.w) % Dp.w; }
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        const g = Math.max(0, Math.min(Dp.h - 1, ((y + 0.5) / H * 180) / Dp.step - 0.5)), y0 = Math.floor(g), fy = g - y0, r0 = y0 * Dp.w, r1 = Math.min(Dp.h - 1, y0 + 1) * Dp.w;
        for (let x = 0; x < W; x++) {
            const p = y * W + x;
            if (sea?.[p]) continue;
            const a = full[r0 + gx0[x]] + (full[r0 + gx1[x]] - full[r0 + gx0[x]]) * fx[x], b = full[r1 + gx0[x]] + (full[r1 + gx1[x]] - full[r1 + gx0[x]]) * fx[x];
            data[p] = Math.round(255 * Math.min(1, Math.max(0, a + (b - a) * fy)));
        }
    }
    return data;
}

/** Every district of every metal, fuel and gem: one row each, with its story. */
export function districtRows(fin, frame) {
    const L = landmasses(fin.raster.geology.deposits), rows = [];
    // (diamonds once: with the metals)
    const subjects = [...METALS.filter(m => m.id !== 'wood').map(m => subjectsOf(fin, 'geoDeposits', `m.${m.id}`)[0]), ...subjectsOf(fin, 'geoAges', 'all', 'gems', 'all').filter(s => s.id !== 'diamonds')]
        .filter(Boolean).map(s => ({ s, group: METALS.find(m => m.id === s.id && s.bytes)?.group ?? 'gem' }));
    for (const { s, group } of subjects) {
        const { list } = districtsOf(fin, s);
        list.forEach((d, i) => {
            const t = districtTale(fin, frame, s, d);
            rows.push({ resource: s.name, group, kind: t.kind, grade: gradeOf(d.v), richness: +d.v.toFixed(3), areaKm2: Math.round(d.km2), landmass: landmassName(L, d.landmass), landmassId: d.landmass,
                rank: i + 1, of: list.length, lat: +d.lat.toFixed(3), lon: +d.lon.toFixed(3), story: t.story });
        });
    }
    return rows;
}
/** The districts as GeoJSON points (a FeatureCollection). */
export function districtsGeoJson(rows) {
    return JSON.stringify({ type: 'FeatureCollection', features: rows.map(({ lat, lon, ...p }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: p })) });
}
/** The districts as CSV (a header row, then one row each). */
export function districtsCsv(rows) {
    const cols = ['resource', 'group', 'kind', 'grade', 'richness', 'areaKm2', 'landmass', 'landmassId', 'rank', 'of', 'lat', 'lon', 'story'];
    const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

/**
 * The resource atlas, in words (Markdown): the world's resources by landmass — its land, its rocks by family, each metal,
 * fuel and gem moderate or rich, what it lacks, bronze and ironworking — then its richest districts with their stories.
 */
export function resourceAtlas(fin, frame, { seed = '', time = frame?.time ?? 0 } = {}) {
    const G = fin.raster.geology, Dp = G.deposits, L = landmasses(Dp), rows = districtRows(fin, frame), K = Dp.cells.length, SYS = Dp.rows - METALS.length;
    const pct = x => (x >= 0.0995 ? `${Math.round(100 * x)}` : x >= 0.0005 ? (100 * x).toFixed(1) : '0') + '%';
    const metals = METALS.map((m, i) => ({ name: m.name, group: m.group, field: Float32Array.from(Dp.data.subarray((SYS + i) * K, (SYS + i + 1) * K), x => x / 255) }));
    const gems = AGES.find(a => a.id === 'gems').resources.map(r => ({ name: r.name, group: 'gem', field: resourceField(Dp, r) }));
    const bronze = AGES.find(a => a.id === 'bronze'), iron = AGES.find(a => a.id === 'iron');
    const items = [...metals, ...gems, { name: 'Bronze potential', group: 'potential', field: potentialField(Dp, bronze) }, { name: 'Ironworking potential', group: 'potential', field: potentialField(Dp, iron) }];
    const by = landmassShares(Dp, items.map(it => it.field));
    // (each landmass's rocks by family, from the rocks' picture)
    const fam = L.list.map(() => ({})), famAll = L.list.map(() => 0), kept = new Int32Array(Dp.w * Dp.h).fill(-1);
    for (let j = 0; j < K; j++) kept[Dp.cells[j]] = j;
    for (let y = 0; y < G.h; y += 2) {
        const la = 90 - (y + 0.5) / G.h * 180, gy = Math.min(Dp.h - 1, Math.floor((90 - la) / Dp.step)), a = Math.cos(la * Math.PI / 180);
        for (let x = 0; x < G.w; x += 2) {
            const r = G.rock[y * G.w + x];
            if (!r) continue;
            const j = kept[gy * Dp.w + Math.min(Dp.w - 1, Math.floor(((x + 0.5) / G.w * 360) / Dp.step))], id = j >= 0 ? L.of[j] : -1;
            if (id < 0) continue;
            const f = ROCK_INFO[r].family === 'loose' ? 'sedimentary' : ROCK_INFO[r].family;
            fam[id][f] = (fam[id][f] ?? 0) + a; famAll[id] += a;
        }
    }
    const lines = [`# Resource atlas — seed ${seed}, ${Math.round(time)} Myr`, '',
        `World Orogen · Evolution. Every landmass's resources, moderate or rich as a share of its land, and its richest districts: where each came from, read off the planet's history. Grades: poor ●○○, moderate ●●○, rich ●●●.`, ''];
    const world = L.list.reduce((s, l) => s + l.km2, 0);
    lines.push(`The land: ${fmtKm2(world)} in ${L.list.length.toLocaleString()} landmasses and islands.`, '');
    // (the world's richest districts of the scarce and the precious)
    lines.push('## The world\'s richest', '');
    for (const name of ['Copper', 'Tin', 'Gold', 'Silver', 'Diamonds', 'Oil and gas', 'Rubies and sapphires', 'Emeralds']) {
        const top = rows.filter(r => r.resource === name).slice(0, 2);
        for (const r of top) lines.push(`- **${r.resource}** ${dots(r.grade)} — ${r.kind ? `${r.kind.toLowerCase()}, ` : ''}~${fmtKm2(r.areaKm2)} on ${r.landmass}, ${latLon(r.lat, r.lon)}. ${r.story}.`);
    }
    lines.push('');
    for (const [id, l] of L.list.entries()) {
        if (l.km2 < 150e3 && id >= 3) break;
        const s = by[id], share = f => (s.by[3 * f + 1] + s.by[3 * f + 2]) / s.km2, any = f => (s.by[3 * f] + s.by[3 * f + 1] + s.by[3 * f + 2]) / s.km2;
        // (diamonds with the gems, not the metals)
        const list = group => items.map((it, f) => [it, f]).filter(([it]) => it.group === group && it.name !== 'Wood' && !(group === 'metal' && it.name === 'Diamonds')).map(([it, f]) => [it.name, share(f), any(f)]);
        const has = arr => arr.filter(([, x]) => x >= 0.0005).sort((a, b) => b[1] - a[1]).map(([nm, x]) => `${nm.toLowerCase()} ${pct(x)}`).join(' · ') || 'none moderate or rich';
        const none = arr => arr.filter(([, , a]) => a === 0).map(([nm]) => nm.toLowerCase());
        const F = fam[id], T = famAll[id] || 1;
        lines.push(`## ${cap(landmassName(L, id))} — ${fmtKm2(l.km2)}, centred ${latLon(l.lat, l.lon)}`, '');
        lines.push(`- **Rocks**: sediment and sedimentary ${pct((F.sedimentary ?? 0) / T)} · metamorphic ${pct((F.metamorphic ?? 0) / T)} · plutonic ${pct((F.plutonic ?? 0) / T)} · volcanic ${pct((F.volcanic ?? 0) / T)}`);
        lines.push(`- **Metals**: ${has(list('metal'))}${none(list('metal')).length ? ` — none of: ${none(list('metal')).join(', ')}` : ''}`);
        lines.push(`- **Fuel**: ${has(list('fuel'))}`);
        lines.push(`- **Gems**: ${has(list('gem'))}`);
        lines.push(`- **Bronze** could be made on ${pct(any(items.length - 2))} of it; **iron** worked on ${pct(any(items.length - 1))}`);
        const mine = rows.filter(r => r.landmassId === id && r.grade !== 'poor').sort((a, b) => b.richness * Math.sqrt(b.areaKm2) - a.richness * Math.sqrt(a.areaKm2));
        // (its richest districts: each resource's best few, no more than a dozen in all)
        const seen = {}, pickd = [];
        for (const r of mine) { if ((seen[r.resource] = (seen[r.resource] ?? 0) + 1) <= 2 && pickd.length < 12) pickd.push(r); }
        if (pickd.length) {
            lines.push('', '**Its richest districts**', '');
            for (const r of pickd) lines.push(`- ${r.resource} ${dots(r.grade)} — ${r.kind ? `${r.kind.toLowerCase()}, ` : ''}~${fmtKm2(r.areaKm2)}, ${latLon(r.lat, r.lon)} (${rankWords(r.rank, r.of)} on the world). ${r.story}.`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
const cap = t => t[0].toUpperCase() + t.slice(1);
const dots = g => (g === 'rich' ? '●●●' : g === 'moderate' ? '●●○' : '●○○');
const latLon = (la, lo) => `${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'W'}`;

/** A text file's Blob. */
export const textBlob = (text, type = 'text/plain') => new Blob([text], { type: `${type};charset=utf-8` });

