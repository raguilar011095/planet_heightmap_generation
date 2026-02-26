// Elevation → RGB colour mapping.

// Convert raw mesh elevation (nonlinear, 0-~1 for land) to physical height
// in kilometres.  The color ramp bands imply a nonlinear scale:
//   0-0.03  beach/sand   →   0-50 m
//   0.03-0.25  lowland   →  50-500 m
//   0.25-0.50  mid       → 500-2000 m
//   0.50-0.75  highland  → 2000-4500 m
//   0.75+      peaks     → 4500-8500 m
// Ocean (elev < 0) is mapped with a simpler linear scale (~5 km at -0.5).
export function elevToHeightKm(elev) {
    if (elev <= 0) return elev * 10;  // ocean: -0.5 → -5 km
    if (elev < 0.03) return (elev / 0.03) * 0.05;
    if (elev < 0.25) return 0.05 + ((elev - 0.03) / 0.22) * 0.45;
    if (elev < 0.50) return 0.5 + ((elev - 0.25) / 0.25) * 1.5;
    if (elev < 0.75) return 2.0 + ((elev - 0.50) / 0.25) * 2.5;
    return 4.5 + ((elev - 0.75) / 0.25) * 4.0;
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
