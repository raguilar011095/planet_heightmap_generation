// The land the Frame is built on (plans/GENERATE_REDESIGN_PLAN.md G2c). Since G2c it is the pieces' own (owner,
// 2026-11-03: "at higher detail and irregularity we are loosing some of the interesting coastlines and shapes that the
// plates create naturally and everything is looking uniformly blobby"): G2 had smoothed the pieces' land over ~360 km
// and grown it into the sea, which kept no shape the pieces made. Now the continental crust is the land pieces exactly,
// and on Generate's own mesh the ground is held to them (present/hold.js): a land piece never deeper than a shelf, an
// ocean piece never above the sea but where orogeny raised it — so the coast and the shelf's edge follow the pieces'
// outlines at whatever Detail and Irregularity draw them. (The fore-arc before a trench along a coast is drowned there
// too, on the pieces' own outline.)

/**
 * @param {Object} L  the layout (present/layout.js)   @param {Uint8Array} landNow  the pieces' land per cell, as edited
 * @param {Int16Array} [cellPlate]  each cell's plate (present/plates.js): a passive coast is carried a cell out
 * @returns {Uint8Array} the land
 */
export function naturalCoast(L, landNow, cellPlate = null) {
    const { mesh } = L, n = mesh.numRegions, { adjOffset, adjList } = mesh;
    const out = landNow.slice();
    if (!cellPlate) return out;
    // a passive coast carried a cell out to sea: Evolution's terrain draws a strip of its coastal lowland under the sea,
    // so with the land a cell further out its coast falls about the pieces' outline — where the hold (present/hold.js)
    // stops it — and Land Coverage holds. Not beside another plate, nor where two landmasses would meet (the Continents
    // slider keeps them apart)
    const mass = new Int32Array(n).fill(-1);
    for (let s = 0, id = 0; s < n; s++) {
        if (!landNow[s] || mass[s] >= 0) continue;
        const q = [s]; mass[s] = id;
        while (q.length) { const c = q.pop(); for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (landNow[nb] && mass[nb] < 0) { mass[nb] = id; q.push(nb); } } }
        id++;
    }
    const grown = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) {
        if (landNow[c]) continue;
        let m = -1, ok = true;
        for (let k = adjOffset[c]; k < adjOffset[c + 1] && ok; k++) {
            const nb = adjList[k];
            if (cellPlate[nb] !== cellPlate[c]) ok = false;
            else if (landNow[nb]) { if (m >= 0 && mass[nb] !== m) ok = false; m = mass[nb]; }
        }
        if (ok && m >= 0) grown[c] = m;
    }
    for (let c = 0; c < n; c++) {
        if (grown[c] < 0) continue;
        let ok = true;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (grown[nb] >= 0 && grown[nb] !== grown[c]) { ok = false; break; } }
        if (ok) out[c] = 1;
    }
    return out;
}
