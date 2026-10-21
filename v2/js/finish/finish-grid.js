// A lat-lon grid for the finish's smooth, regional fields (an ice sheet's surface, its rebound, sand seas' surroundings,
// loess): a mesh's cells averaged onto it, blurred by a radius in km (rows narrower toward the poles), sampled back
// bilinearly. The same cost at every terrain detail, and the same result: its cells are fixed in degrees.

const KM_PER_DEG = 6371 * Math.PI / 180;

export class LatLonGrid {
    /** @param {number} stepDeg  cell size (degrees) */
    constructor(stepDeg = 0.25) {
        this.step = stepDeg; this.w = Math.round(360 / stepDeg); this.h = Math.round(180 / stepDeg); this.size = this.w * this.h;
    }
    /** The grid cell of a latitude, longitude (degrees). */
    index(lat, lon) {
        const i = Math.min(this.w - 1, Math.max(0, Math.floor((lon + 180) / this.step))), j = Math.min(this.h - 1, Math.max(0, Math.floor((90 - lat) / this.step)));
        return j * this.w + i;
    }
    /**
     * The mean of `values` over the cells in each grid cell (cells with weight 0 — or `use(c)` false — left out);
     * NaN where none fell. @returns {Float32Array}
     */
    average(lat, lon, values, use = null) {
        const s = new Float64Array(this.size), k = new Float64Array(this.size), n = lat.length;
        for (let c = 0; c < n; c++) { if (use && !use(c)) continue; const g = this.index(lat[c], lon[c]); s[g] += values[c]; k[g]++; }
        const out = new Float32Array(this.size);
        for (let g = 0; g < this.size; g++) out[g] = k[g] ? s[g] / k[g] : NaN;
        return out;
    }
    /**
     * Several fields' means at once, each cell's value read through `map` (fields[k][map[c]]: a sim cell's record, say) —
     * as average() is for each, in one pass over the cells. @returns {Float32Array[]}
     */
    averageMapped(lat, lon, map, fields, use = null) {
        const F = fields.length, s = fields.map(() => new Float64Array(this.size)), k = new Float64Array(this.size), n = lat.length;
        for (let c = 0; c < n; c++) {
            if (use && !use(c)) continue;
            const g = this.index(lat[c], lon[c]), m = map[c];
            k[g]++;
            for (let f = 0; f < F; f++) s[f][g] += fields[f][m];
        }
        return s.map(sf => { const out = new Float32Array(this.size); for (let g = 0; g < this.size; g++) out[g] = k[g] ? sf[g] / k[g] : NaN; return out; });
    }
    /**
     * Blur (three box passes ≈ a Gaussian of std radiusKm) over the cells that have a value; cells without one take the
     * blurred value of those around (or stay NaN if none within reach). @returns {Float32Array}
     */
    blur(field, radiusKm) { return this.blurMany([field], radiusKm)[0]; }
    /**
     * Several fields blurred as blur() blurs each — the same values — when they have values in the same cells (means of the
     * same cells: averageMapped's): the weights' running sums made once for all of them. @returns {Float32Array[]}
     */
    blurMany(fields, radiusKm) {
        const { w, h } = this, wt = new Float64Array(this.size), first = fields[0];
        for (let g = 0; g < this.size; g++) if (first[g] === first[g]) wt[g] = 1;
        // a box of half-width r three times over has σ² = r(r+1): r for σ = radiusKm
        const rOf = km => Math.max(0, Math.round((-1 + Math.sqrt(1 + 4 * (km * km))) / 2));
        const rowR = new Int32Array(h);
        for (let j = 0; j < h; j++) { const lat = 90 - (j + 0.5) * this.step, kmPer = KM_PER_DEG * this.step * Math.max(0.02, Math.cos(lat * Math.PI / 180)); rowR[j] = Math.min(w >> 1, rOf(radiusKm / kmPer)); }
        const colR = rOf(radiusKm / (KM_PER_DEG * this.step));
        const tmp = new Float64Array(Math.max(w, h));
        // (the columns' running sums side by side, a row at a time — memory in order — each row's values as they were
        // kept in a ring until the window leaves them: the same sums, in the same order, as column by column)
        const R = colR + 1, ring = new Float64Array(R * w), S = new Float64Array(w);
        // (one array's three passes: the values' and the weights' sums never mix, so each is blurred on its own)
        const run = v => {
            for (let pass = 0; pass < 3; pass++) {
                for (let j = 0; j < h; j++) {                         // along each row (longitude wraps)
                    const r = rowR[j]; if (!r) continue;
                    const o = j * w; let sv = 0;
                    for (let d = -r; d <= r; d++) { const i = d < 0 ? d + w : d; sv += v[o + i]; }
                    for (let i = 0; i < w; i++) {
                        tmp[i] = sv;
                        const out = i - r < 0 ? i - r + w : i - r, inn = i + r + 1 >= w ? i + r + 1 - w : i + r + 1;
                        sv += v[o + inn] - v[o + out];
                    }
                    for (let i = 0; i < w; i++) v[o + i] = tmp[i] / (2 * r + 1);
                }
                if (colR) {                                          // along each column (clamped at the poles)
                    S.fill(0);
                    let cnt = 0;
                    for (let d = 0; d <= colR && d < h; d++) { const o = d * w; for (let i = 0; i < w; i++) S[i] += v[o + i]; cnt++; }
                    for (let j = 0; j < h; j++) {
                        const o = j * w, add = j + colR + 1, drop = j - colR, ra = add * w, rd = (drop % R) * w, rs = (j % R) * w, c = cnt;
                        for (let i = 0; i < w; i++) {
                            const ov = S[i] / c;
                            if (add < h) S[i] += v[ra + i];
                            if (drop >= 0) S[i] -= ring[rd + i];
                            ring[rs + i] = v[o + i];
                            v[o + i] = ov;
                        }
                        if (add < h) cnt++;
                        if (drop >= 0) cnt--;
                    }
                }
            }
        };
        run(wt);
        return fields.map(field => {
            const v = new Float64Array(this.size);
            for (let g = 0; g < this.size; g++) if (field[g] === field[g]) v[g] = field[g];
            run(v);
            const out = new Float32Array(this.size);
            for (let g = 0; g < this.size; g++) out[g] = wt[g] > 1e-6 ? v[g] / wt[g] : NaN;
            return out;
        });
    }
    /** A grid field at each cell (bilinear; NaN grid cells fall back to the nearest of the four that has a value). */
    sample(field, lat, lon, out = new Float32Array(lat.length)) {
        const { w, h, step } = this;
        for (let c = 0; c < lat.length; c++) out[c] = this.at(field, lat[c], lon[c]);
        return out;
    }
    /** The four grid cells around a place and their bilinear weights (into idx, wts: four each), to read several fields
     *  there with atCorners — the same values at() gives. */
    corners(lat, lon, idx, wts) {
        const { w, h, step } = this;
        const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
        idx[0] = y0 * w + i0; idx[1] = y0 * w + i1; idx[2] = j1 * w + i0; idx[3] = j1 * w + i1;
        wts[0] = (1 - fx) * (1 - fy); wts[1] = fx * (1 - fy); wts[2] = (1 - fx) * fy; wts[3] = fx * fy;
    }
    atCorners(field, idx, wts) {
        let s = 0, k = 0;
        for (let j = 0; j < 4; j++) { const v = field[idx[j]]; if (v === v) { s += v * wts[j]; k += wts[j]; } }
        return k > 1e-9 ? s / k : NaN;
    }
    at(field, lat, lon) {
        const { w, h, step } = this;
        const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
        const a = field[y0 * w + i0], b = field[y0 * w + i1], c = field[j1 * w + i0], d = field[j1 * w + i1];
        let s = 0, k = 0;
        if (a === a) { s += a * (1 - fx) * (1 - fy); k += (1 - fx) * (1 - fy); }
        if (b === b) { s += b * fx * (1 - fy); k += fx * (1 - fy); }
        if (c === c) { s += c * (1 - fx) * fy; k += (1 - fx) * fy; }
        if (d === d) { s += d * fx * fy; k += fx * fy; }
        return k > 1e-9 ? s / k : NaN;
    }
}
