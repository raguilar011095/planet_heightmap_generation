// Kinematics: move every plate by its rotation and resolve what lands where.
//
//  1. Accumulate each plate's rotation until it amounts to at least
//     moveThresholdCells of displacement, then move it in one jump. Slow plates
//     therefore move every few substeps at the correct average rate instead of
//     being stuck by nearest-cell rounding.
//  2. Forward-scatter (core/scatter.js) of each cell's EXACT particle position.
//     The rotated position is kept, so transport is exact; the grid cell is only
//     where the particle is stored, always within about a spacing of it.
//  3. Same-plate overlaps are rounding noise: re-pair each extra source with a
//     nearby gap of its own plate so plates stay coherent and mass is conserved.
//  4. Cross-plate overlaps are convergence (DESIGN.md §3.1): oceanic subducts,
//     continent stays, the dominant continental source keeps a CC cell and the
//     rest becomes boundary.excessKm for orogeny.thicken to redistribute.
//  5. Remaining gaps are divergence: new oceanic crust, age 0.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { BOUNDARY } from '../../state/boundary-fields.js';
import { recordRotation } from '../../state/plates.js';
import { scatterCells } from '../../core/scatter.js';
import { radiusNeighbors } from '../../state/neighbors.js';
import { fromPole } from '../../core/rotation.js';

const DEG = Math.PI / 180;
const CRUST_FIELDS = ['crust.plateId', 'crust.terraneId', 'crust.type', 'crust.thickness',
                      'crust.ageMa', 'crust.isCraton', 'crust.orogenAge', 'crust.sediment',
                      'crust.posX', 'crust.posY', 'crust.posZ'];

function scratch(world, name, ctor, n) {
  const s = (world.grid.scratch ??= Object.create(null));
  return (s[name] ??= new ctor(n));
}

export default definePass({
  id: 'motion.advect',
  phase: 'motion',
  doc: `Moves plates by their Euler rotations with forward-scatter advection on the fixed grid,
        re-pairs same-plate rounding overlaps with nearby gaps, resolves cross-plate overlaps as
        subduction or continental collision, and fills remaining gaps with age-0 ocean floor.
        Writes the boundary fields that orogeny.thicken consumes.`,
  reads: [...CRUST_FIELDS],
  writes: [...CRUST_FIELDS, 'boundary.kind', 'boundary.consumedKm', 'boundary.excessKm', 'boundary.overridingPlate'],
  params: {
    moveThresholdCells: { value: 0.7, range: [0.3, 1.5], unit: 'cells', doc: 'A plate moves once its accumulated rotation displaces it by at least this many cell spacings.' },
    oceanThicknessKm:   { value: 7,   range: [5, 10],    unit: 'km',    doc: 'Thickness of newly created ocean floor at divergent gaps.' },
    relocateRadiusCells:{ value: 1.6, range: [1, 3],     unit: 'cells', doc: 'How far a same-plate overlap may be relocated to find a gap of its own plate.' },
    farRadiusCells:     { value: 6,   range: [3, 12],    unit: 'cells', doc: 'Outer limit for pairing a duplicate with a same-plate gap; beyond this it counts as shortening.' },
  },
  invariants: ['continentalMassConserved'],
  run(world, p, ctx) {
    const n = world.cellCount, { xyz, locator, spacingRad } = world.grid;
    const dt = ctx.dtMyr;
    const T = [], tick = (label) => T.push([label, performance.now()]);
    tick('start');
    const old = {}, next = {};
    for (const f of CRUST_FIELDS) { old[f] = ctx.read(f); next[f] = scratch(world, f, old[f].constructor, n); }
    const kind = ctx.write('boundary.kind').fill(BOUNDARY.NONE);
    const consumed = ctx.write('boundary.consumedKm').fill(0);
    const excess = ctx.write('boundary.excessKm').fill(0);
    const overriding = ctx.write('boundary.overridingPlate').fill(-1);
    const oPlate = old['crust.plateId'], oType = old['crust.type'], oThick = old['crust.thickness'], oCraton = old['crust.isCraton'], oAge = old['crust.ageMa'];

    // 1. Which plates move this substep, and by how much.
    const matrices = [], applied = [];
    for (const plate of world.plates) {
      plate.pendingDeg += plate.degPerMyr * dt;
      if (Math.abs(plate.pendingDeg) * DEG >= p.moveThresholdCells * spacingRad) {
        matrices[plate.id] = fromPole(plate.poleLat, plate.poleLon, plate.pendingDeg);
        applied[plate.id] = plate.pendingDeg;
      } else matrices[plate.id] = null;
    }

    tick('plates');
    // 2. Scatter the exact positions. Rotated positions replace the stored ones for
    //    every source, so nothing is ever rounded away.
    const rx = scratch(world, 'rx', Float32Array, n), ry = scratch(world, 'ry', Float32Array, n), rz = scratch(world, 'rz', Float32Array, n);
    const { dest, fit, srcOffset, srcList } = scatterCells(old['crust.posX'], old['crust.posY'], old['crust.posZ'], n, locator, oPlate, matrices, rx, ry, rz);
    old['crust.posX'] = rx; old['crust.posY'] = ry; old['crust.posZ'] = rz;
    for (const plate of world.plates) {
      if (matrices[plate.id] === null) continue;
      recordRotation(plate, ctx.timeMa, ctx.timeMa + dt, applied[plate.id]);
      plate.pendingDeg = 0;
    }
    const filled = scratch(world, 'filled', Uint8Array, n).fill(0);
    const copy = (src, j) => { for (const f of CRUST_FIELDS) next[f][j] = old[f][src]; filled[j] = 1; };
    const relocate = [], cands = [];                       // same-plate extra sources; per-dest candidates
    let massBefore = 0;
    for (let i = 0; i < n; i++) if (oType[i] === CRUST.CONTINENTAL) massBefore += oThick[i];

    tick('scatter');
    // 3-4. Resolve each destination.
    for (let j = 0; j < n; j++) {
      const s0 = srcOffset[j], s1 = srcOffset[j + 1];
      if (s1 === s0) continue;                             // gap: handled below
      if (s1 - s0 === 1) { copy(srcList[s0], j); continue; }
      // One candidate per plate: the source closest to j. Same-plate extras are
      // rounding noise and get relocated into a nearby gap of their plate.
      cands.length = 0;
      for (let s = s0; s < s1; s++) {
        const i = srcList[s];
        let k = 0;
        for (; k < cands.length; k++) if (oPlate[cands[k]] === oPlate[i]) break;
        if (k === cands.length) cands.push(i);
        else if (fit[i] > fit[cands[k]]) { relocate.push(cands[k]); cands[k] = i; }   // rotated position decides
        else relocate.push(i);
      }
      if (cands.length === 1) copy(cands[0], j);
      else resolveConvergence(cands, j);
    }

    function resolveConvergence(cands, j) {
      let cont = [], oce = [];
      for (const i of cands) (oType[i] === CRUST.CONTINENTAL ? cont : oce).push(i);
      let keep;
      if (cont.length === 0) {                              // OO: youngest overrides
        keep = oce.reduce((a, b) => oAge[b] < oAge[a] ? b : a);
        for (const i of oce) if (i !== keep) consumed[j] += oThick[i];
        kind[j] = BOUNDARY.OO;
      } else if (cont.length === 1) {                       // OC
        keep = cont[0];
        for (const i of oce) consumed[j] += oThick[i];
        kind[j] = BOUNDARY.OC;
      } else {                                              // CC (+ any ocean caught between)
        // One plate consistently overrides the other along the whole front, so the suture
        // stays a line instead of a per-cell fractal mix: the plate with more continental
        // crust wins; a craton always wins over non-craton crust on the other side.
        keep = cont.reduce((a, b) => {
          if (oCraton[b] !== oCraton[a]) return oCraton[b] > oCraton[a] ? b : a;
          const wa = world.plates[oPlate[a]]?.stats?.contArea ?? oThick[a], wb = world.plates[oPlate[b]]?.stats?.contArea ?? oThick[b];
          return wb > wa || (wb === wa && oPlate[b] < oPlate[a]) ? b : a;
        });
        for (const i of cont) if (i !== keep) excess[j] += oThick[i];
        for (const i of oce) consumed[j] += oThick[i];
        kind[j] = BOUNDARY.CC;
      }
      copy(keep, j);
      overriding[j] = oPlate[keep];
    }

    tick('resolve');
    // 3b. Relocate same-plate extras into nearby gaps of their plate. Where no
    //     gap exists the plate is under compression there: continental crust
    //     becomes shortening excess at its landing cell (conserved), oceanic
    //     crust is consumed.
    let shortened = 0, farPairs = 0, farMaxCells = 0;
    const nb1 = radiusNeighbors(world, p.relocateRadiusCells * spacingRad);
    const nb2 = radiusNeighbors(world, 2 * p.relocateRadiusCells * spacingRad);
    const nPlate = next['crust.plateId'], nType = next['crust.type'];
    // Gaps, each tagged with the plate of its nearest filled neighbour, so a far
    // relocation never crosses a plate boundary.
    const gapList = [], gapPlate = new Int32Array(n).fill(-2);
    for (let j = 0; j < n; j++) {
      if (filled[j]) continue;
      let best = -1, bestD = Infinity;
      for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) {
        const c = nb2.idx[k];
        if (filled[c] === 1 && nb2.dist[k] < bestD) { bestD = nb2.dist[k]; best = c; }
      }
      gapList.push(j); gapPlate[j] = best >= 0 ? nPlate[best] : -2;
    }
    // Adjacent gaps are taken regardless of whose neighbourhood they are (zero-mean
    // noise at ridges); anything farther must be a gap of the same plate, and the
    // search never goes beyond farRadiusCells — a duplicate at a trench with no gap
    // behind it is shortening, not something to teleport to the plate's ridge.
    const nearestGap = (nb, j, plate) => {
      let best = -1, bestD = Infinity;
      for (let k = nb.offset[j], ke = nb.offset[j + 1]; k < ke; k++) {
        const c = nb.idx[k];
        if (!filled[c] && nb.dist[k] < bestD && (plate === -3 || gapPlate[c] === plate)) { bestD = nb.dist[k]; best = c; }
      }
      return best;
    };
    const farR = p.farRadiusCells * spacingRad;
    // Plate of a cell's filled nb1 neighbourhood if it is all one plate, else -2 (mixed / none).
    const interiorOf = (j) => {
      let plate = -2;
      for (let k = nb1.offset[j], ke = nb1.offset[j + 1]; k < ke; k++) {
        const c = nb1.idx[k];
        if (c === j || filled[c] !== 1) continue;
        if (plate === -2) plate = nPlate[c]; else if (plate !== nPlate[c]) return -2;
      }
      return plate;
    };
    // Add massKm of continental crust to the same-plate continental cells around j (nb2).
    const nThick = next['crust.thickness'];
    const foldInto = (j, plate, massKm) => {
      let k0 = nb2.offset[j], k1 = nb2.offset[j + 1], cnt = 0;
      for (let k = k0; k < k1; k++) { const c = nb2.idx[k]; if (filled[c] === 1 && nPlate[c] === plate && nType[c] === CRUST.CONTINENTAL) cnt++; }
      if (!cnt) { excess[j] += massKm; return; }
      mFold += massKm;
      for (let k = k0; k < k1; k++) { const c = nb2.idx[k]; if (filled[c] === 1 && nPlate[c] === plate && nType[c] === CRUST.CONTINENTAL) nThick[c] += massKm / cnt; }
    };
    let interior = 0, dilated = 0, mFold = 0, mDilateIn = 0, mDilateOut = 0;
    // Greedy order matters: a duplicate whose gap is adjacent should claim it before a
    // farther one takes it. Sort by nearest-gap distance (all gaps are still free here).
    const gapDist = new Float32Array(relocate.length);
    for (let r = 0; r < relocate.length; r++) {
      const j = dest[relocate[r]];
      let d = Infinity;
      for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) if (!filled[nb2.idx[k]] && nb2.dist[k] < d) d = nb2.dist[k];
      gapDist[r] = d;
    }
    const order = new Int32Array(relocate.length);
    for (let r = 0; r < order.length; r++) order[r] = r;
    order.sort((a, b) => gapDist[a] - gapDist[b]);
    for (let r = 0; r < order.length; r++) {
      const i = relocate[order[r]];
      // Search around where the cell LANDED (its destination), not where it came from.
      const j = dest[i], plate = oPlate[i];
      let best = nearestGap(nb1, j, -3);
      if (best < 0) best = nearestGap(nb2, j, plate);
      if (best < 0) {
        let bestD = Infinity;
        locator.forEachWithin(xyz[3 * j], xyz[3 * j + 1], xyz[3 * j + 2], farR, (c, d) => {
          if (!filled[c] && gapPlate[c] === plate && d < bestD) { bestD = d; best = c; }
        });
        if (best >= 0) { farPairs++; farMaxCells = Math.max(farMaxCells, bestD / spacingRad); }
      }
      if (best >= 0) { copy(i, best); continue; }
      // No partner. If the landing cell's neighbourhood is entirely this plate, this is
      // interior rounding compression: fold the crust into same-plate neighbours (exact)
      // rather than inventing a collision. Otherwise it is shortening at a boundary.
      if (interiorOf(j) === plate) {
        interior++;
        if (oType[i] === CRUST.CONTINENTAL) foldInto(j, plate, oThick[i]);
        continue;                                          // oceanic interior compression just vanishes
      }
      shortened++;
      if (oType[i] === CRUST.CONTINENTAL) {
        excess[j] += oThick[i];
        if (kind[j] === BOUNDARY.NONE) { kind[j] = BOUNDARY.CC; overriding[j] = oPlate[i]; }
      } else {
        consumed[j] += oThick[i];
        if (kind[j] === BOUNDARY.NONE) { kind[j] = BOUNDARY.OO; overriding[j] = oPlate[i]; }
      }
    }

    tick('relocate');
    // 5. Remaining gaps → new ocean floor of the nearest filled cell's plate.
    const newOcean = (j, plate) => {
      nPlate[j] = plate; nType[j] = CRUST.OCEANIC;
      next['crust.thickness'][j] = p.oceanThicknessKm; next['crust.ageMa'][j] = 0;
      next['crust.terraneId'][j] = -1; next['crust.isCraton'][j] = 0;
      next['crust.orogenAge'][j] = 3000; next['crust.sediment'][j] = 0;
      next['crust.posX'][j] = xyz[3 * j]; next['crust.posY'][j] = xyz[3 * j + 1]; next['crust.posZ'][j] = xyz[3 * j + 2];
    };
    let gaps = 0, orphans = 0;
    for (const nb of [nb1, nb2]) {
      for (const j of gapList) {
        if (filled[j]) continue;
        let best = -1, bestD = Infinity, plates = 0, p0 = -2;
        for (let k = nb.offset[j], ke = nb.offset[j + 1]; k < ke; k++) {
          const c = nb.idx[k];
          if (filled[c] !== 1) continue;
          if (nb.dist[k] < bestD) { bestD = nb.dist[k]; best = c; }
          if (p0 === -2) { p0 = nPlate[c]; plates = 1; } else if (nPlate[c] !== p0 && plates === 1) plates = 2;
        }
        if (best < 0) continue;
        if (plates >= 2) { newOcean(j, nPlate[best]); kind[j] = BOUNDARY.DIVERGENT; filled[j] = 2; gaps++; continue; }
        // Interior hole: rounding dilation. Copy the nearest same-plate neighbour AS IT IS
        // NOW (new layout — `copy` reads old-layout sources and must not be used here), then
        // for continental crust take the thickness from the surrounding cells so mass is exact.
        for (const f of CRUST_FIELDS) next[f][j] = next[f][best];
        next['crust.posX'][j] = xyz[3 * j]; next['crust.posY'][j] = xyz[3 * j + 1]; next['crust.posZ'][j] = xyz[3 * j + 2];
        if (nType[j] === CRUST.CONTINENTAL) {
          let sum = 0, cnt = 0;
          for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) { const c = nb2.idx[k]; if (c !== j && filled[c] === 1 && nPlate[c] === p0 && nType[c] === CRUST.CONTINENTAL) { sum += nThick[c]; cnt++; } }
          if (!cnt) { newOcean(j, p0); kind[j] = BOUNDARY.NONE; filled[j] = 2; gaps++; continue; }   // no continental crust to dilate from
          // Each donor gives at most half of what it has (donors can be shared between holes);
          // the hole receives exactly what was collected, so mass is exact and nothing goes negative.
          const share = sum / cnt / cnt;
          let taken = 0;
          for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) {
            const c = nb2.idx[k];
            if (c !== j && filled[c] === 1 && nPlate[c] === p0 && nType[c] === CRUST.CONTINENTAL) { const g = Math.min(share, 0.5 * nThick[c]); nThick[c] -= g; taken += g; }
          }
          nThick[j] = taken; mDilateIn += taken; mDilateOut += taken;
        }
        filled[j] = 3; dilated++;
      }
    }
    for (const j of gapList) { if (filled[j]) continue; newOcean(j, -1); filled[j] = 2; orphans++; }

    tick('gapFill');
    // 6. Commit.
    for (const f of CRUST_FIELDS) ctx.write(f).set(next[f]);
    let massAfter = 0;
    for (let i = 0; i < n; i++) if (nType[i] === CRUST.CONTINENTAL) massAfter += next['crust.thickness'][i];
    for (let i = 0; i < n; i++) massAfter += excess[i];
    ctx.diag('massBeforeKm', new Float32Array([massBefore]));
    ctx.diag('massAfterKm', new Float32Array([massAfter]));
    ctx.diag('counts', new Float32Array([relocate.length, shortened, gaps, orphans, farPairs, farMaxCells, interior, dilated]));
    ctx.diag('massFlows', new Float32Array([mFold, mDilateIn, mDilateOut]));
    // How far particles sit from the cell that stores them, in cells: [≤0.7, ≤1.5, ≤3, >3].
    {
      const px = next['crust.posX'], py = next['crust.posY'], pz = next['crust.posZ'], h = new Float32Array(4);
      for (let i = 0; i < n; i++) {
        const d = Math.acos(Math.min(1, px[i] * xyz[3 * i] + py[i] * xyz[3 * i + 1] + pz[i] * xyz[3 * i + 2])) / spacingRad;
        h[d <= 0.7 ? 0 : d <= 1.5 ? 1 : d <= 3 ? 2 : 3]++;
      }
      ctx.diag('storageOffsetCells', h);
    }
    tick('commit');
    ctx.diag('sectionMs', new Float32Array(T.slice(1).map(([, t], k) => t - T[k][1])));
    ctx.diag('sectionNames', T.slice(1).map(([l]) => l));
  },
});
