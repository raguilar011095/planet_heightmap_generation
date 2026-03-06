// Elevation → RGB colour mapping.

// Convert raw mesh elevation (nonlinear, 0-~1 for land) to physical height
// in kilometres.  Hybrid S-curve: quartic start gives extensive flatlands,
// steepest rise around t≈0.75, derivative→0 at top so peaks compress.
// Ocean (elev < 0) is mapped with a linear scale (~5 km at -0.5).
export function elevToHeightKm(elev) {
    if (elev <= 0) return elev * 10;  // ocean: -0.5 → -5 km
    const t = Math.min(elev, 1);
    const t2 = t * t;
    return 6 * t2 * t2 * (5 - 4 * t);  // 0→0, 0.25→0.09, 0.5→1.13, 0.75→3.80, 1.0→6
}

// Biome base colors indexed by Köppen class ID (satellite-view palette).
// 0=Ocean delegated, 1-30 = land biomes.
const BIOME_COLORS = [
    null,                        //  0 Ocean — handled separately
    [0.05, 0.30, 0.05],         //  1 Af   Tropical rainforest — deep emerald
    [0.08, 0.33, 0.07],         //  2 Am   Tropical monsoon — dense green
    [0.42, 0.50, 0.18],         //  3 Aw   Tropical savanna — yellow-green
    [0.82, 0.72, 0.50],         //  4 BWh  Hot desert — sandy tan
    [0.60, 0.55, 0.48],         //  5 BWk  Cold desert — gray-brown
    [0.72, 0.62, 0.30],         //  6 BSh  Hot steppe — dry gold
    [0.55, 0.52, 0.32],         //  7 BSk  Cold steppe — muted olive-tan
    [0.18, 0.42, 0.12],         //  8 Cfa  Humid subtropical — mid green
    [0.12, 0.38, 0.10],         //  9 Cfb  Oceanic — rich green
    [0.10, 0.28, 0.10],         // 10 Cfc  Subpolar oceanic — dark muted green
    [0.45, 0.48, 0.22],         // 11 Csa  Hot-summer Mediterranean — khaki-green
    [0.40, 0.45, 0.20],         // 12 Csb  Warm-summer Mediterranean — chaparral
    [0.35, 0.40, 0.20],         // 13 Csc  Cold-summer Mediterranean — darker khaki
    [0.20, 0.44, 0.14],         // 14 Cwa  Humid subtropical monsoon — mid green
    [0.15, 0.40, 0.12],         // 15 Cwb  Subtropical highland — green
    [0.12, 0.32, 0.10],         // 16 Cwc  Cold subtropical highland — dark green
    [0.12, 0.36, 0.08],         // 17 Dfa  Hot-summer continental — forest green
    [0.10, 0.32, 0.08],         // 18 Dfb  Warm-summer continental — forest green
    [0.06, 0.22, 0.08],         // 19 Dfc  Subarctic — dark spruce green
    [0.05, 0.18, 0.07],         // 20 Dfd  Extremely cold subarctic — very dark
    [0.38, 0.38, 0.18],         // 21 Dsa  Hot-summer continental dry — olive-brown
    [0.35, 0.35, 0.17],         // 22 Dsb  Warm-summer continental dry — olive-brown
    [0.08, 0.22, 0.08],         // 23 Dsc  Subarctic dry summer — dark green
    [0.06, 0.18, 0.07],         // 24 Dsd  Extremely cold subarctic dry — very dark
    [0.14, 0.36, 0.10],         // 25 Dwa  Hot-summer continental monsoon — forest green
    [0.12, 0.32, 0.09],         // 26 Dwb  Warm-summer continental monsoon
    [0.07, 0.22, 0.08],         // 27 Dwc  Subarctic monsoon — dark spruce
    [0.05, 0.18, 0.07],         // 28 Dwd  Extremely cold subarctic monsoon
    [0.35, 0.32, 0.22],         // 29 ET   Tundra — earthy brown (sparse moss/lichen on rock)
    [0.78, 0.80, 0.84],         // 30 EF   Ice cap — blue-tinted white
];

// Rocky/alpine mountain color for high-elevation blending.
const ROCK_COLOR = [0.42, 0.38, 0.32];

// Altitude thresholds (km) by Köppen group:
//   [alpine line, snow line]
// Alpine line: vegetation gives way to rocky alpine terrain.
// Snow line: permanent snow begins.
function altitudeThresholds(classId) {
    if (classId <= 0)  return [0, 0];           // Ocean
    if (classId <= 3)  return [3.5, 5.5];       // Tropical (A)
    if (classId <= 7)  return [3.0, 5.0];       // Arid (B)
    if (classId <= 16) return [2.0, 3.5];       // Temperate (C)
    if (classId <= 18 || classId === 21 || classId === 22 ||
        classId === 25 || classId === 26) return [1.5, 3.0];  // Continental humid (D*a, D*b)
    if (classId <= 28) return [0.8, 2.0];       // Subarctic (D*c, D*d)
    if (classId === 29) return [0.4, 1.5];      // Tundra (ET) — rocky higher up, snow only at peaks
    return [0, 0.5];                             // Ice cap (EF)
}

// Satellite-view biome color: realistic land colors based on Köppen class
// and elevation, with ocean delegated to the standard ocean palette.
export function biomeColor(koppenId, elevation) {
    // Ocean
    if (koppenId === 0 || elevation <= 0) return elevationToColor(elevation);

    const base = BIOME_COLORS[koppenId] || [0.30, 0.50, 0.20];
    const hKm = elevToHeightKm(elevation);
    const [alpineLine, snowLine] = altitudeThresholds(koppenId);

    let r = base[0], g = base[1], b = base[2];

    // Low-elevation subtle darkening for depth (0-200m)
    if (hKm < 0.2) {
        const dark = 0.93 + 0.07 * (hKm / 0.2);
        r *= dark; g *= dark; b *= dark;
    }

    // Mid-elevation: gentle darkening to show terrain relief (200m to alpine line)
    if (alpineLine > 0 && hKm > 0.2 && hKm < alpineLine) {
        const t = (hKm - 0.2) / (alpineLine - 0.2);
        const darken = 1.0 - t * 0.15; // up to 15% darker at alpine line
        r *= darken; g *= darken; b *= darken;
    }

    // Alpine zone: blend toward rocky brown-gray above the tree/vegetation line
    if (alpineLine > 0 && hKm > alpineLine) {
        const rockZone = snowLine > alpineLine ? snowLine - alpineLine : 2.0;
        const rockT = Math.min(1, (hKm - alpineLine) / rockZone);
        const s = rockT * rockT; // ease-in for gradual transition
        r = r + (ROCK_COLOR[0] - r) * s;
        g = g + (ROCK_COLOR[1] - g) * s;
        b = b + (ROCK_COLOR[2] - b) * s;
    }

    // Snow zone: blend toward white above the snow line
    if (snowLine > 0 && hKm > snowLine) {
        const snowT = Math.min(1, (hKm - snowLine) / 2.5);
        const s = snowT * snowT; // ease-in for gradual snow buildup
        r = r + (0.92 - r) * s;
        g = g + (0.93 - g) * s;
        b = b + (0.96 - b) * s;
    }

    return [r, g, b];
}

export function elevationToColor(e) {
    if (e < -0.50) return [0.04, 0.06, 0.30];
    if (e < -0.10) { const t=(e+0.50)/0.40; return [0.04+t*0.07,0.06+t*0.14,0.30+t*0.18]; }
    if (e <  0.00) { const t=(e+0.10)/0.10; return [0.11+t*0.19,0.20+t*0.22,0.48+t*0.12]; }
    if (e <  0.03) { const t=e/0.03;         return [0.72+t*0.08,0.68-t*0.02,0.46-t*0.10]; }
    if (e <  0.25) { const t=(e-0.03)/0.22;  return [0.20-t*0.06,0.54-t*0.12,0.12+t*0.08]; }
    if (e <  0.50) { const t=(e-0.25)/0.25;  return [0.14+t*0.30,0.42-t*0.14,0.20-t*0.06]; }
    if (e <  0.75) { const t=(e-0.50)/0.25;  return [0.44+t*0.16,0.28+t*0.12,0.14+t*0.18]; }
    { const t=Math.min(1,(e-0.75)/0.20);      return [0.60+t*0.35,0.40+t*0.50,0.32+t*0.60]; }
}
