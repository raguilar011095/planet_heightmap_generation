// Headless checks for the far field (plans/V2_FAR_FIELD_PLAN.md): a front's push felt far inland.
// Usage: node v2/tools/check-far-field.mjs
//   F1 the record: records only (the same events), passes through cratons and is taken up by weak lines beyond, fades
//      with distance, its axis along the push, turned with the crust at a weld, the same at a finer sim mesh, cheap.
//   F2 reactivation: the suture behind a craton square across the push rises, one along it barely, a failed rift inverts,
//      a craton never; over a whole history the land stands no higher than without it (within a few points).

import crypto from 'node:crypto';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { MECHANISMS } from '../js/tectonics/config.js';
import { CrustType, CrustFlag, OrogenyType } from '../js/tectonics/model/crust.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';
import { synthesizeTerrain } from '../js/terrain/synthesize.js';
import { buildStartWorld } from '../js/tectonics/init/start-world.js';
import { TERRAIN_SCENES, FAR_TERRANES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { quatToMat3 } from '../js/core/rotation.js';

setDelaunator(Delaunator);
const mesh = labMesh(), scene = id => TERRAIN_SCENES.find(s => s.id === id);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

/** The far-field scene (India into an Asia with Tarim and Siberia, sutures across and along the push, a failed rift). */
function farScene(simMesh = mesh, untilMyr = 140) {
    const s = scene('farfield'), world = s.build(simMesh, 12345);
    const { frames } = simulate(world, { untilMyr, drive: w => s.drive(w), snapshotEveryMyr: 10 });
    // a feature's cells, wherever they ended up (terrane ids survive a weld — whichever plate ends on top)
    const cellsOf = id => world.plates.filter(p => p.alive).flatMap(p => { const out = []; for (let c = 0; c < p.crust.mask.length; c++) if (p.crust.mask[c] && p.crust.terrane[c] === id && p.crust.type[c] !== CrustType.OCEAN) out.push([p, c]); return out; });
    const felt = id => { const cs = cellsOf(id); return cs.reduce((t, [p, c]) => t + p.crust.farWork[c], 0) / Math.max(1, cs.length); };
    const land = world.plates.filter(p => p.alive && !p.isBackground).flatMap(p => { const out = []; for (let c = 0; c < p.crust.mask.length; c++) if (p.crust.mask[c] && p.crust.type[c] !== CrustType.OCEAN) out.push(p.crust.farWork[c]); return out; });
    return { world, frames, cellsOf, felt, land };
}

section('F1 — the push: records only');
{
    const run = off => {
        const s = scene('cycle'), world = s.build(mesh, 3, { continentalFraction: 0.3 });
        if (off) Object.assign(world.config, MECHANISMS.farField);
        const t0 = performance.now();
        simulate(world, { untilMyr: 300, drive: w => s.drive?.(w), snapshotEveryMyr: 10 });
        const hash = crypto.createHash('sha1').update(JSON.stringify(world.events.map(e => [e.kind, Math.round(e.time * 1000), e.data]))).digest('hex');
        return { hash, events: world.events.length, ms: performance.now() - t0 };
    };
    const on = run(false), off = run(true);
    check('the far field changes no event of the history: only its records', on.hash === off.hash && on.events === off.events,
        `${on.events} events over 300 Myr of the start world, the same with the far field on and off`);
    check('…and costs little', on.ms <= 1.15 * off.ms + 500, `${(on.ms / 1000).toFixed(1)} s with it, ${(off.ms / 1000).toFixed(1)} s without (≤ +15 %)`);
}

section('F1 — the push through a continent');
const F = farScene();
{
    const T = FAR_TERRANES, { felt, cellsOf, land } = F;
    const tarim = felt(T.tarim), across = felt(T.across), along = felt(T.along), aul = felt(T.aulacogen), siberia = felt(T.siberia);
    const front = land.slice().sort((x, y) => x - y)[Math.floor(0.95 * (land.length - 1))];
    check('a craton passes the push on, hardly taking any', tarim > 0 && tarim < 0.4 * across, `Tarim felt ${tarim.toFixed(0)} km on average; the suture beyond it ${across.toFixed(0)} km`);
    check('the push lands on the weak line beyond the craton — more than on one the push runs along', across > 1.5 * along,
        `the suture square across the push, behind Tarim: ${across.toFixed(0)} km; the one along it: ${along.toFixed(0)} km`);
    check('…and on the failed rift', aul > along, `the failed rift ${aul.toFixed(0)} km`);
    check('it fades with distance from the front', siberia < 0.05 * front && front > 200, `${front.toFixed(0)} km near the front (the most-pushed 5 % of the land); ${siberia.toFixed(0)} km on the Siberian shield, ~4000 km away`);
    // the axis on the suture behind Tarim: square across the suture — along the push
    const cs = cellsOf(T.across), [p0] = cs[0], { xyz } = mesh;
    let sx = 0, sy = 0, sz = 0;
    for (const [, c] of cs) { sx += xyz[3 * c]; sy += xyz[3 * c + 1]; sz += xyz[3 * c + 2]; }
    const l = Math.hypot(sx, sy, sz), m = [sx / l, sy / l, sz / l];
    // the suture's direction: the long axis of its cells about their middle (all on one plate's raster)
    let e = [m[1], -m[0], 0]; const el = Math.hypot(...e) || 1; e = e.map(v => v / el);
    const n = [m[1] * e[2] - m[2] * e[1], m[2] * e[0] - m[0] * e[2], m[0] * e[1] - m[1] * e[0]];
    let uu = 0, vv = 0, uv = 0;
    for (const [, c] of cs) { const u = xyz[3 * c] * e[0] + xyz[3 * c + 1] * e[1] + xyz[3 * c + 2] * e[2], v = xyz[3 * c] * n[0] + xyz[3 * c + 1] * n[1] + xyz[3 * c + 2] * n[2]; uu += u * u; vv += v * v; uv += u * v; }
    const th = 0.5 * Math.atan2(2 * uv, uu - vv), t = [e[0] * Math.cos(th) + n[0] * Math.sin(th), e[1] * Math.cos(th) + n[1] * Math.sin(th), e[2] * Math.cos(th) + n[2] * Math.sin(th)];
    const ang = cs.filter(([p]) => p === p0).map(([p, c]) => { const a = [p.crust.farDx[c], p.crust.farDy[c], p.crust.farDz[c]], al = Math.hypot(...a) || 1; return Math.asin(Math.min(1, Math.abs(a[0] * t[0] + a[1] * t[1] + a[2] * t[2]) / al)) * 180 / Math.PI; });
    check('the axis lies along the push — square across the suture it meets', median(ang) <= 25, `on the suture behind Tarim the axis is ${median(ang).toFixed(0)}° from square across it (median of ${ang.length} cells)`);
}

{   // a weld moves India's crust into Asia's frame: its axis must turn with it (seen in the world frame, it stays put)
    const { frames } = F, m = new Float64Array(9);
    const worldAxis = (f, w) => {
        const o = f.owner[w], d = [f.farDir[3 * w] / 127, f.farDir[3 * w + 1] / 127, f.farDir[3 * w + 2] / 127];
        quatToMat3(f.plates[o].quat, m);
        return [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[3] * d[0] + m[4] * d[1] + m[5] * d[2], m[6] * d[0] + m[7] * d[1] + m[8] * d[2]];
    };
    // the frame where India or Asia stops being a plate: the weld (whichever went under, its crust is in the other's frame now)
    const k = frames.findIndex((f, i) => i > 0 && f.plates.some((p, j) => p && !p.alive && frames[i - 1].plates[j]?.alive && /^(India|Asia)$/.test(p.name)));
    const gone = k > 0 ? frames[k].plates.find((p, j) => p && !p.alive && frames[k - 1].plates[j]?.alive && /^(India|Asia)$/.test(p.name)).name : '';
    const before = frames[k - 1], after = frames[k], angles = [];
    if (k > 0) for (let w = 0; w < mesh.numCells; w++) {
        if (before.owner[w] < 0 || after.owner[w] < 0 || before.plates[before.owner[w]]?.name !== gone || before.type[w] === CrustType.OCEAN || after.type[w] === CrustType.OCEAN) continue;
        if (!(before.farWork[w] > 20) || !(after.farDir[3 * w] || after.farDir[3 * w + 1] || after.farDir[3 * w + 2])) continue;
        const a = worldAxis(before, w), b = worldAxis(after, w);
        angles.push(Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI);
    }
    check('a weld turns the axis with the crust', angles.length >= 20 && median(angles) <= 12,
        k > 0 ? `${gone} welded by ${after.time} Myr: its axis, seen in the world, moved ${median(angles).toFixed(0)}° (median of ${angles.length} cells) across the weld` : 'no weld found');
}

{   // scale: the same push at a finer sim mesh. (A history is no test: at 80K the India scene's collision takes the other
    // polarity — Asia goes under — so the fronts differ. The start world's assembly pushes are the same sources at any mesh.)
    const pushOf = cells => {
        const { world } = buildStartWorld(labMesh(cells), 3), C = world.plates[0].crust, land = [], craton = [], weak = [];
        for (let c = 0; c < C.mask.length; c++) {
            if (!C.mask[c] || C.type[c] === CrustType.OCEAN) continue;
            land.push(C.farWork[c]);
            if (C.type[c] === CrustType.CRATON) craton.push(C.farWork[c]); else if (C.flags[c] & CrustFlag.SUTURE) weak.push(C.farWork[c]);
        }
        const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
        return [q(land, 0.5), q(land, 0.9), median(craton), median(weak)];
    };
    const coarse = pushOf(40000), fine = pushOf(80000), off = Math.max(...coarse.map((v, i) => Math.abs(v - fine[i]) / Math.max(v, fine[i], 1)));
    check('the same push at a finer sim mesh', off <= 0.2, `the start world's assembly push at 40K / 80K — land median ${coarse[0].toFixed(0)}/${fine[0].toFixed(0)}, 90th percentile ${coarse[1].toFixed(0)}/${fine[1].toFixed(0)}, cratons ${coarse[2].toFixed(0)}/${fine[2].toFixed(0)}, sutures ${coarse[3].toFixed(0)}/${fine[3].toFixed(0)} km (largest difference ${(100 * off).toFixed(0)} %)`);
}

section('F2 — old weak lines squeezed up again');
{
    const T = FAR_TERRANES, { cellsOf } = F;
    const stats = id => {
        const cs = cellsOf(id);
        let intra = 0, up = 0;
        for (const [p, c] of cs) { if (p.crust.oroType[c] === OrogenyType.INTRAPLATE) intra++; up = Math.max(up, p.crust.upliftKm[c] + p.crust.rugged[c]); }   // (its uplift and crests)
        return { share: intra / Math.max(1, cs.length), up };
    };
    const across = stats(T.across), along = stats(T.along), aul = stats(T.aulacogen), tarim = stats(T.tarim);
    check('the suture behind the craton, square across the push, rises as a range far from the front (the Tian Shan)', across.share >= 0.8 && across.up >= 0.5,
        `${(100 * across.share).toFixed(0)} % of it carries an intraplate belt; its uplift and crests up to ${across.up.toFixed(2)} km, 40 Myr after the collision welded`);
    check('…the suture the push runs along barely stirs', along.share <= 0.5 * across.share, `${(100 * along.share).toFixed(0)} % of it`);
    check('…the failed rift is squeezed up into a ridge (an inverted aulacogen)', aul.share >= 0.5, `${(100 * aul.share).toFixed(0)} % of it, uplift and crests up to ${aul.up.toFixed(2)} km`);
    check('…and a craton never does', tarim.share === 0, `${(100 * tarim.share).toFixed(0)} % of Tarim`);
}
{   // a whole history: mountain building stays in check (developer: "monitor mountain building over time to make sure it
    // isn't too much") — the carved terrain, far field on vs off
    const tm = terrainMesh(160000), heights = off => {
        const s = scene('cycle'), world = s.build(mesh, 7, { continentalFraction: 0.3 });
        if (off) Object.assign(world.config, MECHANISMS.farField);
        const { frames } = simulate(world, { untilMyr: 700, drive: w => s.drive?.(w), snapshotEveryMyr: 350 });
        return frames.slice(1).map(f => {
            const T = synthesizeTerrain(f, mesh, tm, { seed: 7, carve: true }), land = [];
            for (const h of T.heightKm) if (h > 0) land.push(h);
            return { time: f.time, above1: land.filter(h => h > 1).length / land.length, low: land.filter(h => h < 0.4).length / land.length, max: Math.max(...land) };
        });
    };
    const on = heights(false), off = heights(true);
    const worst = Math.max(...on.map((r, i) => r.above1 - off[i].above1)), lowLost = Math.max(...on.map((r, i) => off[i].low - r.low));
    const peak = Math.max(...on.map((r, i) => r.max - off[i].max));
    check('mountain building stays in check over a whole history', worst <= 0.03 && lowLost <= 0.03 && peak <= 1,
        on.map((r, i) => `${r.time} Myr: land above 1 km ${(100 * off[i].above1).toFixed(1)} → ${(100 * r.above1).toFixed(1)} %, below 0.4 km ${(100 * off[i].low).toFixed(0)} → ${(100 * r.low).toFixed(0)} %, highest ${off[i].max.toFixed(1)} → ${r.max.toFixed(1)} km`).join('; ') + ' (without → with the far field)');
}

finish('Far field');
