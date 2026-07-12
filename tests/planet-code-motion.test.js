import test from 'node:test';
import assert from 'node:assert/strict';

import { decodePlanetCode, encodePlanetCode } from '../js/planet-code.js';

const BASE_ARGS = [
    123456, // seed
    204000, // N
    0.75,   // jitter
    8,      // plates
    4,      // continents
    0.4,    // roughness
    0.75,   // terrain warp
    0.1,    // smoothing
    0.5,    // glacial
    0.5,    // hydraulic
    0.1,    // thermal
    0.35,   // ridge sharpening
    0.75,   // soil creep
    0.35,   // continent size variety
    0,      // temperature offset
    0,      // precipitation offset
    0.3,    // land coverage
];

function encode(toggles = [], motionOverrides = undefined) {
    return encodePlanetCode(...BASE_ARGS, toggles, motionOverrides);
}

function pair(value) {
    return value.toString(36).padStart(2, '0');
}

test('existing no-edit and toggle-only code output remains unchanged', () => {
    const oldNoEdit = encodePlanetCode(...BASE_ARGS);
    const explicitNoEdit = encode([], []);
    assert.equal(explicitNoEdit, oldNoEdit);
    assert.deepEqual(decodePlanetCode(oldNoEdit).motionOverrides, []);

    const oldToggleOnly = encodePlanetCode(...BASE_ARGS, [0, 7]);
    const explicitToggleOnly = encode([0, 7], []);
    assert.equal(explicitToggleOnly, oldToggleOnly);
    assert.deepEqual(decodePlanetCode(oldToggleOnly).toggledIndices, [0, 7]);
    assert.deepEqual(decodePlanetCode(oldToggleOnly).motionOverrides, []);
});

test('motion-only records round-trip in stable sorted order without mutating input', () => {
    const motion = [
        { plateIndex: 5, bearingDeg: 359, speedPercent: 0 },
        { plateIndex: 1, bearingDeg: 0, speedPercent: 200 },
    ];
    const snapshot = structuredClone(motion);
    const code = encode([], motion);
    assert.match(code, /^[0-9a-z]{22}~/);
    assert.deepEqual(motion, snapshot);
    assert.deepEqual(decodePlanetCode(code).motionOverrides, [
        { plateIndex: 1, bearingDeg: 0, speedPercent: 200 },
        { plateIndex: 5, bearingDeg: 359, speedPercent: 0 },
    ]);
});

test('land toggles and motion records coexist', () => {
    const code = encode([0, 7], [
        { plateIndex: 3, bearingDeg: 271, speedPercent: 145 },
    ]);
    assert.match(code, /^[0-9a-z]{22}-0007~/);
    const decoded = decodePlanetCode(code);
    assert.deepEqual(decoded.toggledIndices, [0, 7]);
    assert.deepEqual(decoded.motionOverrides, [
        { plateIndex: 3, bearingDeg: 271, speedPercent: 145 },
    ]);
});

test('decoder strictly rejects malformed motion suffixes', () => {
    const base = encode();
    const validRecord = pair(1) + pair(90) + pair(100);

    for (const invalid of [
        `${base}~`,
        `${base}~${validRecord.slice(0, 5)}`,
        `${base}~~${validRecord}`,
        `${base}~!${validRecord.slice(1)}`,
        `${base}~${pair(8)}${pair(90)}${pair(100)}`, // plate index == P
        `${base}~${pair(1)}${pair(360)}${pair(100)}`,
        `${base}~${pair(1)}${pair(90)}${pair(201)}`,
        `${base}~${validRecord}${validRecord}`,
    ]) {
        assert.equal(decodePlanetCode(invalid), null, invalid);
    }
});

test('encoder rejects duplicate or out-of-range motion records', () => {
    assert.throws(() => encode([], [
        { plateIndex: 1, bearingDeg: 90, speedPercent: 100 },
        { plateIndex: 1, bearingDeg: 180, speedPercent: 100 },
    ]), /duplicate/i);
    assert.throws(() => encode([], [
        { plateIndex: 8, bearingDeg: 90, speedPercent: 100 },
    ]), /plate/i);
    assert.throws(() => encode([], [
        { plateIndex: 1, bearingDeg: 360, speedPercent: 100 },
    ]), /bearing/i);
    assert.throws(() => encode([], [
        { plateIndex: 1, bearingDeg: 90, speedPercent: 201 },
    ]), /speed/i);
});
