// Ocean stage: wind-driven currents, and the heat they move — for the temperature stage. DOM-free.
//
//  • Gyres. The wind's stress on the sea, curled, drives a steady circulation: in the open ocean the Sverdrup
//    balance, closed by a narrow, fast current along each basin's western edge (Stommel's model:
//    r∇²Ψ + β ∂Ψ/∂x = curl τ / ρ₀ for the transport streamfunction Ψ, Ψ fixed along every coast). This gives the
//    Gulf Stream and the Kuroshio, and cold equatorward currents on the eastern side, on any map.
//  • Circumpolar channels. Where a whole latitude band is open sea (the Southern Ocean on Earth), the westerlies
//    drive an eastward current round the planet, balanced by friction; the landmasses on either side then sit at
//    different Ψ, which lets that current through.
//  • Heat. Currents carry the surface temperature: warm water poleward along western edges, cold water equatorward
//    along eastern ones (advective heating, from the currents and the sea temperature). Where the winds push
//    surface water away (Ekman transport — along coasts with the coast on the left in the north, at the equator),
//    cold water wells up from below. Both become a heat source / sink for the sea's mixed layer, which the
//    temperature stage adds to its energy balance; the winds carry the result inland (a mild Europe, cool
//    California and Namib coasts).
//  • Seasons (plans/V1_NEW_CLIMATE_PLAN.md, "Seasonal currents"). The model is linear in the wind stress, so it is solved
//    for the year's mean stress and for its annual cycle (the first harmonic, two more solves), and each month's
//    gyres are the mean plus that month's part of the cycle. Real gyres adjust to the wind over months near the
//    equator but years at midlatitudes (the planetary waves that set them up are slow there), so the seasonal part is
//    whole in the tropics and fades out poleward (OCEAN_SEASON_FULL_DEG → OCEAN_SEASON_ZERO_DEG): the monsoon seas'
//    currents reverse (the Somali Current), the equatorial currents swell and ebb, the great gyres hold steady. The
//    Ekman transport answers each month's wind at once at every latitude, so the upwelling follows the month (the
//    summer monsoon's cold Arabian Sea, California's spring and summer). The heat they carry is monthly too.
//  • The overturning. Warm surface water also flows poleward to the seas that open onto the polar ocean, sinks there
//    and gives up its heat (the North Atlantic Drift: a mild north-west Europe, an ice-free Norwegian Sea). It forms in
//    a hemisphere's seas that reach the polar ocean through open water from the midlatitudes (the Atlantic through the
//    Nordic seas; little to the Pacific, behind the narrow Bering Strait) and not beyond a circumpolar channel (its current
//    blocks the way, as the Antarctic Circumpolar Current does). The water gives its heat up all along its way to the
//    polar sea (the subpolar and Nordic seas, the Barents Sea), and little in the polar sea itself: there it sinks
//    below a cold, fresh surface layer (the Arctic's halocline) that keeps its heat from the ice.

import { LatLonGrid, coarsenField, refineField, refineForDrawing } from './grid.js';
import { HelmholtzSolver } from './solver.js';
import { PARAMS } from './config.js';

const OMEGA_ROT = 7.292e-5;
const R_PLANET = 6.371e6;
const RHO_AIR = 1.2, RHO_SEA = 1025, CP_SEA = 3990;
const DRAG_COEFF = 1.3e-3;           // air–sea drag coefficient
const DEG = Math.PI / 180;
const CARRY_TRACE_KM = 1500;         // how far back a current's water keeps the temperature of where it came from …
const CARRY_CALM_MS = 0.005;         // … faded where the surface current is below about this (m/s)
const MOC_FROM_DEG = 40;             // the overturning's heat is released poleward of this latitude …
const MOC_FULL_DEG = 55;             // … fully from here …
const MOC_POLAR_DEG = 75;            // … in seas connected to the polar sea (poleward of this) …
const MOC_REACH_KM = 2500;           // … all along the way there from MOC_FROM_DEG, less in seas off the way (e-folding
                                     //   per km of detour by sea) …
const MOC_POLAR_FADE_KM = 600;       // … and fading past MOC_POLAR_DEG into the polar sea (e-folding), where the water
                                     //   sinks below a cold, fresh surface layer (Atlantic water under the Arctic halocline)
const MOC_GATEWAY_KM = 300;          // … through gateways about this wide or wider (the Fram Strait ≈ 450 km, the Barents
                                     //   opening ≈ 750); narrower straits (Bering, 85 km) pass on less of it

/**
 * stage(ctx, circulation, temperature) → { psi (G, Sv), u, v (G, surface current m/s, annual), qflux (G, W/m², annual:
 * advection + upwelling + overturning), carried (G, °C: the latitude-average sea temperature where each current's
 * water comes from, minus here), upwelling (G, m/day), monthly: { u, v, qflux, upwelling (12 × G, mid-month) }, channels,
 * ms }. Fields on the core grid; the annual ones are the months' means.
 */
/**
 * Heat of the overturning (W/m², G): per hemisphere without a circumpolar channel, the sea poleward of MOC_FROM_DEG
 * connected to the polar sea (≥ MOC_POLAR_DEG) gets the heat, weighted by a ramp from MOC_FROM_DEG to MOC_FULL_DEG,
 * by e^{−(distance by sea from where the water comes in at MOC_FROM_DEG + distance by sea from the polar sea)/
 * MOC_REACH_KM} — the same all along the way to the polar sea, less in the seas off it — and by e^{−(km past
 * MOC_POLAR_DEG)/MOC_POLAR_FADE_KM}: given up on the way (the subpolar and Nordic seas, the Barents Sea), little in the
 * polar sea itself. (Weighted by the distance from the polar sea alone, more than half of it went into the polar sea
 * north of 75°: ≈ 60 W/m² over the Arctic Ocean against an observed 2–4 under the ice (Maykut & Untersteiner 1971;
 * Krishfield & Perovich 2005) — an Arctic open from August to November, its coasts continental where they are tundra.)
 * (The same heat is taken from all the sea evenly, with the rest of the ocean's net, below: taking it from the
 * hemisphere's tropics alone cooled them enough to move the rain belts.)
 */
function overturningHeat(g, isSea, channels, pw) {
    const G = g.size, w = g.w, h = g.h, dRad = g.step * DEG;
    const q = new Float64Array(G);
    if (!(pw > 0)) return q;
    const area = (j) => R_PLANET * R_PLANET * dRad * dRad * Math.cos(g.lat[j] * DEG);
    const stepKm = g.step * 111.2;
    // distance by sea (breadth-first, ≈ km) from the cells in `queue`, over the sea cells `ok` allows; each step out of a
    // cell × cost(cell), if given
    const seaDistance = (queue, ok, cost = null) => {
        const dist = new Float64Array(G).fill(Infinity);
        for (const c of queue) dist[c] = 0;
        for (let k = 0; k < queue.length; k++) {
            const c = queue[k], j = Math.floor(c / w), i = c % w, f = cost ? cost(c) : 1;
            const nb = [j * w + (i + 1) % w, j * w + (i - 1 + w) % w, j > 0 ? c - w : -1, j < h - 1 ? c + w : -1];
            for (const n of nb) {
                if (n < 0 || !isSea[n] || !ok(n)) continue;
                const d = dist[c] + f * (n === c - w || n === c + w ? stepKm : stepKm * Math.cos(g.lat[j] * DEG));
                if (d < dist[n]) { dist[n] = d; queue.push(n); }
            }
        }
        return dist;
    };
    // Going on through narrow sea counts as farther: × (MOC_GATEWAY_KM / the sea's width there)², width ≈ twice the
    // distance from land — a strait narrower than a gateway passes the water on only in part (Bering, 85 km: the
    // Pacific's share falls from about a fifth to a tenth), smoothly, and where every way is narrow the heat still goes
    // the same ways as before.
    // (A step out of a cell costs that cell's narrowness, so the sea along a coast is reached at the open sea's cost.)
    const land = [];
    for (let c = 0; c < G; c++) if (!isSea[c]) land.push(c);
    const fromLand = seaDistance(land, () => true);
    const narrow = (c) => { const x = MOC_GATEWAY_KM / (2 * Math.max(1, fromLand[c])); return x > 1 ? x * x : 1; };
    for (const s of [1, -1]) {
        // a channel between the midlatitudes and the polar sea blocks it (an open polar cap is not one)
        if (channels.some(ch => [ch.jStart, ch.jEnd].some(jj => s * g.lat[jj] > 0 && s * g.lat[jj] < MOC_POLAR_DEG))) continue;
        // the seas poleward of MOC_FROM_DEG connected to the polar sea …
        const polar = [];
        for (let j = 0; j < h; j++) if (s * g.lat[j] >= MOC_POLAR_DEG) for (let i = 0; i < w; i++) { const c = j * w + i; if (isSea[c]) polar.push(c); }
        const fromPolar = seaDistance(polar, (n) => s * g.lat[Math.floor(n / w)] >= MOC_FROM_DEG, narrow);
        // … and in them, the distance from where the warm water comes in: their first row poleward of MOC_FROM_DEG. On the
        // way from there to the polar sea the two distances add up to the way's length; off it (a bay the current does
        // not run through) to more.
        const entry = [];
        for (let j = 0; j < h; j++) {
            const la = s * g.lat[j];
            if (la >= MOC_FROM_DEG && la < MOC_FROM_DEG + g.step) for (let i = 0; i < w; i++) { const c = j * w + i; if (fromPolar[c] < Infinity) entry.push(c); }
        }
        const along = seaDistance(entry, (n) => fromPolar[n] < Infinity, narrow);
        let wsum = 0;
        const wt = new Float64Array(G);
        for (let j = 0; j < h; j++) {
            const la = s * g.lat[j];
            const ramp = Math.max(0, Math.min(1, (la - MOC_FROM_DEG) / (MOC_FULL_DEG - MOC_FROM_DEG)));
            const into = Math.exp(-Math.max(0, la - MOC_POLAR_DEG) * 111.2 / MOC_POLAR_FADE_KM);
            for (let i = 0; i < w; i++) {
                const c = j * w + i; if (!isSea[c]) continue;
                if (la >= MOC_FROM_DEG && along[c] < Infinity) { wt[c] = ramp * ramp * (3 - 2 * ramp) * Math.exp(-(along[c] + fromPolar[c]) / MOC_REACH_KM) * into; wsum += wt[c] * area(j); }
            }
        }
        if (!(wsum > 0)) continue;
        const P = pw * 1e15;
        for (let j = 0; j < h; j++) { const la = s * g.lat[j]; for (let i = 0; i < w; i++) {
            const c = j * w + i; if (!isSea[c]) continue;
            if (wt[c] > 0) q[c] += P * wt[c] / wsum;
        } }
    }
    return q;
}

export function windDrivenOcean() {
    return (ctx, circ, temperature) => {
        const t0 = performance.now();
        const P = { ...PARAMS };
        const core = ctx.grid;
        const ratio = Math.round(P.OCEAN_GRID_DEG / core.step);
        const g = ratio > 1 ? new LatLonGrid(core.step * ratio) : core;
        const G = g.size, w = g.w, h = g.h;
        const co = (f) => coarsenField(core, g, ratio, f);
        const land = co(ctx.surface.landFrac);
        const isSea = new Uint8Array(G);
        for (let c = 0; c < G; c++) isSea[c] = land[c] < 0.5 ? 1 : 0;
        const dRad = g.step * DEG;
        const cosLat = Float64Array.from(g.lat, l => Math.cos(l * DEG));

        // ── Each month's wind stress (from the monthly winds: τ = ρ_a C_d |U| U) and sea temperature, and their means ──
        const tx = new Float64Array(G), ty = new Float64Array(G), sst = new Float64Array(G);
        const txM = new Float64Array(12 * G), tyM = new Float64Array(12 * G), sstM = new Float64Array(12 * G);
        const uM = new Float64Array(G), vM = new Float64Array(G), tM = new Float64Array(G);
        for (let m = 0; m < 12; m++) {
            uM.set(co(circ.u.subarray(m * core.size, (m + 1) * core.size)));
            vM.set(co(circ.v.subarray(m * core.size, (m + 1) * core.size)));
            tM.set(co(temperature.monthlySL.subarray(m * core.size, (m + 1) * core.size)));
            for (let c = 0; c < G; c++) {
                // bulk stress with the storms the monthly mean leaves out: the typical speed, not the mean vector's
                const s = Math.sqrt(uM[c] * uM[c] + vM[c] * vM[c] + P.OCEAN_GUST_MS * P.OCEAN_GUST_MS), k = m * G + c;
                txM[k] = RHO_AIR * DRAG_COEFF * s * uM[c]; tyM[k] = RHO_AIR * DRAG_COEFF * s * vM[c]; sstM[k] = Math.max(-1.8, tM[c]);
                tx[c] += txM[k] / 12; ty[c] += tyM[k] / 12; sst[c] += sstM[k] / 12;
            }
        }
        // the stress's annual cycle: its first harmonic, x(t) ≈ x̄ + 2(x₁ᵣ cos θ − x₁ᵢ sin θ), θ = 2πt/12, month m at t = m + ½
        const seasonal = P.OCEAN_SEASON_SCALE > 0;
        const phase = m => 2 * Math.PI * (m + 0.5) / 12;
        const tx1r = new Float64Array(G), tx1i = new Float64Array(G), ty1r = new Float64Array(G), ty1i = new Float64Array(G);
        if (seasonal) for (let m = 0; m < 12; m++) {
            const cm = Math.cos(phase(m)) / 12, sm = Math.sin(phase(m)) / 12;
            for (let c = 0; c < G; c++) { const k = m * G + c; tx1r[c] += txM[k] * cm; tx1i[c] -= txM[k] * sm; ty1r[c] += tyM[k] * cm; ty1i[c] -= tyM[k] * sm; }
        }

        // ── Wind-stress curl (N/m³) ──
        const curlOf = (sx, sy) => {
            const out = new Float64Array(G);
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.05, cosLat[j]);
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    const dtydl = (sy[j * w + (i + 1) % w] - sy[j * w + (i - 1 + w) % w]) / (2 * dRad);
                    const txN = j > 0 ? sx[c - w] * cosLat[j - 1] : sx[c] * cosLat[j], txS = j < h - 1 ? sx[c + w] * cosLat[j + 1] : sx[c] * cosLat[j];
                    const dtxdp = (txN - txS) / ((j > 0 && j < h - 1 ? 2 : 1) * dRad);
                    out[c] = (dtydl - dtxdp) / (R_PLANET * cj);
                }
            }
            return out;
        };
        const curl = curlOf(tx, ty);

        // ── Circumpolar channels: latitude rows that are open sea all round; eastward current, friction-balanced ──
        const openRow = new Uint8Array(h);
        for (let j = 0; j < h; j++) { let all = true; for (let i = 0; i < w && all; i++) all = isSea[j * w + i] === 1; openRow[j] = all ? 1 : 0; }
        // transport per row (m³/s) of the channel's zonal-mean wind stress over friction; psiRef[j]: the Ψ a landmass
        // takes if it lies just north of row j (from the south pole)
        const channelsOf = (sx) => {
            let psiAcc = 0;
            const psiRef = new Float64Array(h), channels = [];
            for (let j = h - 1; j >= 0; j--) {
                if (openRow[j]) {
                    let txm = 0; for (let i = 0; i < w; i++) txm += sx[j * w + i]; txm /= w;
                    const U = txm / (RHO_SEA * P.OCEAN_CHANNEL_DRAG);     // depth-integrated eastward transport per width (m²/s)
                    psiAcc -= U * R_PLANET * dRad;                         // Ψ decreases northward for eastward flow (U = −∂Ψ/∂y)
                    if (!channels.length || channels[channels.length - 1].jEnd !== j + 1) channels.push({ jStart: j, jEnd: j, transport: 0 });
                    const ch = channels[channels.length - 1]; ch.jEnd = j; ch.transport += U * R_PLANET * dRad;
                }
                psiRef[j] = psiAcc;
            }
            return { psiRef, channels };
        };
        const { channels } = channelsOf(tx);

        // ── Stommel: −r∇²Ψ − 2Ω ∂Ψ/∂λ = −a² curl τ / ρ₀ over the sea; Ψ held at its coast value on land ──
        // (the solver's form σΨ − D∇²Ψ + (γu·∇)Ψ = f on the unit sphere; the β term as an eastward "advection"
        // coefficient −2Ω·a·cos φ; land by a large σ pinning Ψ to the landmass's value)
        const r = P.OCEAN_FRICTION;
        const sigma = new Float64Array(G), zeroI = new Float64Array(G), gu = new Float64Array(G), gv = new Float64Array(G);
        const pin = 1e3 * r / (dRad * dRad);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const c = j * w + i;
            gu[c] = -2 * OMEGA_ROT * R_PLANET * cosLat[j];
            // land and the open channel rows are held at their Ψ (in a channel, the friction-balanced current)
            if (!(isSea[c] && !openRow[j])) sigma[c] = pin;
        }
        // friction: east–west sets the western boundary current's width; north–south kept small so the open ocean
        // keeps its Sverdrup balance (isotropic friction wide enough for the grid smears the gyres — Stommel box test)
        const solver = new HelmholtzSolver(g, P.OCEAN_FRICTION_NS, r);
        solver.setOperator(sigma, zeroI, gu, gv, 1);
        /** The gyres of a wind stress (linear in it): Ψ, and the depth-integrated transport U = −∂Ψ/∂y, V = ∂Ψ/∂x. */
        const gyres = (sx, sy, sCurl) => {
            const { psiRef } = channelsOf(sx);
            // Solve for the departure Ψ' from the held values (Ψ = Ψ_ref + Ψ'), so the convergence test measures the open
            // sea and not the large pinning terms: Ψ' = 0 where held, A·Ψ' = f − A·Ψ_ref over the sea.
            const f = new Float64Array(G), fi = new Float64Array(G);
            const psiRow = new Float64Array(G), psiRowI = new Float64Array(G), Aref = new Float64Array(G), ArefI = new Float64Array(G);
            for (let c = 0; c < G; c++) psiRow[c] = psiRef[Math.floor(c / w)];
            solver.apply(psiRow, psiRowI, Aref, ArefI);
            for (let c = 0; c < G; c++) f[c] = sigma[c] > 0 ? 0 : -R_PLANET * R_PLANET * sCurl[c] / RHO_SEA - Aref[c];
            const psi = new Float64Array(G), psiI = new Float64Array(G);
            // (to a millionth: the 1e-10 it had differed by a few millionths of a °C and no Köppen class on Earth or three
            // test planets, for ≈ 3 more V-cycles a solve)
            const stats = solver.solve(f, fi, psi, psiI, { maxCycles: 80, tol: 1e-6 });
            for (let c = 0; c < G; c++) psi[c] += psiRow[c];
            const U = new Float64Array(G), V = new Float64Array(G);
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.05, cosLat[j]);
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    if (!isSea[c]) continue;
                    const pn = j > 0 ? psi[c - w] : psi[c], ps = j < h - 1 ? psi[c + w] : psi[c];
                    U[c] = -(pn - ps) / ((j > 0 && j < h - 1 ? 2 : 1) * dRad * R_PLANET);
                    V[c] = (psi[j * w + (i + 1) % w] - psi[j * w + (i - 1 + w) % w]) / (2 * dRad * R_PLANET * cj);
                }
            }
            return { psi, U, V, stats };
        };
        const mean = gyres(tx, ty, curl), psi = mean.psi, U = mean.U, V = mean.V, solveStats = mean.stats;

        // ── Each month's currents: the mean, plus the month's part of the annual cycle where the gyres can follow it —
        // whole to OCEAN_SEASON_FULL_DEG, fading (smoothly) to nothing at OCEAN_SEASON_ZERO_DEG ──
        const UM = new Float64Array(12 * G), VM = new Float64Array(12 * G);
        for (let m = 0; m < 12; m++) { UM.set(U, m * G); VM.set(V, m * G); }
        if (seasonal) {
            const re = gyres(tx1r, ty1r, curlOf(tx1r, ty1r)), im = gyres(tx1i, ty1i, curlOf(tx1i, ty1i));
            const fade = new Float64Array(h);
            for (let j = 0; j < h; j++) {
                const x = Math.max(0, Math.min(1, (Math.abs(g.lat[j]) - P.OCEAN_SEASON_FULL_DEG) / Math.max(1e-6, P.OCEAN_SEASON_ZERO_DEG - P.OCEAN_SEASON_FULL_DEG)));
                fade[j] = P.OCEAN_SEASON_SCALE * (1 - x * x * (3 - 2 * x));
            }
            for (let m = 0; m < 12; m++) {
                const cm = 2 * Math.cos(phase(m)), sm = 2 * Math.sin(phase(m));
                for (let c = 0; c < G; c++) {
                    if (!isSea[c]) continue;
                    const k = m * G + c, fj = fade[Math.floor(c / w)];
                    UM[k] += fj * (re.U[c] * cm - im.U[c] * sm);
                    VM[k] += fj * (re.V[c] * cm - im.V[c] * sm);
                }
            }
        }

        // ── Heat: advection of the sea temperature by the currents, and upwelling ──
        // Across latitudes, what a current carries is relative: flowing poleward it brings the warmer water of the
        // latitudes it comes from, flowing equatorward the colder — so its heat is its north–south transport across
        // the gradient of the latitude's average sea temperature (smoothed over ≈ ±6°), not the model's own local
        // sea temperature (already evened out by the energy balance, which would carry almost nothing). East–west,
        // the local sea temperature (the equatorial currents carry the cold east Pacific west).
        const rowsOf = (sstF) => {
            const seaRow = new Float64Array(h), dTdy = new Float64Array(h);
            for (let j = 0; j < h; j++) { let s = 0, n = 0; for (let i = 0; i < w; i++) { const c = j * w + i; if (isSea[c]) { s += sstF[c]; n++; } } seaRow[j] = n ? s / n : NaN; }
            for (let j = 0; j < h; j++) if (!(seaRow[j] === seaRow[j])) { let jj = j; while (jj > 0 && !(seaRow[jj] === seaRow[jj])) jj--; seaRow[j] = seaRow[jj] === seaRow[jj] ? seaRow[jj] : 0; }
            const rowSm = new Float64Array(h), rSm = Math.max(1, Math.round(6 / g.step));
            for (let j = 0; j < h; j++) { let s = 0, n = 0; for (let d = -rSm; d <= rSm; d++) { const jj = j + d; if (jj >= 0 && jj < h) { s += seaRow[jj]; n++; } } rowSm[j] = s / n; }
            for (let j = 0; j < h; j++) { const jn = Math.max(0, j - 1), js = Math.min(h - 1, j + 1); dTdy[j] = (rowSm[jn] - rowSm[js]) / ((js - jn) * dRad * R_PLANET); }
            return { rowSm, dTdy };
        };
        const fMin = 2 * OMEGA_ROT * Math.sin(5 * DEG);
        /** The Ekman transport of a stress (m²/s; zero on land) and its divergence (m/s: upwelling where positive). */
        const ekmanOf = (sx, sy) => {
            const Mx = new Float64Array(G), My = new Float64Array(G), div = new Float64Array(G);
            for (let j = 0; j < h; j++) {
                let fc = 2 * OMEGA_ROT * Math.sin(g.lat[j] * DEG);
                if (Math.abs(fc) < fMin) fc = fc < 0 ? -fMin : fMin;
                // (near the equator a north–south stress drives a downwind drift, not a sideways one: its Ekman part fades
                // within OCEAN_EKMAN_TAUY_DEG — taken at face value with the clamped f, the monsoons' cross-equatorial
                // winds welled the east Indian Ocean up cold and set its winds and thermocline the Pacific's way round)
                const fadeY = 1 - Math.exp(-((g.lat[j] / P.OCEAN_EKMAN_TAUY_DEG) ** 2));
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    if (!isSea[c]) continue;
                    Mx[c] = fadeY * sy[c] / (RHO_SEA * fc); My[c] = -sx[c] / (RHO_SEA * fc);
                }
            }
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.05, cosLat[j]), dx = dRad * R_PLANET * cj, dy = dRad * R_PLANET;
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    if (!isSea[c]) continue;
                    const ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w, cn = j > 0 ? c - w : -1, cs = j < h - 1 ? c + w : -1;
                    // (land neighbours carry no Ekman transport)
                    div[c] = (Mx[ce] - Mx[cw]) / (2 * dx) + ((cn >= 0 ? My[cn] * cosLat[j - 1] : 0) - (cs >= 0 ? My[cs] * cosLat[j + 1] : 0)) / (2 * dy * cj);
                }
            }
            return { Mx, My, div };
        };

        // ── Coastal upwelling, over a zone of fixed width ──
        // At a coast, the Ekman transport straight offshore wells up within OCEAN_COAST_KM of it (the upwelling zone and
        // its filaments) — spread over however many cells that is, so its strength does not depend on the grid (counted
        // within the coastal cell alone, a 1° grid upwelled three times as hard as a 3° one). Each sea cell within the
        // zone takes its nearest coastal cell's upwelling (a search over the sea, once).
        const coastRings = Math.max(1, Math.round(P.OCEAN_COAST_KM * 1000 / (dRad * R_PLANET)));
        const coastOf = new Int32Array(G).fill(-1);
        {
            let front = [];
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i;
                if (!isSea[c]) continue;
                const ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                if (!isSea[ce] || !isSea[cw] || (j > 0 && !isSea[c - w]) || (j < h - 1 && !isSea[c + w])) { coastOf[c] = c; front.push(c); }
            }
            for (let ring = 1; ring < coastRings && front.length; ring++) {
                const next = [];
                for (const c of front) {
                    const j = Math.floor(c / w), i = c - j * w;
                    for (const q of [j * w + (i + 1) % w, j * w + (i - 1 + w) % w, j > 0 ? c - w : -1, j < h - 1 ? c + w : -1]) {
                        if (q < 0 || !isSea[q] || coastOf[q] >= 0) continue;
                        coastOf[q] = coastOf[c]; next.push(q);
                    }
                }
                front = next;
            }
        }

        // A coast drives upwelling only if there is enough of it: round a small island the water pushed offshore on one
        // side is made up from the other, so a coastal cell's upwelling is weighted by the land within the zone around it
        // (full from OCEAN_COAST_LAND_SHARE of it: a continent's coast; little round a small island in open sea).
        const coastFull = new Float64Array(G);
        {
            const landF = Float64Array.from(isSea, v => 1 - v), tmp = new Float64Array(G);
            const ry = Math.max(1, Math.round(P.OCEAN_COAST_KM * 1000 / (dRad * R_PLANET)));
            for (let j = 0; j < h; j++) {
                const rx = Math.min(w >> 1, Math.max(1, Math.round(P.OCEAN_COAST_KM * 1000 / (dRad * R_PLANET * Math.max(0.05, cosLat[j])))));
                let sum = 0;
                for (let d = -rx; d <= rx; d++) sum += landF[j * w + ((d % w) + w) % w];
                for (let i = 0; i < w; i++) {
                    tmp[j * w + i] = sum / (2 * rx + 1);
                    sum += landF[j * w + (i + rx + 1) % w] - landF[j * w + ((i - rx) % w + w) % w];
                }
            }
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i;
                if (coastOf[c] !== c) continue;
                let s = 0, n = 0;
                for (let d = -ry; d <= ry; d++) { const jj = j + d; if (jj >= 0 && jj < h) { s += tmp[jj * w + i]; n++; } }
                const x = Math.min(1, (s / n) / P.OCEAN_COAST_LAND_SHARE);
                coastFull[c] = x * x * (3 - 2 * x);
            }
        }

        // ── The thermocline's depth, from the year's winds ──
        // Upwelled water is as cold as the water under the warm surface layer — very cold where that layer is thin, hardly
        // colder than the surface where it is deep. Its depth h, row by row across each basin (shore to shore: land wider
        // than OCEAN_SHORE_KM along the row — a smaller island the ocean's slow adjustment passes round):
        //  • along the equator (within OCEAN_EQ_DEG, blended), tilted by the winds about the basin's mean depth
        //    OCEAN_THERMO_EQ_M — g′ ∂(h²/2)/∂x = τₓ/ρ: easterlies pile the warm water up in the west (the warm pool, the
        //    east Pacific's cold tongue — Bjerknes), westerlies in the east (the Indian Ocean). The equatorial ocean answers
        //    the winds over its whole waveguide, so τₓ there is their mean within OCEAN_EQ_DEG of the equator (the trades
        //    blow on either side of a calm rain belt as much as on it);
        //  • away from it, set by the gyres' Ekman pumping from the basin's eastern shore, where it is shallowest
        //    (OCEAN_THERMO_EAST_M): deep under the subtropical highs, shallow under the subpolar lows (Sverdrup:
        //    h² = h_E² + (2f²/βg′)∫(−w_E)dx).
        const thermoD = new Float64Array(G).fill(P.OCEAN_THERMO_EAST_M), upDT = new Float64Array(G);
        {
            const ek = ekmanOf(tx, ty), hE2 = P.OCEAN_THERMO_EAST_M ** 2, h02 = P.OCEAN_THERMO_EQ_M ** 2, H_MIN = 20, H_MAX = 400;
            // (the waveguide's mean east–west stress, per longitude: weighted e^{−(lat/OCEAN_EQ_DEG)²}, over the sea)
            const txEq = new Float64Array(w);
            {
                const sw = new Float64Array(w);
                for (let j = 0; j < h; j++) {
                    const wt = Math.exp(-((g.lat[j] / P.OCEAN_EQ_DEG) ** 2));
                    if (wt < 0.05) continue;
                    for (let i = 0; i < w; i++) { const c = j * w + i; if (isSea[c]) { txEq[i] += wt * tx[c]; sw[i] += wt; } }
                }
                for (let i = 0; i < w; i++) txEq[i] = sw[i] > 0 ? txEq[i] / sw[i] : 0;
            }
            const seg = [], aEqs = [], aSvs = [];
            for (let j = 0; j < h; j++) {
                const la = g.lat[j], f = 2 * OMEGA_ROT * Math.sin(la * DEG), beta = Math.max(1e-13, 2 * OMEGA_ROT * Math.cos(la * DEG) / R_PLANET);
                const wEq = Math.exp(-((la / P.OCEAN_EQ_DEG) ** 2)), kEq = 2 / (RHO_SEA * P.OCEAN_GPRIME), kSv = 2 * f * f / (beta * P.OCEAN_GPRIME);
                const dx = dRad * R_PLANET * Math.max(0.05, cosLat[j]), minRun = Math.max(1, Math.round(P.OCEAN_SHORE_KM * 1000 / dx));
                // the row's shores: runs of land at least minRun cells long
                const shore = new Uint8Array(w);
                for (let i = 0; i < w; i++) {
                    if (isSea[j * w + i] || shore[i]) continue;
                    let len = 0; while (len < w && !isSea[j * w + (i + len) % w]) len++;
                    if (len >= minRun) for (let k = 0; k < len; k++) shore[(i + k) % w] = 1;
                }
                let i0 = shore.indexOf(1);
                const shoreless = i0 < 0;
                if (shoreless) i0 = 0;
                // each basin, westward from its eastern shore: the integrals, then the depth
                const flush = () => {
                    if (!seg.length) return;
                    let mEq = 0; for (const v of aEqs) mEq += v; mEq /= aEqs.length;
                    for (let q = 0; q < seg.length; q++) {
                        const hEq2 = h02 + kEq * (aEqs[q] - mEq), hSv2 = shoreless ? hE2 : hE2 + kSv * aSvs[q];
                        thermoD[seg[q]] = Math.sqrt(Math.max(H_MIN * H_MIN, Math.min(H_MAX * H_MAX, wEq * hEq2 + (1 - wEq) * hSv2)));
                    }
                    seg.length = 0; aEqs.length = 0; aSvs.length = 0;
                };
                let aEq = 0, aSv = 0;
                for (let k = 1; k <= w; k++) {
                    const i = ((i0 - k) % w + w) % w, c = j * w + i;
                    if (shore[i]) { flush(); aEq = 0; aSv = 0; continue; }
                    if (!isSea[c]) continue;                                   // (an island: passed round)
                    aEq += -txEq[i] * dx; aSv += -ek.div[c] * dx;
                    seg.push(c); aEqs.push(aEq); aSvs.push(aSv);
                }
                flush();
            }
            for (let c = 0; c < G; c++) upDT[c] = P.OCEAN_UPWELL_DT * Math.exp(-Math.max(0, thermoD[c] - P.OCEAN_THERMO_EAST_M) / P.OCEAN_THERMO_SCALE_M);
        }

        /** One period's heat (W/m²) from its stress, currents and sea temperature: advection, upwelling (and m/s of it). */
        const heatOf = (sx, sy, Uc, Vc, sstF) => {
            const { dTdy } = rowsOf(sstF);
            const qAdv = new Float64Array(G), qUp = new Float64Array(G), wUp = new Float64Array(G);
            const { Mx, My, div } = ekmanOf(sx, sy);
            // the coastal cells' upwelling (offshore Ekman transport over the zone's width), then the zone takes it
            const coastW0 = new Float64Array(G);
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.05, cosLat[j]), zx = coastRings * dRad * R_PLANET * cj, zy = coastRings * dRad * R_PLANET;
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    if (coastOf[c] !== c) continue;
                    const ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w, cn = j > 0 ? c - w : -1, cs = j < h - 1 ? c + w : -1;
                    let wc = 0;
                    if (!isSea[ce]) wc += Math.max(0, -Mx[c]) / zx;
                    if (!isSea[cw]) wc += Math.max(0, Mx[c]) / zx;
                    if (cn >= 0 && !isSea[cn]) wc += Math.max(0, -My[c]) / zy;
                    if (cs >= 0 && !isSea[cs]) wc += Math.max(0, My[c]) / zy;
                    coastW0[c] = wc * coastFull[c];
                }
            }
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.05, cosLat[j]), dx = dRad * R_PLANET * cj;
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    if (!isSea[c]) continue;
                    const ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                    // upwind gradient of the sea temperature (sea neighbours only)
                    const Tc = sstF[c];
                    let gx = 0;
                    if (Uc[c] > 0 && isSea[cw]) gx = (Tc - sstF[cw]) / dx; else if (Uc[c] < 0 && isSea[ce]) gx = (sstF[ce] - Tc) / dx;
                    qAdv[c] = -RHO_SEA * CP_SEA * (P.OCEAN_HEAT_SHARE * Uc[c] * gx + P.OCEAN_MERID_SHARE * Vc[c] * dTdy[j]);
                    // upwelling (m/s): the Ekman divergence, or the coastal zone's
                    const wv = Math.max(0, div[c], coastOf[c] >= 0 ? coastW0[coastOf[c]] : 0);
                    wUp[c] = wv;
                    const thermo = Math.max(0, Math.min(1, (Tc - 2) / 15));      // cold polar water has little to upwell
                    qUp[c] = -RHO_SEA * CP_SEA * wv * upDT[c] * thermo;
                }
            }
            return { qAdv, qUp, wUp };
        };
        // ── What each current carries: the temperature of the latitudes its water comes from. Traced back along the
        // current for CARRY_TRACE_KM (as far as surface water keeps its temperature against the air: a few months at
        // the gyres' speeds), the average sea temperature there minus here — a poleward current warm, an equatorward
        // one cold, a slow broad current as much as a fast narrow one; faded where the sea barely moves. (The year's
        // currents: it is the sea's lasting warm and cold.) ──
        const carried = new Float64Array(G);
        {
            const { rowSm } = rowsOf(sst);
            const nSteps = Math.max(1, Math.round(CARRY_TRACE_KM / (g.step * 111.2)));
            const tzAt = (y) => { const yy = Math.max(0, Math.min(h - 1, y - 0.5)), j0 = Math.floor(yy), f = yy - j0; return rowSm[j0] * (1 - f) + rowSm[Math.min(h - 1, j0 + 1)] * f; };
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i; if (!isSea[c]) continue;
                const sp0 = Math.hypot(U[c], V[c]); if (!(sp0 > 0)) continue;
                let y = j + 0.5, x = i + 0.5;
                for (let k = 0; k < nSteps; k++) {
                    const cc = Math.floor(y) * w + ((Math.floor(x) % w) + w) % w, sp = Math.hypot(U[cc], V[cc]);
                    if (!(sp > 0)) break;
                    const cls = Math.max(0.1, cosLat[Math.floor(y)]);
                    const ny = y + V[cc] / sp, nx = x - U[cc] / sp / cls;                // one cell upstream (rows run south)
                    if (ny < 0 || ny >= h || !isSea[Math.floor(ny) * w + ((Math.floor(nx) % w) + w) % w]) break;
                    y = ny; x = nx;
                }
                carried[c] = (tzAt(y) - tzAt(j + 0.5)) * Math.tanh(sp0 / P.OCEAN_CURRENT_DEPTH_M / CARRY_CALM_MS);
            }
        }
        // the overturning: OCEAN_OVERTURN_PW per hemisphere, released over the seas the polar ocean opens onto
        const qMoc = overturningHeat(g, isSea, channels, P.OCEAN_OVERTURN_PW);
        // The heat of a period: advection + overturning + upwelling, capped, less the net (the ocean moves heat, it does
        // not make it; area-weighted over the sea — after the cap, or capping a strong upwelling's cooling would warm
        // every other sea). Seasonal: each month from its own stress, currents and sea; else the year's (as before
        // seasons: the months then all carry the year's heat).
        const qOf = (H) => {
            const q = new Float64Array(G);
            let net = 0, area = 0;
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i; if (!isSea[c]) continue;
                q[c] = Math.max(-P.OCEAN_QFLUX_MAX, Math.min(P.OCEAN_QFLUX_MAX, H.qAdv[c] + qMoc[c] + H.qUp[c]));
                net += q[c] * cosLat[j]; area += cosLat[j];
            }
            net /= area;
            for (let c = 0; c < G; c++) if (isSea[c]) q[c] -= net;
            return q;
        };
        const q = new Float64Array(G), qAdv = new Float64Array(G), qUp = new Float64Array(G), wUp = new Float64Array(G);
        const qM = new Float64Array(12 * G), wUpM = new Float64Array(12 * G);
        if (seasonal) {
            for (let m = 0; m < 12; m++) {
                const sl = (f) => f.subarray(m * G, (m + 1) * G);
                const H = heatOf(sl(txM), sl(tyM), sl(UM), sl(VM), sl(sstM)), qm = qOf(H);
                qM.set(qm, m * G); wUpM.set(H.wUp, m * G);
                for (let c = 0; c < G; c++) { q[c] += qm[c] / 12; qAdv[c] += H.qAdv[c] / 12; qUp[c] += H.qUp[c] / 12; wUp[c] += H.wUp[c] / 12; }
            }
        } else {
            const H = heatOf(tx, ty, U, V, sst);
            q.set(qOf(H)); qAdv.set(H.qAdv); qUp.set(H.qUp); wUp.set(H.wUp);
            for (let m = 0; m < 12; m++) { qM.set(q, m * G); wUpM.set(wUp, m * G); }
        }
        for (let c = 0; c < G; c++) qAdv[c] += qMoc[c];

        // ── To the core grid ──
        const out = (src) => { const o = new Float32Array(core.size); refineField(g, core, ratio, src, o, 0); return o; };
        const outM = (src) => { const o = new Float32Array(12 * core.size); for (let m = 0; m < 12; m++) refineField(g, core, ratio, src.subarray(m * G, (m + 1) * G), o.subarray(m * core.size, (m + 1) * core.size), 0); return o; };
        const surf = (x, c) => (isSea[c % G] ? x / P.OCEAN_CURRENT_DEPTH_M : 0);
        const mapped = (src, fn) => { const o = new Float64Array(src.length); for (let c = 0; c < src.length; c++) o[c] = fn(src[c], c); return o; };   // (TypedArray map / from with a callback is slow)
        // (what only the pages draw — the currents and the upwelling: carried from the sea across its coasts and refined
        // smoothly, so no coarse cell's straight edge shows — grid.js refineForDrawing)
        const draw = (src) => { const o = new Float32Array(core.size); refineForDrawing(g, core, ratio, src, o, 0, isSea); return o; };
        const drawM = (src) => { const o = new Float32Array(12 * core.size); for (let m = 0; m < 12; m++) refineForDrawing(g, core, ratio, src.subarray(m * G, (m + 1) * G), o, m * core.size, isSea); return o; };
        // (the drawn fields are worked out when first asked for — only the pages ask, and only for the last round's)
        const lazy = (o, fields) => { for (const [k, make] of Object.entries(fields)) { let v; Object.defineProperty(o, k, { get: () => (v ??= make()), enumerable: true }); } return o; };
        return lazy({
            psi: out(mapped(psi, x => x / 1e6)), qflux: out(q), qAdvection: out(qAdv), qUpwelling: out(qUp), qOverturning: out(qMoc), carried: out(carried),
            seaMask: out(Float64Array.from(isSea)), curl: out(curl), upwelledDT: out(upDT),
            // (null without seasons: the temperature stage then takes the year's heat, as before)
            monthly: seasonal ? lazy({ qflux: outM(qM) }, { u: () => drawM(mapped(UM, surf)), v: () => drawM(mapped(VM, surf)), upwelling: () => drawM(mapped(wUpM, x => x * 86400)) }) : null,
            stress: { x: out(tx), y: out(ty) },
            channels: channels.map(ch => ({ fromLat: g.lat[ch.jStart], toLat: g.lat[ch.jEnd], transportSv: ch.transport / 1e6 })),
            solver: solveStats, ms: performance.now() - t0, source: 'wind-driven ocean',
        }, { u: () => draw(mapped(U, surf)), v: () => draw(mapped(V, surf)), upwelling: () => draw(mapped(wUp, x => x * 86400)), thermocline: () => draw(thermoD) });
    };
}
