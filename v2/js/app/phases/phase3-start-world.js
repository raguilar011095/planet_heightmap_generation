// Lab phase 3 — the generated start world: cratons, accreted crust, terranes, suture belts,
// and a rim trench on an ocean apron; plus a short prescribed nudge to test the apron.

import { buildNudgeScene, NUDGE_MAX_MYR, NUDGE_CM_YR } from '../../tectonics/scenarios/start-world-nudge.js';
import { measureStartWorld } from '../../tectonics/init/measure-start.js';
import { simulate } from '../../tectonics/simulate.js';
import { frameTallies } from '../../tectonics/measure.js';
import { CrustFlag, CrustType } from '../../tectonics/model/crust.js';
import { describeCell, recordedFrameAt, boundaryLegend, SNAPSHOT_MYR } from './phase-kit.js';
import { quatToMat3 } from '../../core/rotation.js';
import { xyzToLatLon } from '../../tectonics/step/kinematics.js';
import { colorByCrustType, colorByTerrane, colorByWeakness, colorByPlate, colorByCrustAge, overlayBoundaries, terraneCss, css, BOUNDARY_RGB, TYPE_RGB, APRON_RGB, SUTURE_RGB } from '../../view/palettes.js';
import { BoundaryKind } from '../../tectonics/model/world.js';


export function createPhase(simMesh, seed, overrides = {}) {
    const t0 = performance.now();
    const { world, start, drive, pole } = buildNudgeScene(simMesh, seed, overrides);
    const measured = measureStartWorld(world, start);       // before anything moves
    const genMs = performance.now() - t0;
    const { frames } = simulate(world, { untilMyr: NUDGE_MAX_MYR, drive, snapshotEveryMyr: SNAPSHOT_MYR, events: false });     // kinematics and crust rules only: events are Phase 5
    const cfg = start.config, centre = xyzToLatLon(start.centre[0], start.centre[1], start.centre[2]);
    const letterOf = id => start.cratons[id - 1]?.letter ?? '?';
    const mat = new Float64Array(9);

    return {
        title: 'Phase 3 — The generated start world',
        summary: 'Worldbuilding Pasta’s starting condition, built from the seed: a supercontinent of lettered cratons wrapped ' +
            'in younger accreted crust, on one plate, in a passive pre-history ocean. The plate is larger than its land — it ' +
            'carries an apron of captured old ocean, and the rim trench runs along the apron’s smooth outer edge, a little ' +
            'offshore. Time 0 is the start state. Press play for “the nudge”: the whole plate drifts at ' + NUDGE_CM_YR +
            ' cm/yr toward its active rim, using the Phase 2 rules, to show how a smooth offshore trench behaves.',
        checklist: [
            `Cratons: ${cfg.cratonCount} of them, clearly different sizes (largest ÷ smallest diameter ≈ ${cfg.cratonSizeRatio}), lettered A, B, C…`,
            'Each craton is a fragment, not a blob: an elongated core clipped by a few near-straight old rift edges (some with a step where a transform offset them), corners rounded — kites, lenses, wedges and D-shapes, no slivers. Some come in sibling pairs: two halves of one parent split across its long axis, their matching edges facing each other across a gap.',
            'They cluster: a few proto-continents, each holding its cratons close together, with wider ground between the clusters (the cards show both gaps).',
            'The supercontinent was assembled: each proto-continent grew outward (a core round its cratons, then accreted rings on the side that grew wider), and they met along a few long, curving major seams. Terranes layer: each craton\'s core terrane, the rings beyond, the proto-continents\' borders. The seams carry the old ranges — highest on the major seam of the last two to meet, lower on earlier ones, faint between a core\'s cratons — so there is no honeycomb of ranges round every craton.',
            'The coast is drawn by the assembly and the margin, not by noise: lobes where proto-continents bulge, bays where they did not meet (a gulf by chance), smooth arcs joined at cusps along the trench, rifted steps along the passive stretch, and only small bays and headlands from noise.',
            'Priorities when the sliders compete: the spacing minimums always hold; the continental-crust percentage is hit as closely as possible; craton size is what gives way — cratons shrink (down to 30 % of the requested area) to make room. Push the gap and sea-distance sliders up and watch the cratons get smaller while the land percentage stays put.',
            `Spacing, always: at least ${cfg.cratonMinGapKm} km of accreted crust between any two cratons, and at least ${cfg.cratonMinCoastKm} km between any craton and the sea. The cards show the measured minimums — try many seeds (the “New” button) and the sliders.`,
            'Terranes layer: every piece of land belongs to a terrane — a craton’s core, or an accreted ring — and terranes differ a lot in size. Borders wander; they are not straight Voronoi lines.',
            'Strength layer: the orange suture belts — the major seams between proto-continents and the seams between a core’s cratons — are the weak zones future rifts will follow (not the rings’ seams, which run along the coast: a rift following one would shave a ribbon off it); cratons (dark) are rigid and rifts must go round them.',
            'One connected landmass with bays and promontories, no inland seas, no stray islands, and no more than about half-way round the planet end to end.',
            'Crust type layer: the lighter-blue apron is old ocean that belongs to the continent’s plate. It fills the bays, so the plate outline — and the trench on it (deep blue at time 0) — is much smoother than the coastline.',
            'One stretch of the rim has no trench: a passive margin. Its position changes with the seed; the “rim trench” slider changes how much of the rim is active.',
            'The nudge (press play): along the leading rim the three trench bands appear on the APRON edge, offshore — not on the coast — and no slivers of new ocean form behind headlands. New crust appears only as one clean wake behind the plate. Land and apron move together.',
        ],
        checkCommand: 'node v2/tools/check-phase3.mjs',
        maxTime: NUDGE_MAX_MYR,
        timeStep: SNAPSHOT_MYR,
        initialView: [centre.lat, centre.lon],
        params: [
            { id: 'cratonCount', label: 'Cratons', min: 6, max: 20, step: 1, value: cfg.cratonCount },
            { id: 'continentalFraction', label: 'Continental crust', min: 0.2, max: 0.36, step: 0.01, value: cfg.continentalFraction, unit: ' of surface' },
            { id: 'cratonShare', label: 'Craton share of that crust (at most — shrinks to fit)', min: 0.18, max: 0.4, step: 0.01, value: cfg.cratonShare },
            { id: 'cratonSizeRatio', label: 'Craton size variety (largest ÷ smallest)', min: 1.4, max: 3.2, step: 0.1, value: cfg.cratonSizeRatio, unit: '×' },
            { id: 'cratonMinGapKm', label: 'Min gap between cratons', min: 300, max: 900, step: 50, value: cfg.cratonMinGapKm, unit: ' km' },
            { id: 'cratonMinCoastKm', label: 'Min craton-to-sea distance', min: 300, max: 900, step: 50, value: cfg.cratonMinCoastKm, unit: ' km' },
            { id: 'coastReliefKm', label: 'Coast relief (bays & peninsulas)', min: 0, max: 1500, step: 50, value: cfg.coastReliefKm, unit: ' km' },
            { id: 'rimTrenchCoverage', label: 'Rim trench coverage', min: 0.5, max: 1, step: 0.05, value: cfg.rimTrenchCoverage },
        ],
        layers: [
            { label: 'Crust type', paint: colorByCrustType },
            { label: 'Terranes', paint: colorByTerrane },
            { label: 'Strength', paint: colorByWeakness },
            { label: 'Plates', paint: colorByPlate },
            { label: 'Crust age', paint: colorByCrustAge },
        ],
        hasBoundaries: true,
        // Time 0 is the start state: nothing has moved, so instead of boundary kinds (which describe
        // motion) show the trench the generator armed along the rim.
        paintBoundaries(frame, out) {
            if (frame.time > 0) { overlayBoundaries(frame, out); return; }
            const rgb = BOUNDARY_RGB[BoundaryKind.OVERRIDING];
            for (let w = 0; w < frame.owner.length; w++) if (frame.flags[w] & CrustFlag.TRENCH) { out[3 * w] = rgb[0]; out[3 * w + 1] = rgb[1]; out[3 * w + 2] = rgb[2]; }
        },
        legend: [
            { color: css(TYPE_RGB[CrustType.CRATON]), label: 'craton — ancient rigid core' },
            { color: css(TYPE_RGB[CrustType.CONTINENT]), label: 'accreted continental crust' },
            { color: css(SUTURE_RGB), label: 'suture belt between terranes (Strength layer) — weak' },
            { color: css(APRON_RGB), label: 'ocean apron — old ocean on the continent’s plate' },
            { color: css(TYPE_RGB[CrustType.OCEAN]), label: 'passive pre-history ocean (its own plate)' },
            ...boundaryLegend(),
            { gradient: true, label: 'Crust age layer: 0 → 180 Myr' },
        ],

        frameAt: t => recordedFrameAt(frames, t),

        stats(fr) {
            const m = measured, pct = v => (v * 100).toFixed(1) + ' %', t = frameTallies(fr);
            const ok = (value, min) => (value >= min ? '✓' : '✗ BELOW MINIMUM');
            return {
                cards: [
                    { big: `${m.minGapKm.toFixed(0)} km`, small: `smallest craton–craton gap · min ${cfg.cratonMinGapKm} ${ok(m.minGapKm, cfg.cratonMinGapKm)}` },
                    { big: `${m.minCoastKm.toFixed(0)} km`, small: `smallest craton–sea distance · min ${cfg.cratonMinCoastKm} ${ok(m.minCoastKm, cfg.cratonMinCoastKm)}` },
                    { big: pct(m.continentalFraction), small: `continental crust · asked ${pct(cfg.continentalFraction)} ${start.fractionMet ? '✓' : '✗ cratons already at minimum size'}` },
                    { big: pct(m.cratonShare), small: start.cratonAreaScale < 1
                        ? `of it is craton · asked ${pct(cfg.cratonShare)}, shrunk to ${(start.cratonAreaScale * 100).toFixed(0)} % size to make room for the gaps`
                        : `of it is craton · asked ${pct(cfg.cratonShare)} ✓` },
                    { big: `${m.cratonSizeRatio.toFixed(1)}× · ${m.terraneSizeRatio.toFixed(1)}×`, small: 'size spread: cratons (Ø) · terranes (area)' },
                    ...(m.clusterContrast ? [{ big: `${m.clusterContrast.intraKm.toFixed(0)} · ${m.clusterContrast.interKm.toFixed(0)} km`,
                        small: `gaps: cluster-mates · between clusters (${new Set(start.cratons.map(k => k.cluster)).size} clusters, ${m.siblingPairs} sibling pairs)` }] : []),
                    { big: `${m.longestAxisDeg.toFixed(0)}°`, small: 'longest axis (180° = half-way round)' },
                    { big: `${m.rimCells} / ${m.coastCells}`, small: `rim ÷ coast length in cells · trench on ${pct(m.trenchCoverage)} of the rim` },
                    { big: `${t.newOcean}`, small: `new-ocean cells at ${fr.time} Myr (the wake)` },
                    { big: `${m.strayLandCells + m.enclosedSeaCells}`, small: 'stray islands + inland-sea cells (must be 0)' },
                ],
                head: ['Craton', 'Ø km', 'craton', 'terrane'],
                rows: m.cratons.slice().sort((a, b) => b.diameterKm - a.diameterKm).map(k => ({
                    name: k.letter, color: terraneCss(k.id),
                    cells: [k.diameterKm.toFixed(0), (k.areaKm2 / 1e6).toFixed(1), (k.terraneKm2 / 1e6).toFixed(1)],
                })),
                hint: `Areas in million km², largest craton first. Generated in ${genMs.toFixed(0)} ms (attempt ${start.attempts}); apron ≥ ${m.minApronKm.toFixed(0)} km wide. ` +
                    'Distances are measured from the finished crust, not taken from the generator’s own bookkeeping.',
            };
        },

        markers(fr) {
            // craton letters ride with the plate
            quatToMat3(fr.plates[start.continentId].quat, mat);
            const out = start.cratons.map(k => ({
                kind: 'label', label: k.letter,
                xyz: [mat[0] * k.centre[0] + mat[1] * k.centre[1] + mat[2] * k.centre[2], mat[3] * k.centre[0] + mat[4] * k.centre[1] + mat[5] * k.centre[2], mat[6] * k.centre[0] + mat[7] * k.centre[1] + mat[8] * k.centre[2]],
            }));
            out.push({ xyz: pole, plateId: start.continentId, label: 'nudge pole' });
            return out;
        },

        describeCell: (fr, w) => describeCell(fr, w, { terraneName: letterOf }),
    };
}
