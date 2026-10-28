// Lab phase 8b — rivers carve the tectonic surface (terrain/carve.js: the stream power law solved analytically in time
// along the river network, Tzathas et al. 2024). The same machinery as 8a (terrainPhase): the history in a worker,
// the surface on a pool of workers, and every frame carved — the frame on screen first (its uncarved surface shows
// meanwhile), then the others in the background on the carving worker.

import { terrainPhase } from './phase8a-terrain.js';
import { hillshade, paintRelief } from '../../view/terrain-shade.js';
import { css } from '../../view/palettes.js';

const CHECKLISTS = {
    andes: ['Rivers cut the main range into valleys running down to both sides; the divide follows the highest crests, and the short coastal rivers are steep.', 'Before carving / Carving depth layers: where the rivers have cut, and how deep.'],
    laramide: ['The high interior is cut by valleys from its edges inward; the blocky ranges stand as divides.'],
    india: ['The plateau keeps a high, less dissected interior while rivers cut deep gorges into its edges; the foreland lowland is graded and broad.'],
    mariana: ['The volcanic islands are too small to hold big rivers: they keep their shapes; the sea floor is not carved.'],
    japan: ['The mountainous arc is cut by short, steep valleys running to both coasts.'],
    hawaii: ['The volcanic islands keep their shapes (too small for big rivers); the sea floor is not carved.'],
    traps: [
        'Rivers cut canyons into the basalt (hard caprock), and their valleys widen through it with time; the slopes are faintly benched (flow on flow — "trap" is a stair), while the unbroken plateau top stays smooth.',
        'Scrub through time: an intact plateau with canyons, then a dissected plateau — the escarpment retreating from its edge, broad valleys along its rivers — then flat-topped hills on the divides, then remnants.',
    ],
    cratons: ['A trunk river gathers in the lowland along the front of India’s range (Drainage layer), fed from the range and from the shield; the shields themselves are cut slowly (hard rock), their rivers shallow.'],
    rift: ['The escarpment facing the young ocean is cut by short steep rivers; behind its crest the rivers flow inland, away from the new coast — the great escarpment is a divide.'],
    farfield: ['The range raised far inland is cut by short valleys to both sides; the broad swells and basins across the continent steer the big rivers, which run along the basins, parallel to the front, before breaking through to the sea.'],
    history: [
        'Valleys branch like trees; ranges stand as the divides between river basins; big rivers are graded to broad lowlands near the sea, and uplands are dissected from their edges inward.',
        'Active ranges keep steep, high rivers (they are still rising); old ranges are cut down further.',
        'Drainage layer: the river network (not drawn on the terrain by default). Carving depth: how deep the rivers cut.',
        'Rivers through time: the history’s own rivers — drained every few Myr as the land evolved, cutting as they go. Scrub: big rivers hold their courses, and where land rose under one it cut a gorge through (red); the terrain’s rivers follow these courses and cut at least as deep.',
        'Scrub through the history: every frame is carved; big rivers hold their courses as their continent drifts (small streams may shift), and move where the land beneath them changes.',
        'Switch the terrain resolution: the same big valleys at every resolution; finer meshes add smaller ones.',
    ],
    cycle: [
        'Across the supercontinent cycle (chart): rivers of an assembled supercontinent run long, across its interior; after the breakup the new coasts are lifted into escarpments with short rivers facing the young oceans, and big rivers flow inland away from them.',
        'Old sutures inside a reassembled supercontinent are worn-down ranges cut by rivers; the ranges of its newest collisions stand high, with steep rivers.',
    ],
};

/** Colour of a carving depth (km): pale where untouched, through ochre, to deep red where cut 1.5 km or more. */
function cutRgb(d) {
    const t = Math.max(0, Math.min(1, d / 1.5));
    return t < 0.3 ? [236, 232, 220].map((c, i) => c + ([222, 176, 92][i] - c) * t / 0.3) : [222, 176, 92].map((c, i) => c + ([140, 36, 30][i] - c) * (t - 0.3) / 0.7);
}

export const createPhase = terrainPhase({
    id: '8b',
    carve: true,
    title: 'Phase 8b — Rivers',
    summary: 'The tectonic surface of 8a, carved by rivers. The stream power law is solved analytically in time along the river network (Tzathas et al. 2024): erosion travels up each river at a speed set by its drainage area, so after a given time each point stands where the ground downstream of it stood, plus the uplift gathered on the way — big rivers graded to lowlands, uplands cut from their edges inward, active ranges keeping steep rivers. The rivers of the history itself — drained every few Myr as the land evolved, cutting as they went, keeping their courses where they could — steer the network and deepen it: gorges where big rivers held their ways through rising ranges. The network is routed from the sea, coarse to fine over the sim mesh and the terrain meshes, and every river carves: a valley widens with the square root of its river’s discharge, so a cell drops by the share of it its valley takes — great rivers cut whole cells, streams barely mark theirs. Every frame of the history is carved. ',
    checklists: CHECKLISTS,
    checkCommand: 'node v2/tools/check-phase8b.mjs',
    lowlandNote: 'of land below 400 m (Earth ≈ half)',
    tunables: [
        { id: 'carveTimeMyr', label: 'How long the rivers have worked', min: 0.1, max: 5, step: 0.1, unit: ' Myr' },
        { id: 'carveHillSlope', label: 'Valley sides: gradient (km per km)', min: 0.02, max: 0.3, step: 0.01 },
        { id: 'carveValleyKm', label: 'Valley width where 10,000 km² drains (wider as rivers grow)', min: 2, max: 60, step: 1, unit: ' km' },
        { id: 'carveUpliftPerKm', label: 'Active ranges keep steep rivers (uplift per km of relief)', min: 0, max: 1, step: 0.05, unit: ' km/Myr' },
        { id: 'lipStepKm', label: 'Flood basalts: height of the steps they are cut into (0 = none)', min: 0, max: 0.6, step: 0.02, unit: ' km' },
        { id: 'riverCutK', label: 'The history’s rivers: how fast they cut (re-runs the history)', min: 0, max: 2, step: 0.05, evolves: true },
        { id: 'riverHalfKm2', label: 'The history’s rivers: drainage that cuts half through a range (re-runs the history)', min: 10000, max: 1000000, step: 10000, unit: ' km²', evolves: true },
    ],
    extraLayers: ({ terrainOf, tMesh, view }) => [
        {
            // the history's rivers (tectonics/step/rivers.js), on the sim mesh: blue by what they drain, red where they
            // have cut (how deep: through the ranges they held their ways across)
            label: 'Rivers through time', paint(frame, out) {
                const T = terrainOf(frame), { cells: sc, weights: sw } = T.sampler;
                paintRelief(T.heightKm, T.shade, out, { seaLevelKm: view.seaLevelKm });
                for (let t = 0; t < tMesh.numCells; t++) {
                    if (T.heightKm[t] <= view.seaLevelKm) continue;
                    let a = 0, inc = 0;
                    for (let j = 0; j < 3; j++) { const c = sc[3 * t + j], w = sw[3 * t + j]; a += w * frame.riverKm2[c]; inc += w * frame.riverIncKm[c]; }
                    const g = 0.6;                                   // (dim the terrain under the overlay)
                    out[3 * t] *= g; out[3 * t + 1] *= g; out[3 * t + 2] *= g;
                    const cut = Math.min(1, inc / 1.5);
                    if (cut > 0.03) { out[3 * t] += (230 - out[3 * t]) * cut; out[3 * t + 1] += (40 - out[3 * t + 1]) * cut * 0.8; out[3 * t + 2] += (40 - out[3 * t + 2]) * cut * 0.8; }
                    if (a > 2e4) { const s = Math.min(1, Math.log10(a / 2e4) / 2); out[3 * t] += (40 - out[3 * t]) * s; out[3 * t + 1] += (140 - out[3 * t + 1]) * s; out[3 * t + 2] += (255 - out[3 * t + 2]) * s; }
                }
            },
        },
        {
            label: 'Before carving', needsCarving: true, paint(frame, out) {
                const T = terrainOf(frame);
                T.tectonicShade ??= hillshade(tMesh, T.tectonicKm, { exaggeration: view.exaggeration, seaLevelKm: view.seaLevelKm });
                paintRelief(T.tectonicKm, T.tectonicShade, out, { seaLevelKm: view.seaLevelKm });
            },
        },
        {
            label: 'Carving depth', needsCarving: true, paint(frame, out) {
                const T = terrainOf(frame);
                for (let t = 0; t < tMesh.numCells; t++) {
                    const k = 0.5 + 0.5 * T.shade[t];
                    if (T.tectonicKm[t] <= view.seaLevelKm) { out[3 * t] = 40 * k; out[3 * t + 1] = 60 * k; out[3 * t + 2] = 100 * k; continue; }
                    const c = cutRgb(T.tectonicKm[t] - T.heightKm[t]);
                    out[3 * t] = c[0] * k; out[3 * t + 1] = c[1] * k; out[3 * t + 2] = c[2] * k;
                }
            },
        },
        {
            // the river network: blue by drainage area (log), over the shaded terrain
            label: 'Drainage', needsCarving: true, paint(frame, out) {
                const T = terrainOf(frame);
                paintRelief(T.heightKm, T.shade, out, { seaLevelKm: view.seaLevelKm });
                for (let t = 0; t < tMesh.numCells; t++) {
                    const a = T.drainage[t];
                    if (!(a > 2000) || T.heightKm[t] <= view.seaLevelKm) continue;
                    const s = Math.min(1, Math.log10(a / 2000) / 2.5);
                    out[3 * t] += (30 - out[3 * t]) * (0.35 + 0.65 * s); out[3 * t + 1] += (90 - out[3 * t + 1]) * (0.35 + 0.65 * s); out[3 * t + 2] += (210 - out[3 * t + 2]) * (0.35 + 0.65 * s);
                }
            },
        },
    ],
    extraLegend: [
        ...[[0, 'not carved (Carving depth layer)'], [0.5, 'cut 0.5 km'], [1.5, 'cut 1.5 km or more']].map(([d, label]) => ({ color: css(cutRgb(d)), label })),
        { color: 'rgb(30, 90, 210)', label: 'rivers (Drainage layer): brighter, bigger' },
        { color: 'rgb(40, 140, 255)', label: 'the history’s rivers (Rivers through time): brighter, bigger' },
        { color: 'rgb(230, 70, 70)', label: '…and how deep they have cut (1.5 km or more)' },
    ],
});
