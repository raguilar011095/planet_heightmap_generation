// Sphere mesh construction: Fibonacci sphere → Delaunay → close pole → SphereMesh.
// Adapted from Red Blob Games sphere-mesh.js.

import Delaunator from 'delaunator';

// Fibonacci sphere with jitter — evenly-distributed points using the
// Fibonacci spiral. Jitter randomises positions for more organic Voronoi cells.
export function generateFibonacciSphere(N, jitter, rng) {
    const r_xyz = new Float32Array(3 * N);
    const s = 3.6 / Math.sqrt(N);
    const dlong = Math.PI * (3 - Math.sqrt(5));
    const dz = 2.0 / N;

    for (let k = 0, lng = 0, z = 1 - dz / 2; k < N; k++, z -= dz) {
        const r = Math.sqrt(1 - z * z);
        let latDeg = Math.asin(z) * 180 / Math.PI;
        let lonDeg = lng * 180 / Math.PI;

        if (jitter > 0) {
            const jLat = (rng() - rng());
            const jLon = (rng() - rng());
            const nextZ = Math.max(-1, z - dz * 2 * Math.PI * r / s);
            latDeg += jitter * jLat * (latDeg - Math.asin(nextZ) * 180 / Math.PI);
            lonDeg += jitter * jLon * (s / r * 180 / Math.PI);
        }

        const latR = latDeg * Math.PI / 180;
        const lonR = lonDeg * Math.PI / 180;
        r_xyz[3*k]   = Math.cos(latR) * Math.cos(lonR);
        r_xyz[3*k+1] = Math.cos(latR) * Math.sin(lonR);
        r_xyz[3*k+2] = Math.sin(latR);

        lng += dlong;
    }
    return r_xyz;
}

// Stereographic projection (for Delaunay on a sphere).
// Projects every point from the "north pole" (0,0,1) onto a plane.
export function stereographicProjection(r_xyz, N) {
    const flat = new Float64Array(2 * N);
    for (let i = 0; i < N; i++) {
        const z = r_xyz[3*i+2];
        // Clamp denominator to prevent Infinity when a jittered point lands
        // on or near the projection pole (z ≈ 1). The exact projected position
        // doesn't matter for near-pole points — addPoleToMesh corrects connectivity.
        const denom = Math.max(1e-12, 1 - z);
        flat[2*i]   = r_xyz[3*i]   / denom;
        flat[2*i+1] = r_xyz[3*i+1] / denom;
    }
    return flat;
}

// Add pole back into mesh — close the mesh by connecting hull edges to the pole.
export function addPoleToMesh(poleId, triangles, halfedges) {
    const numSides = triangles.length;
    const next = s => (s % 3 === 2) ? s - 2 : s + 1;

    let numUnpaired = 0, firstUnpaired = -1;
    const pointToSide = [];
    for (let s = 0; s < numSides; s++) {
        if (halfedges[s] === -1) {
            numUnpaired++;
            pointToSide[triangles[s]] = s;
            firstUnpaired = s;
        }
    }

    const nt = new Int32Array(numSides + 3 * numUnpaired);
    const nh = new Int32Array(numSides + 3 * numUnpaired);
    nt.set(triangles);
    nh.set(halfedges);

    for (let i = 0, s = firstUnpaired;
         i < numUnpaired;
         i++, s = pointToSide[nt[next(s)]]) {
        const ns = numSides + 3 * i;
        nh[s] = ns;
        nh[ns] = s;
        nt[ns]     = nt[next(s)];
        nt[ns + 1] = nt[s];
        nt[ns + 2] = poleId;
        const k = numSides + (3 * i + 4) % (3 * numUnpaired);
        nh[ns + 2] = k;
        nh[k]      = ns + 2;
    }

    return { triangles: nt, halfedges: nh };
}

// Lightweight dual-mesh helper wrapping Delaunator output.
// Regions = Voronoi cells, Triangles = Delaunay triangles, Sides = half-edges.
export class SphereMesh {
    constructor(triangles, halfedges, numRegions) {
        this.triangles = triangles;
        this.halfedges = halfedges;
        this.numRegions = numRegions;
        this.numSides = triangles.length;
        this.numTriangles = (triangles.length / 3) | 0;

        this._r_s = new Int32Array(numRegions).fill(-1);
        for (let s = 0; s < this.numSides; s++) {
            const r = triangles[s];
            if (this._r_s[r] === -1) this._r_s[r] = s;
        }

        // Pre-compute flat adjacency lists for r_circulate_r and r_circulate_t.
        // Replaces per-call half-edge traversal with cache-friendly array reads.
        const adjCount = new Int32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            const s0 = this._r_s[r];
            if (s0 === -1) continue;
            let s = s0;
            do {
                adjCount[r]++;
                s = this._next(this.halfedges[s]);
            } while (s !== s0);
        }

        this._adjOffset = new Int32Array(numRegions + 1);
        for (let r = 0; r < numRegions; r++) {
            this._adjOffset[r + 1] = this._adjOffset[r] + adjCount[r];
        }

        const totalAdj = this._adjOffset[numRegions];
        this._adjList = new Int32Array(totalAdj);   // neighbor regions
        this._adjTriList = new Int32Array(totalAdj); // neighbor triangles

        for (let r = 0; r < numRegions; r++) {
            const s0 = this._r_s[r];
            if (s0 === -1) continue;
            let s = s0;
            let idx = this._adjOffset[r];
            do {
                this._adjList[idx] = this.s_end_r(s);
                this._adjTriList[idx] = this.s_inner_t(s);
                idx++;
                s = this._next(this.halfedges[s]);
            } while (s !== s0);
        }
    }

    _next(s)    { return (s % 3 === 2) ? s - 2 : s + 1; }
    s_begin_r(s){ return this.triangles[s]; }
    s_end_r(s)  { return this.triangles[this._next(s)]; }
    s_inner_t(s){ return (s / 3) | 0; }
    s_outer_t(s){ return (this.halfedges[s] / 3) | 0; }

    r_circulate_r(out, r) {
        const start = this._adjOffset[r];
        const end = this._adjOffset[r + 1];
        const len = end - start;
        out.length = len;
        for (let i = 0; i < len; i++) out[i] = this._adjList[start + i];
        return out;
    }

    r_circulate_t(out, r) {
        const start = this._adjOffset[r];
        const end = this._adjOffset[r + 1];
        const len = end - start;
        out.length = len;
        for (let i = 0; i < len; i++) out[i] = this._adjTriList[start + i];
        return out;
    }
}

// Build sphere — Fibonacci points → Delaunay → close pole.
export function buildSphere(N, jitter, rng) {
    const r_xyz = generateFibonacciSphere(N, jitter, rng);
    const flat = stereographicProjection(r_xyz, N);
    const delaunay = new Delaunator(flat);

    const poleXYZ = new Float32Array(3 * (N + 1));
    poleXYZ.set(r_xyz);
    poleXYZ[3*N] = 0;  poleXYZ[3*N+1] = 0;  poleXYZ[3*N+2] = 1;

    const closed = addPoleToMesh(N, delaunay.triangles, delaunay.halfedges);
    const mesh = new SphereMesh(closed.triangles, closed.halfedges, N + 1);
    return { mesh, r_xyz: poleXYZ };
}

// Triangle centres (= Voronoi vertices on the sphere).
export function generateTriangleCenters(mesh, r_xyz) {
    const { numTriangles } = mesh;
    const t_xyz = new Float32Array(3 * numTriangles);
    for (let t = 0; t < numTriangles; t++) {
        const s0 = 3 * t;
        const a = mesh.s_begin_r(s0),
              b = mesh.s_begin_r(s0 + 1),
              c = mesh.s_begin_r(s0 + 2);
        t_xyz[3*t]   = (r_xyz[3*a] + r_xyz[3*b] + r_xyz[3*c]) / 3;
        t_xyz[3*t+1] = (r_xyz[3*a+1]+r_xyz[3*b+1]+r_xyz[3*c+1]) / 3;
        t_xyz[3*t+2] = (r_xyz[3*a+2]+r_xyz[3*b+2]+r_xyz[3*c+2]) / 3;
    }
    return t_xyz;
}
