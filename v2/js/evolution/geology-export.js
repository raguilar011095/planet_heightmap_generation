// The geology's exports (plans/V2_GEOLOGY_PLAN.md G6; finished moments only, as every export): the Rocks map, the Deposits
// map as shown and each age's map — over the hillshade as on screen, with the districts' symbols — a greyscale mask per
// resource (richness 0…255, the sea black: to paint with downstream), the districts themselves as GeoJSON and CSV with
// their stories, and a resource atlas: each landmass's resources and its richest districts, in words.

import { paintFinished, rasterAt } from './finish-view.js';
import { finishedGeologyColor, subjectsOf, districtsOf, districtTale, districtSymbols, drawDistrictSymbols, gradeOf, rankWords } from './geology-view.js';
import { METALS } from '../geology/deposits.js';
import { AGES, resourceField, potentialField } from '../geology/ages.js';
import { landmasses, landmassName, landmassShares, fmtKm2 } from '../geology/districts.js';
import { ROCK_INFO } from '../geology/rocks.js';
import { encodeGrayPng, encodeRgbPng, canvasOf, canvasPng } from '../view/png.js';

const tick = () => new Promise(res => setTimeout(res, 0));

/** A geology view's map at width W, as shown: its colours over the hillshade, the lakes, and (Deposits, Ages) the symbols. */
export async function geologyMap(fin, W, layer, look, { pick = 'all', age = 'bronze', agePick = 'all' } = {}) {
    const H = W >> 1, image = new ImageData(W, H);
    paintFinished(fin.raster, { width: W, image }, look.lut, { exaggeration: look.exaggeration, lakes: true, colorAt: finishedGeologyColor(layer, null, null, W, fin, pick, age, agePick) });
    if (layer === 'geoRocks' || look.districts === false) return encodeRgbPng(W, H, image.data);
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(image, 0, 0);
    drawDistrictSymbols(ctx, W, districtSymbols(fin, layer, pick, age, agePick));
    return canvasPng(canvas);
}

/** The resources a mask is made for: every metal and fuel, and the gems. */
function maskItems(fin) {
    const Dp = fin.raster.geology.deposits, K = Dp.cells.length, SYS = Dp.rows - METALS.length, gems = AGES.find(a => a.id === 'gems');
    return [...METALS.map((m, i) => ({ id: m.id, name: m.name, offshore: m.id === 'oilGas', at: j => Dp.data[(SYS + i) * K + j] / 255 })),
        ...gems.resources.map(r => { const f = resourceField(Dp, r); return { id: r.id === 'diamonds' ? 'gem-diamonds' : r.id, name: r.name, at: j => f[j] }; })];
}
/**
 * A greyscale mask per resource (8-bit PNGs in a ZIP): its richness, 0 none … 255 the richest, smooth between the grid's
 * cells (as the map's washes); the sea black (but oil and gas on the shelf).
 */
export async function resourceMasks(fin, W, onProgress = () => {}) {
    const Dp = fin.raster.geology.deposits, H = W >> 1, { sea } = rasterAt(fin.raster, W), items = maskItems(fin), files = [], full = new Float32Array(Dp.w * Dp.h);
    // (each picture column and row's place on the grid, once)
    const gx0 = new Int32Array(W), gx1 = new Int32Array(W), fx = new Float32Array(W);
    for (let x = 0; x < W; x++) { const g = ((x + 0.5) / W * 360) / Dp.step - 0.5, x0 = Math.floor(g); fx[x] = g - x0; gx0[x] = (x0 + Dp.w) % Dp.w; gx1[x] = (x0 + 1 + Dp.w) % Dp.w; }
    for (let n = 0; n < items.length; n++) {
        const it = items[n];
        onProgress(n / items.length, `Mask: ${it.name} (${n + 1} of ${items.length})…`);
        await tick();
        full.fill(0);
        for (let j = 0; j < Dp.cells.length; j++) full[Dp.cells[j]] = it.at(j);
        const data = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            const g = Math.max(0, Math.min(Dp.h - 1, ((y + 0.5) / H * 180) / Dp.step - 0.5)), y0 = Math.floor(g), fy = g - y0, r0 = y0 * Dp.w, r1 = Math.min(Dp.h - 1, y0 + 1) * Dp.w;
            for (let x = 0; x < W; x++) {
                const p = y * W + x;
                if (sea[p] && !it.offshore) continue;
                const a = full[r0 + gx0[x]] + (full[r0 + gx1[x]] - full[r0 + gx0[x]]) * fx[x], b = full[r1 + gx0[x]] + (full[r1 + gx1[x]] - full[r1 + gx0[x]]) * fx[x];
                data[p] = Math.round(255 * Math.min(1, Math.max(0, a + (b - a) * fy)));
            }
        }
        files.push({ name: `mask-${it.id}.png`, blob: await encodeGrayPng(W, H, data, 8) });
    }
    return files;
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

