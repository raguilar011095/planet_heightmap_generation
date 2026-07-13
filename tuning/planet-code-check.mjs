// Round-trip and legacy-decode checks for the SP4 planet-code format.
//   node tuning/planet-code-check.mjs
import { encodePlanetCode, decodePlanetCode } from '../js/planet-code.js';

let failures = 0;
function check(name, cond) {
    if (!cond) { failures++; console.error('FAIL', name); }
    else { console.log('ok  ', name); }
}
function near(a, b) { return Math.abs(a - b) < 1e-9; }

// [seed, N, jitter, P, numContinents, roughness, terrainWarp, smoothing, glacial,
//  hydraulic, thermal, ridge, soilCreep, csv, tempOff, precipOff, landCoverage,
//  axialTilt, rotationRate, greenhouse, winterSeverity, orographicRain, maritimeInfluence, mountainChill]
const CASES = [
    { name: 'defaults', args: [12345, 204000, 0.75, 80, 4, 0.4, 0.75, 0.1, 0.5, 0.5, 0.5, 0.5, 0.75, 0.35, 0, 0, 0.3, 23.5, 1, 0, 1, 1, 1, 1] },
    { name: 'minima', args: [0, 5000, 0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -15, -1, 0, 0, 0.5, -1, 0, 0, 0, 0] },
    { name: 'maxima', args: [16777215, 2560000, 1, 120, 10, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 15, 1, 1, 45, 2, 1, 2, 2, 2, 2] },
    { name: 'mixed', args: [999999, 500000, 0.5, 40, 7, 0.25, 0.5, 0.5, 0.2, 0.8, 0.3, 0.6, 0.75, 0.5, -5, 0.4, 0.55, 31.5, 1.3, -0.4, 1.7, 0.2, 1.1, 0.9] },
];
const FIELDS = ['seed', 'N', 'jitter', 'P', 'numContinents', 'roughness', 'terrainWarp', 'smoothing',
    'glacialErosion', 'hydraulicErosion', 'thermalErosion', 'ridgeSharpening', 'soilCreep',
    'continentSizeVariety', 'temperatureOffset', 'precipitationOffset', 'landCoverage',
    'axialTilt', 'rotationRate', 'greenhouse', 'winterSeverity', 'orographicRain',
    'maritimeInfluence', 'mountainChill'];

for (const { name, args } of CASES) {
    const code = encodePlanetCode(...args);
    const d = decodePlanetCode(code);
    check(`${name}: decodes`, d !== null);
    if (!d) { continue; }
    for (let i = 0; i < FIELDS.length; i++) {
        check(`${name}: ${FIELDS[i]}`, near(d[FIELDS[i]], args[i]));
    }
    check(`${name}: base length 27`, code.split(/[-~]/)[0].length === 27);
}

// Suffixes survive the new format
const withSuffixes = encodePlanetCode(12345, 204000, 0.75, 80, 4, 0.4, 0.75, 0.1, 0.5, 0.5, 0.5, 0.5, 0.75, 0.35, 3, -0.2, 0.3, 30, 1.5, 0.5, 1.2, 0.8, 1.4, 0.6, [3, 7]);
const ds = decodePlanetCode(withSuffixes);
check('suffixes: toggles', ds && ds.toggledIndices.length === 2 && ds.toggledIndices[0] === 3 && ds.toggledIndices[1] === 7);
check('suffixes: tilt', ds && near(ds.axialTilt, 30));

// Legacy 22-char codes (captured pre-SP4) decode with SP4 defaults
const LEGACY_A = '0009j742vm5hlef0184d0g-0307'; // pre-SP4 22-char + -toggles (no motion suffix in this base)
const LEGACY_B = '0000000000000000000pbt'; // pre-SP4 bare 22-char
for (const [label, legacy] of [['legacyA', LEGACY_A], ['legacyB', LEGACY_B]]) {
    const dl = decodePlanetCode(legacy);
    check(`${label}: decodes`, dl !== null);
    if (!dl) { continue; }
    check(`${label}: tilt default`, dl.axialTilt === 23.5);
    check(`${label}: rotation default`, dl.rotationRate === 1);
    check(`${label}: greenhouse default`, dl.greenhouse === 0);
    check(`${label}: character defaults`, dl.winterSeverity === 1 && dl.orographicRain === 1 && dl.maritimeInfluence === 1 && dl.mountainChill === 1);
}
check('legacyA: seed preserved', decodePlanetCode(LEGACY_A)?.seed === 12345);

process.exit(failures ? 1 : 0);
