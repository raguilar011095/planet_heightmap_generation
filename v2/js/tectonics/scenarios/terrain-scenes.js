// Phase 8 test scenes: the earlier phases' scenes, each chosen for the landform it builds, with every mechanism
// their own scene left on. Terrain is synthesized from their frames (terrain/synthesize.js); these only pick the
// history and where to look.

import { MARGIN_SCENES } from './margin-scenes.js';
import { BUDGET_SCENES } from './budget-scenes.js';
import { HOTSPOT_SCENES, omegaFor, heading } from './hotspot-scenes.js';
import { RIFT_SCENES } from './rift-scenes.js';
import { updatePlateMotion } from '../step/torque-balance.js';
import { CrustFlag, CrustType } from '../model/crust.js';
import { xyzToLatLon, latLonToXyz } from '../step/kinematics.js';
import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { TectonicWorld } from '../model/world.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { dot, cross, normalize } from '../../core/sphere-geom.js';
import { sceneCanvas, addContinent, addApronAndTrench, addOcean, fillBackground } from './scene-kit.js';
import { onlyMechanisms, mechanismsOn } from '../config.js';

/** A scene's `focus`: where to look in a frame — here, the centre of the land cells carrying a flag. */
function flagged(flag) {
    return (frame, simMesh) => {
        let x = 0, y = 0, z = 0;
        for (let w = 0; w < simMesh.numCells; w++) if (frame.owner[w] >= 0 && frame.type[w] !== 0 && (frame.flags[w] & flag)) { x += simMesh.xyz[3 * w]; y += simMesh.xyz[3 * w + 1]; z += simMesh.xyz[3 * w + 2]; }
        const l = Math.hypot(x, y, z);
        if (!l) return null;
        const ll = xyzToLatLon(x / l, y / l, z / l);
        return [ll.lat, ll.lon];
    };
}

/**
 * Phase 10: the India collision with big shields on both sides — India's close behind its leading coast, so the
 * range's foothills ride onto its rim and its foreland bends into it; Asia's ~900 km behind its south coast, so the
 * plateau the collision raises reaches it and its back meets the block (a steep front, the Longmen Shan against the
 * Sichuan Basin). The India scene's geometry and forces otherwise (force-scenes.js).
 */
function buildCratons(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed), canvas = sceneCanvas(simMesh, world.config), noise = new SimplexNoise(seed);
    const asia = world.addPlate('Asia'), india = world.addPlate('India');
    const asiaLand = addContinent(canvas, noise, { plate: asia, centre: [40, 72], radiusKm: 2800, cratonKm: 1900 });
    addApronAndTrench(canvas, asia, asiaLand, [[215, 325]], world.config);
    const indiaLand = addContinent(canvas, noise, { plate: india, centre: [-28, 72], radiusKm: 1300, cratonKm: 950 });
    const a = indiaLand.centre, b = asiaLand.centre, axis = normalize(cross(a, b)), span = Math.acos(dot(a, b));
    addOcean(canvas, india, (x, y, z) => {
        const p = [x, y, z];
        if (Math.acos(Math.max(-1, Math.min(1, dot(p, a)))) * PLANET_RADIUS_KM < 1900) return true;
        const off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(p, axis))))) * PLANET_RADIUS_KM;
        const along = Math.atan2(dot(cross(a, p), axis), dot(a, p));
        return off < 1900 && along > 0 && along < span;
    }, -90);
    fillBackground(canvas, world, world.config);
    Object.assign(world.config, onlyMechanisms('underthrust'), mechanismsOn('underthrust'));
    return world;
}

/**
 * The far field (plans/V2_FAR_FIELD_PLAN.md): the India collision again, into an Asia with no shield at its centre but
 * a Tarim-like one ~1100 km behind its south coast and a Siberian one far to the north; between them an old suture
 * running east–west, square across the push, beyond Tarim; another running north–south, along the push, to the east;
 * and a failed rift striking north-east to the west. The push should pass through Tarim and land on the suture beyond
 * it (the Tian Shan), barely touch the one along it, and squeeze the failed rift (an inverted aulacogen).
 */
/** The far-field scene's features, each its own terrane (so a check finds them whichever plate ends on top). */
export const FAR_TERRANES = Object.freeze({ tarim: 901, siberia: 902, across: 903, along: 904, aulacogen: 905 });

function buildFarField(simMesh, seed) {
    const world = new TectonicWorld(simMesh, seed), canvas = sceneCanvas(simMesh, world.config), noise = new SimplexNoise(seed);
    const asia = world.addPlate('Asia'), india = world.addPlate('India');
    const asiaLand = addContinent(canvas, noise, { plate: asia, centre: [40, 72], radiusKm: 3000, cratonKm: 0 });
    const { xyz, numCells } = simMesh, A = asia.crust;
    const within = (lat, lon, km) => { const p = latLonToXyz(lat, lon); return i => Math.acos(Math.max(-1, Math.min(1, xyz[3 * i] * p[0] + xyz[3 * i + 1] * p[1] + xyz[3 * i + 2] * p[2]))) * PLANET_RADIUS_KM < km; };
    const tarim = within(25, 72, 550), siberia = within(53, 72, 800), tarimId = FAR_TERRANES.tarim, siberiaId = FAR_TERRANES.siberia;
    // a band ±half km about the arc a → b (lat, lon), between its ends
    const band = (a, b, half) => {
        const pa = latLonToXyz(...a), pb = latLonToXyz(...b), n = normalize(cross(pa, pb)), span = Math.acos(dot(pa, pb));
        return i => {
            const p = [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
            if (Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(p, n))))) * PLANET_RADIUS_KM > half) return false;
            const along = Math.atan2(dot(cross(pa, p), n), dot(pa, p));
            return along > -half / PLANET_RADIUS_KM && along < span + half / PLANET_RADIUS_KM;
        };
    };
    const acrossSuture = band([35, 58], [35.5, 86], 80), alongSuture = band([22, 94], [48, 94], 80), aulacogen = band([27, 50], [37, 61], 80);
    for (let i = 0; i < numCells; i++) {
        if (!A.mask[i]) continue;
        if (tarim(i)) { A.type[i] = CrustType.CRATON; A.terrane[i] = tarimId; continue; }
        if (siberia(i)) { A.type[i] = CrustType.CRATON; A.terrane[i] = siberiaId; continue; }
        // (each line its own terrane — ids survive a weld, so a check can find them whichever plate ends on top)
        if (acrossSuture(i)) { A.flags[i] |= CrustFlag.SUTURE; A.terrane[i] = FAR_TERRANES.across; }
        else if (alongSuture(i)) { A.flags[i] |= CrustFlag.SUTURE; A.terrane[i] = FAR_TERRANES.along; }
        else if (aulacogen(i)) { A.flags[i] |= CrustFlag.FAILED_RIFT; A.terrane[i] = FAR_TERRANES.aulacogen; }
    }

    addApronAndTrench(canvas, asia, asiaLand, [[215, 325]], world.config);
    const indiaLand = addContinent(canvas, noise, { plate: india, centre: [-28, 72], radiusKm: 1300, cratonKm: 950 });
    const a = indiaLand.centre, b = asiaLand.centre, axis = normalize(cross(a, b)), span = Math.acos(dot(a, b));
    addOcean(canvas, india, (x, y, z) => {
        const p = [x, y, z];
        if (Math.acos(Math.max(-1, Math.min(1, dot(p, a)))) * PLANET_RADIUS_KM < 1900) return true;
        const off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(p, axis))))) * PLANET_RADIUS_KM;
        const along = Math.atan2(dot(cross(a, p), axis), dot(a, p));
        return off < 1900 && along > 0 && along < span;
    }, -90);
    fillBackground(canvas, world, world.config);
    Object.assign(world.config, onlyMechanisms('underthrust', 'farField'), mechanismsOn('underthrust', 'farField'));
    return world;
}

// (the rift scenes carry no drive of their own — their lab phase supplies the force model — so it is given here)
const from = (list, id, overrides = {}) => ({ drive: updatePlateMotion, ...list.find(s => s.id === id), ...overrides });
// The whole-planet histories (Evolution's, and the lab's) at a faster pace: two plates closing up to 2.25 cells a step, not
// 1.5, and the slow rules every 3 Myr, not every step — about 30 % off a history (plans/V2_PERFORMANCE_PLAN.md, 2026-10-18;
// developer: "it could be faster and more efficient on all devices"). The scenes of one mechanism keep the finer pace.
const WHOLE_PLANET_PACE = { maxCellsPerStep: 2.25, slowRulesEveryMyr: 3 };
const wholePlanet = scene => ({
    ...scene,
    build(simMesh, seed, overrides) { const world = scene.build(simMesh, seed, overrides); Object.assign(world.config, WHOLE_PLANET_PACE); return world; },
    async buildAsync(simMesh, seed, overrides, helpers) { const world = await scene.buildAsync(simMesh, seed, overrides, helpers); Object.assign(world.config, WHOLE_PLANET_PACE); return world; },
});

export const TERRAIN_SCENES = [
    from(MARGIN_SCENES, 'margins', { id: 'andes', label: 'An Andean margin', about: 'A continent overrides an ocean plate along its leading coast: a coastal range, a valley behind it, the main volcanic range, fold-and-thrust ridges inland — all parallel to the coast. Offshore, the trench and its outer rise; the trailing coast behind has a wide shelf.' }),
    from(MARGIN_SCENES, 'laramide', { id: 'laramide', label: 'A Laramide belt', about: 'A continent drives over a young slab, which goes in flat: deformation reaches far inland — a high interior with blocky basement ranges and a front range bracketing it, and no volcanoes (the magmatic gap).' }),
    from(BUDGET_SCENES, 'india', { id: 'india', label: 'A continental collision', about: '“India” reaches “Asia” and slides under it. On Asia’s side (the upper plate): a range along the suture, the plateau of thickened crust, a back range and a fall line. On India’s side: the highest range just off the suture, fold hills, then the foreland basin. Ridges run parallel to the suture.' }),
    from(MARGIN_SCENES, 'mariana', { id: 'mariana', label: 'An ocean island arc', about: 'An arc on an ocean plate, rifting off behind: a chain of volcanic islands on a submarine ridge, the trench in front, a young back-arc basin behind.' }),
    from(MARGIN_SCENES, 'japan', { id: 'japan', label: 'A strip of coast rifts off', about: 'A strip of an active continental margin rifts off as a back-arc basin opens behind it: a Japan — a mountainous arc of continental crust with volcanoes, a sea behind it.' }),
    from(HOTSPOT_SCENES, 'hawaii', { id: 'hawaii', label: 'A hotspot track', about: 'A plate slides over a fixed plume: volcanic islands near the plume, older ones worn down and drowned downstream as the floor under them ages and sinks (seamounts, guyots).' }),
    // (40 Myr, not the rifting phase's 160: 20 Myr after the split the young ocean and both shoulders are in view —
    // the trenches on the outer coasts pull the halves apart fast; the camera goes to the rifted margins, wherever they are)
    // (the Deccan scene's plume head, under a continent drifting slowly on for 300 Myr so its traps age in view — and a
    // tail that dies soon, so no chain of volcanoes crosses them)
    from(HOTSPOT_SCENES, 'deccan', {
        id: 'traps', label: 'Flood basalts through time', maxMyr: 312, focus: flagged(CrustFlag.LIP),
        build(simMesh, seed) { const world = HOTSPOT_SCENES.find(s => s.id === 'deccan').build(simMesh, seed); for (const p of world.plumes) p.lifeMyr = 15; return world; },
        drive(world) { const ind = world.plates.find(p => p.name === 'Indica'), P = latLonToXyz(-30, 75); ind.omega = omegaFor(P, heading(P, 0), 1.5); },
        about: 'A plume head floods a continent with basalt at 12 Myr; the continent drifts slowly north for 300 Myr. Young, the province is a plateau with a lobed edge; as it wears, canyons with stepped walls cut into it and its escarpment retreats from the edge, leaving flat-topped mesas before it (Ethiopia’s ambas, the Western Ghats); old, it is mesas and buttes on a low, stepped remnant. Around it a faint grain of dykes radiates from the plume’s centre. (The Deccan, Siberian and Karoo traps.)',
    }),
    from(RIFT_SCENES, 'plume', { id: 'rift', label: 'A continent splits', maxMyr: 40, focus: flagged(CrustFlag.RIFT_MARGIN), about: 'A plume splits a continent: the new coasts are lifted into shoulders — a great escarpment facing the young ocean, sloping gently inland — and the arm that failed is a low corridor.' }),
    {
        id: 'cratons', label: 'Ranges against cratons', maxMyr: 90, view: [8, 72], build: buildCratons, drive: updatePlateMotion,
        about: 'India, with a big shield close behind its leading coast, collides with Asia, whose shield lies ~900 km behind its south coast. On India’s side (the lower plate) the range’s foothills ride onto the shield’s rim, and in front of them a lowland bends the shield down; on Asia’s side the plateau reaches the shield and its back meets it in a steep front. Neither shield’s outline shows as the sim’s cells.',
    },
    {
        id: 'farfield', label: 'A collision felt far inland', maxMyr: 140, view: [30, 72], build: buildFarField, drive: updatePlateMotion,
        about: 'India collides with an Asia that has a Tarim-like shield ~1100 km behind its south coast and a Siberian one far to the north; between them an old suture runs east–west, square across the push, another north–south along it, and a failed rift strikes north-east. The push passes through the stiff shield and is taken up beyond it: the suture across it rises as a range far from the front (the Tian Shan), the one along it barely stirs, the failed rift is squeezed up into a ridge (an inverted aulacogen) — and broad, low swells and basins run parallel to the front across the continent. Far field layer: how much push each place has felt, and the axis it was squeezed along.',
    },
    // (a whole planet may be asked to end in a stage of the supercontinent cycle: `endings` — tectonics/ending.js)
    wholePlanet(from(BUDGET_SCENES, 'history', { id: 'history', label: 'A whole planet (600 Myr)', endings: true, about: 'The start world run for 600 Myr with every rule on (building takes about a minute). Young belts stand high and sharp, old ones low but still grained; cratons flat and low; wide shelves on passive margins, narrow ones on active margins; mid-ocean ridges and trenches in the sea.' })),
    // (Phase 13: the same start world, twice as long — long enough for the supercontinent to break up, disperse and gather again)
    wholePlanet(from(BUDGET_SCENES, 'history', { id: 'cycle', label: 'The supercontinent cycle (1200 Myr)', maxMyr: 1200, endings: true, about: 'The start world run for 1200 Myr with every rule on (building takes two minutes or so). The supercontinent breaks up in a burst of rifts, its pieces drift apart, and over a few hundred Myr they gather again into a new one — about 90° from the last, where the mantle goes down — which in its turn breaks up (chart: the largest landmass’s share of the continental crust, how many landmasses, the rifts).' })),
];
