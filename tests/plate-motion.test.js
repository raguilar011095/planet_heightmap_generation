import test from 'node:test';
import assert from 'node:assert/strict';

import {
    angularVectorToMotion,
    applyMotionOverrides,
    bearingToDirection,
    computePlateMotionAnchors,
    directionToBearing,
    motionBearingDeg,
    motionFromOverride,
    motionSpeedAtAnchor,
    motionToAngularVector,
    plateOverridesToRecords,
    recordsToPlateOverrides,
    tangentFrame,
} from '../js/plate-motion.js';

const EPS = 1e-9;

function near(actual, expected, eps = EPS) {
    assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);
}

function nearVec(actual, expected, eps = EPS) {
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) near(actual[i], expected[i], eps);
}

test('canonical angular vector preserves negative-omega motion', () => {
    const original = { pole: [0, 1, 0], omega: -2 };
    const vector = motionToAngularVector(original);
    nearVec(vector, [0, -2, 0]);

    const canonical = angularVectorToMotion(vector, original.pole);
    near(canonical.omega, 2);
    nearVec(canonical.pole, [0, -1, 0]);
    nearVec(motionToAngularVector(canonical), vector);
});

test('bearing frame maps north/east and remains finite at a pole', () => {
    const equator = [0, 0, 1];
    nearVec(bearingToDirection(equator, 0), [0, 1, 0]);
    nearVec(bearingToDirection(equator, 90), [1, 0, 0]);
    near(directionToBearing(equator, [0, 1, 0]), 0);
    near(directionToBearing(equator, [1, 0, 0]), 90);

    const { north, east } = tangentFrame([0, 1, 0]);
    for (const value of [...north, ...east]) assert.ok(Number.isFinite(value));
    near(north[1], 0);
    near(east[1], 0);
});

test('direction override is exact and speed percentage scales angular motion', () => {
    const anchor = [0, 0, 1];
    const generated = { pole: [0, 1, 0], omega: 1.5 }; // eastward at anchor

    for (const [speedPercent, expectedOmega] of [[0, 0], [50, 0.75], [100, 1.5], [200, 3]]) {
        const edited = motionFromOverride(generated, anchor, { bearingDeg: 0, speedPercent });
        near(edited.omega, expectedOmega);
        if (speedPercent > 0) near(motionBearingDeg(edited, anchor), 0, 1e-7);
        near(motionSpeedAtAnchor(edited, anchor), expectedOmega);
    }
});

test('direction edit preserves generated omega and pole distance at 100 percent', () => {
    const anchor = [0, 0, 1];
    const generated = angularVectorToMotion([0.4, 1.2, 0.8]);
    const beforeW = motionToAngularVector(generated);
    const beforeAxis = beforeW[2];

    const edited = motionFromOverride(generated, anchor, { bearingDeg: 215, speedPercent: 100 });
    const afterW = motionToAngularVector(edited);

    near(edited.omega, generated.omega);
    near(afterW[2], beforeAxis);
    near(motionBearingDeg(edited, anchor), 215, 1e-7);
});

test('applyMotionOverrides returns a deep copy and leaves generated motion untouched', () => {
    const generated = {
        10: { pole: [0, 1, 0], omega: 1 },
        20: { pole: [1, 0, 0], omega: 2 },
    };
    const snapshot = JSON.stringify(generated);
    const anchors = { 10: [0, 0, 1], 20: [0, 1, 0] };
    const overrides = new Map([[10, { bearingDeg: 180, speedPercent: 50 }]]);

    const applied = applyMotionOverrides(generated, anchors, overrides);
    assert.equal(JSON.stringify(generated), snapshot);
    assert.notEqual(applied, generated);
    assert.notEqual(applied[10], generated[10]);
    near(motionBearingDeg(applied[10], anchors[10]), 180, 1e-7);
    near(applied[10].omega, 0.5);
    nearVec(applied[20].pole, generated[20].pole);
});

test('stable anchors are normalized member regions of their own plates', () => {
    const rPlate = new Int32Array([10, 10, 20, 20]);
    const xyz = new Float32Array([
        1, 0, 0,
        0.98, 0.2, 0,
        -1, 0, 0,
        -0.98, -0.2, 0,
    ]);
    const anchors = computePlateMotionAnchors(rPlate, new Set([10, 20]), xyz);

    for (const pid of [10, 20]) {
        const anchor = anchors[pid];
        near(Math.hypot(...anchor), 1, 1e-7);
        let belongs = false;
        for (let r = 0; r < rPlate.length; r++) {
            if (rPlate[r] !== pid) continue;
            const p = [xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]];
            const plen = Math.hypot(...p);
            const normalized = p.map(v => v / plen);
            if (anchor.every((value, i) => Math.abs(value - normalized[i]) <= 1e-7)) {
                belongs = true;
                break;
            }
        }
        assert.equal(belongs, true);
    }
});

test('record conversion uses stable plate insertion order and sorts by index', () => {
    const seeds = new Set([101, 77, 505]);
    const overrides = new Map([
        [505, { bearingDeg: 359, speedPercent: 200 }],
        [101, { bearingDeg: 12, speedPercent: 85 }],
    ]);
    const records = plateOverridesToRecords(overrides, seeds);
    assert.deepEqual(records, [
        { plateIndex: 0, bearingDeg: 12, speedPercent: 85 },
        { plateIndex: 2, bearingDeg: 359, speedPercent: 200 },
    ]);

    const restored = recordsToPlateOverrides(records, seeds);
    assert.deepEqual([...restored.entries()], [...overrides.entries()].reverse());
});
