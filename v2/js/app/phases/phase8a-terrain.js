// Lab phase 8a — the tectonic surface: heights built from the history's records, before rivers carve them — and the
// machinery of every terrain phase (terrainPhase): 8b (phase8b-rivers.js) is the same surface, carved by rivers.
// Drawn on a terrain mesh finer than the sim mesh (160K / 640K / 2.5M cells), shaded so ridges read at planet scale.
// The history runs in a worker (the page stays responsive, and shows how far it has got); terrain is built on a pool
// of workers (terrain/terrain-pool.js) for whichever frame is shown — prepare(frame), awaited by the shell — and then,
// while the page is idle, for the frames next to it ahead of time (heights only, within a memory budget), so playing and
// scrubbing near it need no building. Built terrain outlives a rebuild of the phase: a display-only setting re-shades it.
// Without workers (Node: the check scripts) everything runs right here, with the same results.

import { TERRAIN_SCENES } from '../../tectonics/scenarios/terrain-scenes.js';
import { CrustType } from '../../tectonics/model/crust.js';
import { terrainMeshAsync, sampleOnto } from '../../terrain/terrain-mesh.js';
import { TerrainPool } from '../../terrain/terrain-pool.js';
import { runHistory } from '../history-runner.js';
import { synthesizeTerrain, hypsometry } from '../../terrain/synthesize.js';
import { terrainConfig } from '../../terrain/terrain-config.js';
import { kindType, deriveRecords } from '../../terrain/records.js';
import { locate } from '../../core/mesh-locate.js';
import { hillshade, paintRelief, tintOf } from '../../view/terrain-shade.js';
import { colorByCrustType, colorByOrogeny, colorByMantleHeat, colorByFarField, OROGENY_RGB, css } from '../../view/palettes.js';
import { quatToMat3 } from '../../core/rotation.js';
import { EventKind } from '../../tectonics/model/world.js';
import { TECTONICS } from '../../tectonics/config.js';
import { flowOfCycle } from '../../tectonics/step/supercontinent.js';
import { ENDINGS, framesEnding } from '../../tectonics/ending.js';
import { describeCell, recordedFrameAt, latLonOf, orogenyLegend } from './phase-kit.js';

const RESOLUTIONS = [
    { value: '160000', label: '160K cells · 61 km (quick)' },
    { value: '640000', label: '640K cells · 30 km' },
    { value: '2500000', label: '2.5M cells · 15 km (slow)' },
];
const DEFAULT_CELLS = 640000;
// the sim mesh the history runs on (the lab shell builds it from the `sim` setting; Phase 12)
const SIM_RESOLUTIONS = [
    { value: '40000', label: '40K cells · 121 km (quick)' },
    { value: '80000', label: '80K cells · 86 km' },
    { value: '160000', label: '160K cells · 61 km (slow)' },
];
// display settings (no re-synthesis) and terrain constants (terrain-config.js) the lab can change
const VIEW_TUNABLES = [
    { id: 'exaggeration', label: 'Hillshade: slope exaggeration (display only)', min: 5, max: 60, step: 5, value: 20 },
    { id: 'seaLevelKm', label: 'Sea level', min: -0.6, max: 0.6, step: 0.05, unit: ' km', value: 0 },
];
const TERRAIN_TUNABLES = [
    { id: 'stripeShare', label: 'Parallel ridges: share of the belt’s own uplift', min: 0, max: 0.5, step: 0.02 },
    { id: 'stripeCarry', label: 'Parallel ridges: 1 = carried from the raster corners (quicker, the default), 0 = every kernel', min: 0, max: 1, step: 1 },
    { id: 'ridgeNoiseShare', label: 'Ridge noise along the ranges: share of the belt’s uplift', min: 0, max: 0.5, step: 0.02 },
    { id: 'ridgeNoiseStretch', label: 'Ridge noise: times longer along the range than across', min: 1, max: 16, step: 1 },
    { id: 'cratonCharacter', label: 'Cratons: how strongly their basins and swells show', min: 0, max: 2, step: 0.1 },
    { id: 'detailRenewMyr', label: 'Fine detail slowly renews over (0 = frozen on the crust)', min: 0, max: 500, step: 10, unit: ' Myr' },
    { id: 'baseReliefKm', label: 'Swells of the first continents (re-runs the history)', min: 0, max: 2, step: 0.1, unit: ' km', evolves: true },
    { id: 'lipWearKmPerMyr', label: 'Flood basalts wear down (re-runs the history)', min: 0, max: 0.02, step: 0.001, unit: ' km/Myr', evolves: true },
    { id: 'dykeKm', label: 'Radiating dykes around flood basalts: height of their grain', min: 0, max: 0.3, step: 0.01, unit: ' km' },
    { id: 'reliefTauMyr', label: 'Uplift wears away over (re-runs the history)', min: 30, max: 400, step: 1, unit: ' Myr', evolves: true },
    { id: 'thickTauMyr', label: 'A thickened root rebounds away over (re-runs the history)', min: 30, max: 400, step: 1, unit: ' Myr', evolves: true },
    { id: 'ruggedTauMyr', label: 'Crests and ridges wear away over (re-runs the history)', min: 50, max: 800, step: 1, unit: ' Myr', evolves: true },
    { id: 'coastNoiseKm', label: 'Coastline irregularity', min: 0, max: 120, step: 5, unit: ' km' },
    { id: 'rainErosionExponent', label: 'Erosion follows rainfall by latitude, 0 = everywhere alike (re-runs the history)', min: 0, max: 1.5, step: 0.1, evolves: true },
];
const CHECKLISTS = {
    andes: [
        'Along the leading (western) coast, from the sea inland: a trench with a low outer rise beyond it, a narrow shelf, a coastal range, a valley behind it, then the main range with volcanoes — the highest ground — and further inland fold ridges running PARALLEL to the coast (Ridges only layer; Belts layer shows the ridge directions).',
        'The trailing coast behind has a wide shelf and a low coastal plain. Use the Cross-section tool across the margin to see the profile.',
    ],
    laramide: ['The belt reaches far inland: a high interior with blocky ranges and a front range bracketing it on the inland side, and no volcanoes over the flat slab.'],
    india: [
        'Across the suture (Cross-section tool, drawn from India into Asia): India’s lowland, a foreland basin, fold hills, the highest range just off the suture; then on Asia’s side a plateau with low internal ridges, a back range, and a fall line to the lowland beyond.',
        'Heights evolve: the plates welded near 48 Myr and the belt has worn in the tropics since — scrub back toward the weld to see the plateau at its highest, then watch it wear down (2–4 km by the end).',
        'Ridges run parallel to the suture on both sides.',
        'India’s craton: the belt’s foothills ride onto its rim, and its small scraps inside the ranges are part of the range, not flat holes.',
    ],
    mariana: ['A chain of small volcanic islands on a submarine ridge, the trench in front of it (7–11 km deep), a young, shallower back-arc basin behind it.'],
    japan: ['The strip that rifted off is a mountainous island arc with volcanoes; the back-arc sea behind it is young ocean floor, shallower than the old ocean.'],
    hawaii: ['Near the plume the volcanoes stand as islands; downstream they are worn down and sink with the aging floor: seamounts in a line along the plate’s motion.'],
    traps: [
        'Scrub from the eruption (12 Myr) on: a province is a plateau with a ragged, lobed edge; the carving (8b) cuts it up with time — an escarpment retreating from its edge, valleys widening along its rivers, flat-topped hills left on the divides, then remnants.',
        'Hillshade: around the province, and on it where it has worn away, a faint grain of dykes radiating from the plume’s centre, out to about twice the province’s radius.',
    ],
    cratons: [
        'India (the lower plate): the range’s foothills ride a little way onto its shield’s rim (Crust type layer: where the craton is), then a lowland runs along the front, slightly below the shield beyond; the front follows the shield’s large shape, never the sim’s cells.',
        'Asia (the upper plate): the plateau reaches Asia’s shield and its back meets it in a steep front, with no lowland before it (the Longmen Shan against the Sichuan Basin).',
        'The two shields differ (a sag basin, a swell or a flat shield, with a faint grain of domes and keels); the “Cratons” slider sets how strongly — at 0 both are flat.',
    ],
    rift: ['The new coasts are lifted into shoulders — an escarpment facing the young ocean, sloping gently inland. The arm that failed is a low corridor into the continent. The young ocean has a ridge along its middle.'],
    history: [
        'Young belts stand high and sharp; old belts are low but keep their grain of parallel ridges; cratons are calm and low; about half the land is lowland.',
        'Cratons against the ranges (Phase 10; the Crust type layer shows where the cratons are): a range pressed against a craton follows the craton’s large shape but never its sim cells’ staircase; its foothills ride a little way onto the shield, then a lowland — slightly below the shield beyond — runs along the front; where a plateau’s back meets a craton the front stays steep.',
        'Cratons differ: some are a shallow basin (a low interior plain), some a broad swell (a high shield), some flat — with a faint grain of domes and keels (the “Cratons” slider sets how strongly). No flat, stair-edged holes where a scrap of craton sits inside a range.',
        'Ridges only layer: besides the parallel ridges, long highs and lows drawn out along every range (ridge noise), bending with the belt’s front.',
        'Go back to the start: the first continents have broad swells with lowlands between them; the rivers gather in the lowlands, and the swells wear down as the history runs.',
        'Heights accumulate: where a new belt overprints an old one the old relief is not erased, and a belt that drifted through the wet tropics is lower than one of the same age at the dry subtropics (Erosion rate layer).',
        'Passive margins have wide shelves, active margins narrow ones; mid-ocean ridges stand ~2.5 km deep, old floor 5–6 km, trenches deeper still.',
        'Switch the terrain resolution: the same planet at every resolution — only finer detail (the parallel ridges appear from 640K up).',
        'Scrub through the history: a drifting continent carries its fine detail with it — its coastline, its shelves, the edges of its belts, its ridges, its volcanoes, the grain of its plains — changing only where the history changes it (Phase 9: the terrain is read on each plate’s own crust), and, slowly, as its fine detail renews: over a few hundred Myr its bays and headlands and the grain of its ridges re-form (the “Fine detail slowly renews” slider; 0 freezes it).',
        'End as (settings): the planet can end as a supercontinent, one breaking up, or continents dispersed — the history runs on past 600 Myr until it is (the chart and the Mantle layer show the supercontinent cycle; see the 1200 Myr scene).',
    ],
    cycle: [
        'The chart (Phase 13): the largest landmass starts at 100 % of the continental crust (the supercontinent); it breaks up in a BURST — several rift ticks close together at the foot of the chart — and falls to ~30–45 % as the pieces drift apart; rifting then quiets.',
        'The pieces stay apart for a long while (no landmass over ~60 % for more than a moment), then, from ~450–600 Myr, gather (markers: “gathering here”) into a new supercontinent around 600–750 Myr — ONE mass, not continents strung together by strips (the chart counts land joined only by a neck under 800 km as apart). It holds ~100–200 Myr, then breaks up in its turn.',
        'Mantle layer: warm colours where continents have sat (the heat they kept in); arrows show the mantle’s flow dragging on continents — outward from the upwelling (under the last supercontinent) while the heat there lasts, and toward the downwelling ~90° away, where the next one gathers (markers). The chart’s red line is that heat: it rises under an assembled supercontinent, and the burst comes as it peaks.',
        'The new supercontinent forms around the downwelling marker, not on top of the old one; when it has formed the markers move — its centre is the next upwelling.',
        'The reassembled supercontinent is compact (not a ring or a snake) and holds no big sea sealed inside it.',
        'Rifts follow old sutures and belts about half the time (Belts layer): the next breakup reopens some old seams and cuts new ones.',
        'End as (settings): pick “A supercontinent”, “A supercontinent breaking up” or “Continents dispersed” — the history runs on past 1200 Myr until the world is in that stage, stops there and shows the end (the hint under the table says when; the chart shows the stage). The history is the same one, only cut elsewhere: an ending it has already run past comes at once.',
    ],
};

// ── the supercontinent cycle (Phase 13) ──
const UP_CSS = '#ff7b54', DOWN_CSS = '#4cc9f0', FLOW_CSS = '#c77dff';

/**
 * For a history whose frames carry the supercontinent cycle (frame.cycle): the chart — the largest landmass's share of
 * the continental crust, how many landmasses, the heat still under the last supercontinent, a tick per rift — the
 * upwelling and downwelling as markers, and their legend. null for a history without one (a scene with the rules off).
 */
function cycleView(frames) {
    if (!frames.some(f => f.cycle?.up)) return null;
    const rifts = frames.at(-1).events.filter(e => e.kind === EventKind.RIFT).map(e => e.time);
    return {
        series: [
            { name: 'largest landmass (% of continental crust; land joined only by a neck under 800 km counts apart)', color: '#e9c46a', points: frames.map(f => [f.time, 100 * (f.cycle?.share ?? 0)]) },
            { name: 'landmasses over 1 Mkm² (× 10)', color: '#8ecae6', points: frames.map(f => [f.time, 10 * (f.cycle?.landmasses ?? 0)]) },
            { name: 'mantle heat under the last supercontinent (%)', color: UP_CSS, points: frames.map(f => [f.time, 100 * (f.cycle?.upHeat ?? 0)]) },
            { name: 'a rift', color: '#ff9f43', ticks: rifts },
        ],
        markers(frame) {
            const c = frame.cycle;
            const phase = { assembled: 'a supercontinent', dispersing: 'dispersing', gathering: 'gathering' }[c?.phase] ?? '';
            return c?.up ? [{ xyz: c.up, label: `upwelling${phase ? ` · ${phase}` : ''}`, color: UP_CSS }, { xyz: c.down, label: c.phase === 'gathering' ? 'downwelling · gathering here' : 'downwelling', color: DOWN_CSS }] : [];
        },
        legend: [
            { color: FLOW_CSS, label: 'mantle flow: out from the upwelling under the last supercontinent (as strong as the heat left there); while the pieces gather, toward the downwelling where the next forms; then holding it together until it rifts (Mantle layer: arrows; colours: the mantle’s heat, warm where continents have sat). While they disperse the continents are also kept apart (not drawn)' },
            { color: UP_CSS, label: 'upwelling — the last supercontinent’s centre (markers)' },
            { color: DOWN_CSS, label: 'downwelling, ~90° from it (markers)' },
        ],
    };
}

/**
 * The mantle flow as arrows on a 12° grid (the Mantle layer's overlay): where it drags on continents' roots. Scaled to
 * the frame's strongest, so the pattern reads even while the flow is weak (how strong it is: the chart's heat line).
 */
function drawMantleFlow(g, raster, frame) {
    const c = frame.cycle;
    if (!c?.up) return;
    const cfg = TECTONICS, STEP = 12, PX = 30, arrows = [];
    let most = 0;
    for (let lat = -84; lat <= 84; lat += STEP) {
        const cl = Math.cos(lat * Math.PI / 180), sl = Math.sin(lat * Math.PI / 180), lonStep = STEP / Math.max(0.25, cl);
        for (let lon = -180; lon < 180; lon += lonStep) {
            const lam = lon * Math.PI / 180, x = cl * Math.cos(lam), y = cl * Math.sin(lam), z = sl, f = flowOfCycle(c, cfg, x, y, z, [0, 0, 0]);
            const east = -Math.sin(lam) * f[0] + Math.cos(lam) * f[1], north = -sl * Math.cos(lam) * f[0] - sl * Math.sin(lam) * f[1] + cl * f[2];
            const size = Math.hypot(east, north);
            most = Math.max(most, size);
            arrows.push({ x, y, z, cl, east, north, size });
        }
    }
    if (!(most > 0)) return;
    g.save(); g.lineCap = 'round';
    for (const { x, y, z, cl, east, north, size } of arrows) {
        if (size < 0.08 * most) continue;
        const [px, py] = raster.project(x, y, z), k = PX / most, x1 = px + east * k / Math.max(0.2, cl), y1 = py - north * k;
        if (Math.abs(x1 - px) > raster.width / 2) continue;
        const a = Math.atan2(y1 - py, x1 - px), h = 7;
        for (const [style, width] of [['rgba(0,0,0,0.75)', 5], [FLOW_CSS, 2.5]]) {
            g.strokeStyle = style; g.lineWidth = width; g.beginPath();
            g.moveTo(px, py); g.lineTo(x1, y1);
            g.lineTo(x1 - h * Math.cos(a - 0.5), y1 - h * Math.sin(a - 0.5)); g.moveTo(x1, y1); g.lineTo(x1 - h * Math.cos(a + 0.5), y1 - h * Math.sin(a + 0.5));
            g.stroke();
        }
    }
    g.restore();
}

/** Colour of an erosion factor: brown where things erode slowly, through pale, to blue where fast. */
function erosionRgb(e) {
    const t = Math.max(0, Math.min(1, (e - 0.8) / 1.0));
    return t < 0.25 ? [176, 134, 84].map((c, i) => c + ([226, 220, 196][i] - c) * t / 0.25) : [226, 220, 196].map((c, i) => c + ([46, 104, 196][i] - c) * (t - 0.25) / 0.75);
}

// The last history simulated (per scene and seed), so changing a terrain setting does not re-run it.
let simCache = null;
// One worker pool for the page, for one sim mesh (browser only: in Node the checks synthesize in place)
let poolPromise = null, poolMesh = null;
const usePool = typeof window !== 'undefined' && typeof Worker !== 'undefined';
// Terrain built so far, for one history, resolution and set of terrain settings — kept across rebuilds of the phase:
// every frame's heights (16-bit metres), within BUDGET bytes, and the full result (components, records) of the last few
let store = null;
let prefetchToken = 0;             // (a rebuilt phase takes over the building ahead)
const smallDevice = typeof navigator !== 'undefined' && ((navigator.deviceMemory ?? 8) <= 4 || !!globalThis.matchMedia?.('(pointer: coarse)').matches);
const BUDGET = smallDevice ? 64e6 : 320e6;
// how many frames are built ahead: those this near the frame on screen, the way it is moving (half as many behind it) —
// not the whole history: building every frame kept every core busy for minutes after each change (developer: the fans)
const AHEAD = 10;

/** Phase 8a: the tectonic surface. */
export const createPhase = terrainPhase({
    id: '8a',
    title: 'Phase 8a — Tectonic surface',
    summary: 'Heights built during the history and eroded as it runs (by the rainfall of the latitude each piece of crust was at), drawn before rivers carve them (Phase 8b): the sea floor from crust age, with trenches and abyssal hills; continents on an isostatic platform with shelves by kind of margin; and mountain belts laid out across their width by kind of belt and side of the collision — crests, valleys, plateaus and basins where WBP’s range geometries put them — with ridges running parallel to each belt’s front, in staggered segments where the plates met obliquely. Drawn on a terrain mesh finer than the sim mesh, the same planet at any resolution. ',
    checklists: CHECKLISTS,
    checkCommand: 'node v2/tools/check-phase8a.mjs',
    lowlandNote: 'of land below 400 m (Earth ≈ half; rivers lower it in 8b)',
});

/**
 * A terrain lab phase: the history (in a worker), and terrain for its frames on a pool of workers, built ahead.
 * spec: { id, title, summary, checklists (per scene), checkCommand, lowlandNote, carve?: rivers carve the surface,
 * tunables?: extra terrain constants, extraLayers?: (ctx) => layers, extraLegend?: [] }
 */
export function terrainPhase(spec) {
    return async function createPhase(simMesh, seed, overrides = {}, hooks = {}) {
    const scene = TERRAIN_SCENES.find(s => s.id === overrides.scene) ?? TERRAIN_SCENES[0];
    const TUNABLES = [...TERRAIN_TUNABLES, ...(spec.tunables ?? [])], carve = !!spec.carve;
    const cells = RESOLUTIONS.some(r => Number(r.value) === Number(overrides.cells)) ? Number(overrides.cells) : DEFAULT_CELLS;
    const snapshotMyr = scene.maxMyr > 200 ? 10 : 2;
    // the height constants the history evolves its heights with (the history itself is the same whatever they are)
    const heights = Object.fromEntries(TUNABLES.filter(t => t.evolves && overrides[t.id] !== undefined).map(t => [t.id, overrides[t.id]]));
    const key = `${scene.id}|${seed}|${simMesh.numCells}|${JSON.stringify(heights)}`;
    const meshReady = terrainMeshAsync(cells);                 // (built in a worker, alongside the history)
    // a whole planet's history may be asked to end in a stage of the supercontinent cycle (tectonics/ending.js): it runs
    // on past its length until it is. The history is the same whatever its ending — an ending only says where it stops —
    // so the frames of a run that went further already hold it: they are cut, not run again
    const ending = scene.endings && ENDINGS.some(e => e.id === overrides.ending) ? overrides.ending : 'none';
    let frames = simCache?.key === key ? framesEnding(simCache.frames, scene.maxMyr, ending, TECTONICS, simCache.complete) : null;
    if (!frames) {
        const started = performance.now(), label = ENDINGS.find(e => e.id === ending).phrase;
        const run = await runHistory({ list: 'terrain', scene, heights, ending }, simMesh, seed, snapshotMyr,
            t => hooks.progress?.(t <= scene.maxMyr ? `Simulating the history… ${t.toFixed(0)} of ${scene.maxMyr} Myr` : `Running on until it ends as ${label}… ${t.toFixed(0)} Myr`));
        // (keep the longer of the two runs: it holds the other's endings too)
        if (simCache?.key !== key || run.frames.at(-1).time >= simCache.frames.at(-1).time) simCache = { key, frames: run.frames, steps: run.steps, complete: run.complete, simMs: performance.now() - started };
        frames = framesEnding(run.frames, scene.maxMyr, ending, TECTONICS, true);
    }
    hooks.progress?.('Building terrain…');
    const { steps, simMs } = simCache, endMyr = frames.at(-1).time;
    const reached = ending === 'none' || framesEnding(frames, scene.maxMyr, ending, TECTONICS) !== null;
    const view = Object.fromEntries(VIEW_TUNABLES.map(t => [t.id, overrides[t.id] ?? t.value]));
    const cfgOverrides = Object.fromEntries(TUNABLES.filter(t => overrides[t.id] !== undefined).map(t => [t.id, overrides[t.id]]));
    const cfg = terrainConfig(cfgOverrides);
    const tMesh = await meshReady;

    // ── terrain per frame ── The frame the shell asks for is built on the pool (prepare); then, while the page is idle,
    // the frames near it (AHEAD), nearest first — heights only — as far as the budget allows. The store outlives this phase object: a
    // display-only setting (sea level, hillshade) makes a new phase that finds everything built and only re-shades.
    // (a carving phase shows a frame's surface at once and its carved terrain when that is ready; it keeps only
    // carved heights for the frames built ahead)
    const storeKey = `${spec.id}|${key}|${cells}|${JSON.stringify(cfgOverrides)}`;
    if (store?.key !== storeKey) store = { key: storeKey, sampler: null, full: new Map(), heights: new Map(), bytes: 0, carving: new Map() };
    const S = store, shown = new Map(), token = ++prefetchToken, index = new Map(frames.map((f, i) => [f, i]));
    let current = frames.length - 1, heading = 0, poolReady = null, prefetching = false;
    // the frame on screen, and which way the shown frames have been moving (playing: forward)
    const showing = frame => { const i = index.get(frame); if (i === undefined || i === current) return; heading = Math.sign(i - current); current = i; };
    // how far a frame is from the one on screen, for building ahead and for keeping within the budget: frames the way
    // the shown frames are moving count as nearer (twice as near as those behind)
    const distance = i => Math.abs(i - current) * (heading && Math.sign(i - current) === -heading ? 2 : 1);
    // a frame ready to paint: its heights, shaded for this view (on the pool's shading worker, where there is one); its
    // components (Ridges only) as its build has them; its hypsometry, land-height tally and records only when something
    // asks for them
    const shading = { exaggeration: view.exaggeration, seaLevelKm: view.seaLevelKm };
    const keep = (frame, r, shade = hillshade(tMesh, r.heightKm, shading)) => {
        let rec = r.rec ?? null, hyps = null;
        const out = { src: r, heightKm: r.heightKm, get parts() { return r.parts ?? null; }, sampler: r.sampler ?? S.sampler, ms: r.ms, kernels: r.kernels, volcanoes: r.volcanoes,
            tectonicKm: r.tectonicKm ?? null, drainage: r.drainage ?? null, carved: !carve || r.carved !== false, tally: null,
            shade, get hyps() { return hyps ??= hypsometry(r.heightKm, view.seaLevelKm); }, get rec() { return rec ??= deriveRecords(frame, simMesh, cfg, seed); } };
        shown.set(frame, out);
        if (shown.size > 4) shown.delete(shown.keys().next().value);
        return out;
    };
    const storeHeights = (frame, r) => {
        if (S.heights.has(frame)) return;
        const q = new Int16Array(r.heightKm.length);
        for (let i = 0; i < q.length; i++) q[i] = Math.round(r.heightKm[i] * 1000);
        S.heights.set(frame, { q, ms: r.ms, kernels: r.kernels, volcanoes: r.volcanoes });
        S.bytes += q.byteLength;
        // over budget: drop the frames farthest from the one on screen
        while (S.bytes > BUDGET && S.heights.size > 1) {
            let far = null, d = -1;
            for (const g of S.heights.keys()) { const dd = distance(index.get(g) ?? 0); if (dd > d) { d = dd; far = g; } }
            S.bytes -= S.heights.get(far).q.byteLength; S.heights.delete(far);
        }
    };
    const remember = (frame, r) => {
        S.sampler ??= r.sampler;
        S.full.set(frame, r);
        if (S.full.size > 4) S.full.delete(S.full.keys().next().value);
        if (r.carved !== false) storeHeights(frame, r);
    };
    const fromHeights = frame => {
        const s = S.heights.get(frame);
        if (!s) return null;
        const heightKm = new Float32Array(s.q.length);
        for (let i = 0; i < heightKm.length; i++) heightKm[i] = s.q[i] / 1000;
        return { heightKm, parts: null, rec: null, sampler: S.sampler, ms: s.ms, kernels: s.kernels, volcanoes: s.volcanoes };
    };
    // shown already, from its full build — or from its stored heights, if it has no full build (yet, or any more)
    const fresh = frame => { const s = shown.get(frame), full = S.full.get(frame); return !!s && (!full || s.src === full); };
    function terrainOf(frame) {
        showing(frame);
        if (fresh(frame)) return shown.get(frame);
        const r = S.full.get(frame) ?? fromHeights(frame);
        if (r) { if (poolReady) prefetch(poolReady); return keep(frame, r); }
        S.sampler ??= sampleOnto(simMesh, tMesh, cfg, seed);                // (in place: Node, or a layer that asked before prepare)
        const T = synthesizeTerrain(frame, simMesh, tMesh, { cfg, seed, sampler: S.sampler, parts: true, carve });
        remember(frame, T);
        return keep(frame, T);
    }
    // built: heights for most layers; the components too for a layer that needs them (Ridges only); the carving too for
    // one that shows it (Carving depth, Drainage, the surface before carving). Ready to paint: built, and shaded.
    const built = (frame, layer) => layer?.needsCarving ? !!S.full.get(frame)?.drainage
        : layer?.needsParts ? !!S.full.get(frame)?.parts : S.full.has(frame) || S.heights.has(frame);
    const isReady = (frame, layer) => !usePool || (built(frame, layer) && fresh(frame));
    async function prepare(frame, layer) {
        showing(frame);
        if (!usePool) return;
        if (poolMesh !== simMesh) {                       // (another sim resolution: the pool holds the old mesh)
            const old = poolPromise;
            poolMesh = simMesh; poolPromise = TerrainPool.create(simMesh);
            old?.then(p => p.terminate());
        }
        const pool = poolReady ??= await poolPromise;
        if (!built(frame, layer)) {
            // the surface — all on the pool: the page's thread only gathers the heights (and the components, for a layer
            // that shows them; the records are derived when a layer asks for them)
            const full = S.full.get(frame), wantParts = !!layer?.needsParts;
            const surf = full && !(wantParts && !full.parts) ? full
                : await pool.synthesize(frame, tMesh, { cfg, seed, parts: wantParts, records: false, carveInputs: carve && !full });
            if (full && surf !== full) full.parts = surf.parts;           // (the components, for a frame built without them)
            else if (!carve) remember(frame, surf);
            else {
                // a carving phase shows the surface until its carving is ready (on the carving worker)
                if (!full) remember(frame, { ...surf, tectonicKm: surf.heightKm, carved: false });
                const carving = carveShown(pool, frame, surf);
                if (layer?.needsCarving) await carving;
            }
        }
        // shaded on the pool, not here (a frame built meanwhile — carved, say — is shaded on the next call)
        const r = fresh(frame) ? null : S.full.get(frame) ?? fromHeights(frame);
        if (r) keep(frame, r, await pool.shade(tMesh, r.heightKm, shading));
        prefetch(pool);
    }
    // carve the frame on screen, and paint it again when done
    function carveShown(pool, frame, surf) {
        if (S.full.get(frame)?.drainage) return Promise.resolve();
        if (S.carving.has(frame)) return S.carving.get(frame);
        const job = pool.carve(tMesh, surf, cfg).then(C => {
            if (store !== S) return;
            remember(frame, { ...surf, parts: S.full.get(frame)?.parts ?? surf.parts, heightKm: C.z, tectonicKm: surf.heightKm, drainage: C.area, carved: true, ms: { ...surf.ms, carve: C.ms } });
            shown.delete(frame);
            hooks.repaint?.();
        }).finally(() => S.carving.delete(frame));
        S.carving.set(frame, job);
        return job;
    }
    // building ahead, one frame at a time (a frame the shell asks for waits at most for the one in hand): the nearest to
    // the frame on screen that is not built yet, within AHEAD of it and among as many as the budget holds
    async function prefetch(pool) {
        if (prefetching) return;
        prefetching = true;
        let carvingAhead = null;
        try {
            for (;;) {
                if (token !== prefetchToken || store !== S) return;                  // (the phase was rebuilt: its successor carries on)
                const room = Math.max(4, Math.floor(BUDGET / (2 * tMesh.numCells)));
                const next = frames.map((_, i) => i).filter(i => distance(i) <= AHEAD).sort((a, b) => distance(a) - distance(b) || a - b)
                    .slice(0, room).find(i => !S.heights.has(frames[i]) && !S.carving.has(frames[i]));
                if (next === undefined) break;
                const frame = frames[next];
                const r = await pool.synthesize(frame, tMesh, { cfg, seed, parts: false, records: false, carveInputs: carve });
                if (token !== prefetchToken || store !== S) return;
                S.sampler ??= r.sampler;
                if (!carve) { storeHeights(frame, r); continue; }
                // (carved on the carving worker while the next frame's surface is built)
                await carvingAhead;
                if (token !== prefetchToken || store !== S) return;
                carvingAhead = pool.carve(tMesh, r, cfg).then(C => { if (store === S) storeHeights(frame, { ...r, heightKm: C.z }); })
                    .catch(() => {}).finally(() => S.carving.delete(frame));
                S.carving.set(frame, carvingAhead);
            }
            await carvingAhead;
        } catch { /* building ahead is only a convenience: frames are built when asked for */ } finally { prefetching = false; }
    }
    // a sim-cell layer (crust type, orogeny) carried onto the terrain mesh, shaded by the relief
    const simRgb = new Uint8Array(simMesh.numCells * 3);
    const simLayer = paintSim => (frame, out) => {
        const T = terrainOf(frame), { cells: sc, weights: sw } = T.sampler;
        paintSim(frame, simRgb);
        for (let t = 0; t < tMesh.numCells; t++) {
            const k = 0.45 + 0.55 * T.shade[t];
            for (let ch = 0; ch < 3; ch++) out[3 * t + ch] = Math.min(255, k * (sw[3 * t] * simRgb[3 * sc[3 * t] + ch] + sw[3 * t + 1] * simRgb[3 * sc[3 * t + 1] + ch] + sw[3 * t + 2] * simRgb[3 * sc[3 * t + 2] + ch]));
        }
    };

    // the supercontinent cycle (Phase 13), in a history that has one: a chart through time, and the mantle as a layer
    const cycle = cycleView(frames);

    const layers = [
        { label: 'Terrain', paint(frame, out) { const T = terrainOf(frame); paintRelief(T.heightKm, T.shade, out, { seaLevelKm: view.seaLevelKm }); } },
        { label: 'Hillshade', paint(frame, out) { const T = terrainOf(frame); paintRelief(T.heightKm, T.shade, out, { mode: 'shade' }); } },
        {
            label: 'Belts', paint: simLayer(colorByOrogeny),
            // ridge directions: a tick along the strike at every belt cell, as the stripes are laid out
            overlay(g, raster, frame) {
                const { rec } = terrainOf(frame), { xyz } = simMesh, L = 55 / 6371;
                g.save(); g.lineWidth = 1.6;
                for (let w = 0; w < simMesh.numCells; w++) {
                    const ax = rec.across[3 * w], ay = rec.across[3 * w + 1], az = rec.across[3 * w + 2];
                    if (!rec.kind[w] || !(ax || ay || az) || rec.reliefKm[w] < 0.05) continue;
                    const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
                    const sx = y * az - z * ay, sy = z * ax - x * az, sz = x * ay - y * ax;      // strike = p × across
                    const [x0, y0] = raster.project(x - L * sx, y - L * sy, z - L * sz), [x1, y1] = raster.project(x + L * sx, y + L * sy, z + L * sz);
                    if (Math.abs(x1 - x0) > raster.width / 2) continue;
                    g.strokeStyle = '#101010';
                    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
                }
                g.restore();
            },
        },
        {
            label: 'Ridges only', needsParts: true, paint(frame, out) {
                const T = terrainOf(frame), s = T.parts.stripes;
                for (let t = 0; t < tMesh.numCells; t++) {
                    const v = Math.max(-1, Math.min(1, s[t] / 0.5)), k = 0.55 + 0.45 * T.shade[t];
                    out[3 * t] = Math.min(255, k * (v > 0 ? 255 : 255 * (1 + v))); out[3 * t + 1] = Math.min(255, k * 255 * (1 - Math.abs(v))); out[3 * t + 2] = Math.min(255, k * (v < 0 ? 255 : 255 * (1 - v)));
                }
            },
        },
        ...(spec.extraLayers?.({ terrainOf, tMesh, view }) ?? []),
        {
            // the far field (step/far-field.js): how much push distant fronts sent through each place, and the axis it was
            // squeezed along — a tick across it at every other land cell that felt any (the plate's frame turned to the world's)
            label: 'Far field', paint: simLayer(colorByFarField),
            overlay(g, raster, frame) {
                if (!frame.farDir) return;
                const { xyz } = simMesh, L = 45 / 6371, m = new Float64Array(9);
                g.save(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.85)';
                for (let w = 0; w < simMesh.numCells; w += 2) {
                    const o = frame.owner[w];
                    if (o < 0 || frame.type[w] === CrustType.OCEAN || !(frame.farWork[w] > 20)) continue;
                    const dx = frame.farDir[3 * w] / 127, dy = frame.farDir[3 * w + 1] / 127, dz = frame.farDir[3 * w + 2] / 127;
                    if (!(dx || dy || dz)) continue;
                    quatToMat3(frame.plates[o].quat, m);
                    const ax = m[0] * dx + m[1] * dy + m[2] * dz, ay = m[3] * dx + m[4] * dy + m[5] * dz, az = m[6] * dx + m[7] * dy + m[8] * dz;
                    const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
                    const [x0, y0] = raster.project(x - L * ax, y - L * ay, z - L * az), [x1, y1] = raster.project(x + L * ax, y + L * ay, z + L * az);
                    if (Math.abs(x1 - x0) > raster.width / 2) continue;
                    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
                }
                g.restore();
            },
        },
        { label: 'Crust type', paint: simLayer(colorByCrustType) },
        ...(cycle ? [{ label: 'Mantle', paint: simLayer(colorByMantleHeat), overlay: drawMantleFlow }] : []),
        {
            // how fast things erode, by the latitude's estimated rainfall (and ice, poleward): brown slow, blue fast
            label: 'Erosion rate', paint: simLayer((frame, out) => {
                const e = terrainOf(frame).rec.erosion;
                for (let w = 0; w < e.length; w++) { const c = erosionRgb(e[w]); out[3 * w] = c[0]; out[3 * w + 1] = c[1]; out[3 * w + 2] = c[2]; }
            }),
        },
    ];

    const centre = (frames[0].plates.find(p => !p.isBackground) ?? frames[0].plates[0]).centre;
    const km = v => `${Math.round(v * 1000).toLocaleString()} m`;
    return {
        title: spec.title,
        summary: spec.summary + scene.about,
        checklist: [...spec.checklists[scene.id], 'Terrain is built for the frame shown, then in the background for the next ten frames the way you are playing or scrubbing (five behind): once built, those play and scrub with no waiting, and sea level or hillshade changes only re-shade. Frames further off are built when you get near them — playing waits for a frame still being built rather than skipping past it — and the page stays responsive throughout; the computer quietens once the frames around the one shown are built.'],
        checkCommand: spec.checkCommand,
        maxTime: endMyr,
        timeStep: snapshotMyr,
        initialTime: endMyr,
        initialView: scene.focus?.(frames.at(-1), simMesh) ?? scene.view ?? latLonOf(centre),
        displayMesh: tMesh,
        params: [
            { id: 'scene', label: 'Scene', value: scene.id, options: TERRAIN_SCENES.map(s => ({ value: s.id, label: s.label })) },
            { id: 'cells', label: 'Terrain resolution', value: String(cells), options: RESOLUTIONS, keepView: true },
            { id: 'sim', label: 'Sim resolution — the plates (re-runs the history)', value: String(simMesh.numCells >= 150000 ? 160000 : simMesh.numCells >= 75000 ? 80000 : 40000), options: SIM_RESOLUTIONS, keepView: true },
            ...(scene.endings ? [{ id: 'ending', label: `End as (runs on past ${scene.maxMyr} Myr until it does)`, value: ending, options: ENDINGS.map(e => ({ value: e.id, label: e.label })), keepView: true, toEnd: true }] : []),
            ...VIEW_TUNABLES.map(t => ({ ...t, value: view[t.id] })),
            ...TUNABLES.map(t => ({ ...t, value: cfg[t.id] })),
        ],
        layers,
        hasBoundaries: false,
        legend: [
            ...[[-6, 'abyssal plain (−6 km)'], [-2.5, 'mid-ocean ridge (−2.5 km)'], [-0.1, 'continental shelf'], [0.15, 'lowland'], [1, 'upland (1 km)'], [2.5, 'mountains (2.5 km)'], [4, 'high mountains / plateau (4 km)'], [6, 'peaks (6 km)']]
                .map(([h, label]) => ({ color: css(tintOf(h)), label })),
            ...orogenyLegend(undefined, ' (Belts layer; ticks: ridge direction)'),
            ...[[0.9, 'erosion ×0.9 — dry subtropics (Erosion rate layer)'], [1.05, 'erosion ×1.05 — storm tracks, and ice toward the poles'], [1.28, 'erosion ×1.3 — the wet equator']]
                .map(([e, label]) => ({ color: css(erosionRgb(e)), label })),
            ...(spec.extraLegend ?? []),
            ...(cycle ? cycle.legend : []),
        ],
        series: cycle?.series,
        seriesUnit: cycle ? '%' : undefined,

        frameAt(t) { return recordedFrameAt(frames, t); },
        prepare,
        isReady,

        stats(frame) {
            const T = terrainOf(frame), hy = T.hyps, [, , q50, , q90, q99] = hy.landKm;
            const bins = [[-Infinity, 0.2, 'below 200 m'], [0.2, 0.4, '200–400 m'], [0.4, 1, '400 m – 1 km'], [1, 2, '1–2 km'], [2, 3, '2–3 km'], [3, 5, '3–5 km'], [5, Infinity, 'above 5 km']];
            // (one pass over the frame's heights, once: stats are asked for a few times a second while playing)
            T.tally ??= (() => {
                const h = T.heightKm, sea = view.seaLevelKm, count = bins.map(() => 0);
                let max = -Infinity, land = 0;
                for (let i = 0; i < h.length; i++) {
                    const v = h[i];
                    max = Math.max(max, v);
                    if (!(v > sea)) continue;
                    const u = v - sea; land++;
                    for (let b = 0; b < bins.length; b++) if (u >= bins[b][0] && u < bins[b][1]) { count[b]++; break; }
                }
                return { max, land, count };
            })();
            const { max, land, count } = T.tally;
            const rows = bins.map(([lo, hi, name], b) => ({ name, color: css(tintOf(Math.max(0.05, Number.isFinite(hi) ? (Math.max(0, lo) + hi) / 2 : 6))), cells: [`${(100 * count[b] / Math.max(1, land)).toFixed(1)} %`] }));
            return {
                cards: [
                    { big: `${(100 * hy.landShare).toFixed(1)} %`, small: `of the planet is land (sea level ${view.seaLevelKm >= 0 ? '+' : ''}${view.seaLevelKm} km)` },
                    { big: km(q50), small: `median land height · 90 % below ${km(q90)} · highest ${km(max - view.seaLevelKm)}` },
                    { big: `${(100 * hy.below400).toFixed(0)} %`, small: spec.lowlandNote },
                    { big: `${((T.ms.pooled ?? (T.ms.records + T.ms.surface + (T.ms.sample ?? 0))) / 1000).toFixed(2)} s`, small: `terrain at ${tMesh.numCells.toLocaleString()} cells${T.ms.workers ? ` on ${T.ms.workers} workers` : ''} · ${T.kernels.toLocaleString()} ridge kernels · ${T.volcanoes.toLocaleString()} volcanoes` + (carve ? (T.carved ? ` · rivers carved in ${((T.ms.carve ?? 0) / 1000).toFixed(2)} s` : ' · carving the rivers…') : '') },
                ],
                head: ['Land height', 'share of land'],
                rows,
                hint: `History: ${steps} steps in ${(simMs / 1000).toFixed(1)} s (kept while you change terrain settings).` + (ending === 'none' ? '' : reached
                    ? ` It ends as asked — ${ENDINGS.find(e => e.id === ending).phrase} — at ${endMyr.toFixed(0)} Myr.`
                    : ` It did not reach ${ENDINGS.find(e => e.id === ending).phrase} by ${endMyr.toFixed(0)} Myr; shown as it is there.`),
            };
        },

        markers(frame) { return cycle ? cycle.markers(frame) : []; },

        describeCell(frame, t) {
            const T = terrainOf(frame), h = T.heightKm[t] - view.seaLevelKm, w = T.sampler.cells[3 * t];
            const where = h >= 0 ? `${km(h)} above sea level` : `${km(-h)} deep`;
            return `${where} · ${describeCell(frame, w)}`;
        },

        profileAlong(frame, a, b, samples) {
            const T = terrainOf(frame), c3 = [0, 0, 0], w3 = [0, 0, 0], kms = [], heightKm = [];
            const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))), s = Math.sin(ang) || 1;
            for (let i = 0; i <= samples; i++) {
                const f = i / samples, ka = ang ? Math.sin((1 - f) * ang) / s : 1 - f, kb = ang ? Math.sin(f * ang) / s : f;
                let x = ka * a[0] + kb * b[0], y = ka * a[1] + kb * b[1], z = ka * a[2] + kb * b[2];
                const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
                locate(tMesh, x, y, z, c3, w3);
                kms.push(f * ang * 6371);
                heightKm.push(w3[0] * T.heightKm[c3[0]] + w3[1] * T.heightKm[c3[1]] + w3[2] * T.heightKm[c3[2]] - view.seaLevelKm);
            }
            return { km: kms, heightKm, note: `Terrain at ${tMesh.numCells.toLocaleString()} cells.` };
        },
    };
    };
}
