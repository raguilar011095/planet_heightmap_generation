// Pure plate-motion helpers shared by the worker, editor, and tests.
// User edits are expressed as local bearing + speed percentage, then converted
// back into the simulation's Euler pole/angular-speed representation.

const EPS = 1e-12;

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function length(a) {
    return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a, fallback = [0, 1, 0]) {
    const len = length(a);
    if (len > EPS && Number.isFinite(len)) {
        return [a[0] / len, a[1] / len, a[2] / len];
    }
    const fallbackLen = length(fallback);
    if (fallbackLen > EPS && Number.isFinite(fallbackLen)) {
        return [fallback[0] / fallbackLen, fallback[1] / fallbackLen, fallback[2] / fallbackLen];
    }
    return [0, 1, 0];
}

function scale(a, amount) {
    return [a[0] * amount, a[1] * amount, a[2] * amount];
}

function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function normalizeMotionOverride(override) {
    const rawBearing = Number.isFinite(override?.bearingDeg) ? Math.round(override.bearingDeg) : 0;
    const bearingDeg = ((rawBearing % 360) + 360) % 360;
    const rawSpeed = Number.isFinite(override?.speedPercent) ? Math.round(override.speedPercent) : 100;
    const speedPercent = Math.max(0, Math.min(200, rawSpeed));
    return { bearingDeg, speedPercent };
}

export function clonePlateVec(plateVec) {
    const clone = {};
    for (const [plateId, motion] of Object.entries(plateVec || {})) {
        if (motion && Array.isArray(motion.pole)) {
            clone[plateId] = {
                pole: [motion.pole[0], motion.pole[1], motion.pole[2]],
                omega: motion.omega,
            };
        } else if (Array.isArray(motion)) {
            clone[plateId] = motion.slice();
        } else {
            clone[plateId] = motion;
        }
    }
    return clone;
}

export function motionToAngularVector(motion) {
    if (!motion || !Array.isArray(motion.pole) || !Number.isFinite(motion.omega)) return [0, 0, 0];
    return [
        motion.pole[0] * motion.omega,
        motion.pole[1] * motion.omega,
        motion.pole[2] * motion.omega,
    ];
}

export function angularVectorToMotion(vector, fallbackPole = [0, 1, 0]) {
    const omega = length(vector);
    if (!(omega > EPS) || !Number.isFinite(omega)) {
        return { pole: normalize(fallbackPole), omega: 0 };
    }
    return {
        pole: [vector[0] / omega, vector[1] / omega, vector[2] / omega],
        omega,
    };
}

export function tangentFrame(anchor) {
    const c = normalize(anchor, [0, 0, 1]);
    let east = [c[2], 0, -c[0]];
    if (length(east) <= EPS) east = [1, 0, 0];
    east = normalize(east, [1, 0, 0]);
    const north = normalize(cross(c, east), [0, 0, -1]);
    return { north, east };
}

export function bearingToDirection(anchor, bearingDeg) {
    const { north, east } = tangentFrame(anchor);
    const radians = (((bearingDeg % 360) + 360) % 360) * Math.PI / 180;
    return normalize(add(scale(north, Math.cos(radians)), scale(east, Math.sin(radians))), north);
}

export function directionToBearing(anchor, direction) {
    const c = normalize(anchor, [0, 0, 1]);
    const tangent = add(direction, scale(c, -dot(direction, c)));
    if (length(tangent) <= EPS) return 0;
    const d = normalize(tangent);
    const { north, east } = tangentFrame(c);
    const degrees = Math.atan2(dot(d, east), dot(d, north)) * 180 / Math.PI;
    return (degrees + 360) % 360;
}

export function motionVelocityAtAnchor(motion, anchor) {
    return cross(motionToAngularVector(motion), normalize(anchor, [0, 0, 1]));
}

export function motionBearingDeg(motion, anchor) {
    return directionToBearing(anchor, motionVelocityAtAnchor(motion, anchor));
}

export function motionSpeedAtAnchor(motion, anchor) {
    return length(motionVelocityAtAnchor(motion, anchor));
}

export function motionFromOverride(generatedMotion, anchor, override) {
    const normalizedOverride = normalizeMotionOverride(override);
    const c = normalize(anchor, [0, 0, 1]);
    const generatedW = motionToAngularVector(generatedMotion);
    let axial = dot(generatedW, c);
    const tangent = add(generatedW, scale(c, -axial));
    let tangentMagnitude = length(tangent);

    // A pole exactly at the anchor has no local direction. Use a deterministic
    // full-speed tangent solution so the first user drag can still move it.
    if (tangentMagnitude <= EPS && length(generatedW) > EPS) {
        axial = 0;
        tangentMagnitude = length(generatedW);
    }

    const desiredDirection = bearingToDirection(c, normalizedOverride.bearingDeg);
    const desiredTangentW = scale(cross(c, desiredDirection), tangentMagnitude);
    const editedW = scale(
        add(scale(c, axial), desiredTangentW),
        normalizedOverride.speedPercent / 100
    );
    return angularVectorToMotion(editedW, generatedMotion?.pole);
}

export function applyMotionOverrides(generatedPlateVec, anchors, overrides) {
    const result = clonePlateVec(generatedPlateVec);
    if (!overrides) return result;
    for (const [plateId, rawOverride] of overrides) {
        const generatedMotion = generatedPlateVec?.[plateId];
        const anchor = anchors?.[plateId];
        if (!generatedMotion || !anchor || rawOverride == null) continue;
        result[plateId] = motionFromOverride(generatedMotion, anchor, rawOverride);
    }
    return result;
}

export function computePlateMotionAnchors(rPlate, plateSeeds, xyz) {
    const plateIds = Array.from(plateSeeds || []);
    const known = new Set(plateIds);
    const sums = Object.create(null);
    const firstRegion = Object.create(null);
    for (const plateId of plateIds) sums[plateId] = [0, 0, 0];

    for (let region = 0; region < rPlate.length; region++) {
        const plateId = rPlate[region];
        if (!known.has(plateId)) continue;
        if (firstRegion[plateId] === undefined) firstRegion[plateId] = region;
        const sum = sums[plateId];
        sum[0] += xyz[3 * region];
        sum[1] += xyz[3 * region + 1];
        sum[2] += xyz[3 * region + 2];
    }

    const targets = Object.create(null);
    const bestRegion = Object.create(null);
    const bestDot = Object.create(null);
    for (const plateId of plateIds) {
        const fallbackRegion = firstRegion[plateId];
        const fallback = fallbackRegion === undefined
            ? [0, 1, 0]
            : [xyz[3 * fallbackRegion], xyz[3 * fallbackRegion + 1], xyz[3 * fallbackRegion + 2]];
        targets[plateId] = normalize(sums[plateId], fallback);
        bestRegion[plateId] = fallbackRegion;
        bestDot[plateId] = -Infinity;
    }

    for (let region = 0; region < rPlate.length; region++) {
        const plateId = rPlate[region];
        if (!known.has(plateId)) continue;
        const target = targets[plateId];
        const candidateDot = target[0] * xyz[3 * region]
            + target[1] * xyz[3 * region + 1]
            + target[2] * xyz[3 * region + 2];
        if (candidateDot > bestDot[plateId]) {
            bestDot[plateId] = candidateDot;
            bestRegion[plateId] = region;
        }
    }

    const anchors = {};
    for (const plateId of plateIds) {
        const region = bestRegion[plateId];
        anchors[plateId] = region === undefined
            ? targets[plateId]
            : normalize([xyz[3 * region], xyz[3 * region + 1], xyz[3 * region + 2]], targets[plateId]);
    }
    return anchors;
}

export function recordsToPlateOverrides(records, plateSeeds) {
    const plateIds = Array.from(plateSeeds || []);
    const overrides = new Map();
    for (const record of records || []) {
        const plateIndex = record?.plateIndex;
        if (!Number.isInteger(plateIndex) || plateIndex < 0 || plateIndex >= plateIds.length) {
            throw new RangeError(`Invalid plate motion index: ${plateIndex}`);
        }
        overrides.set(plateIds[plateIndex], normalizeMotionOverride(record));
    }
    return overrides;
}

export function plateOverridesToRecords(overrides, plateSeeds) {
    const plateIds = Array.from(plateSeeds || []);
    const indexByPlate = new Map(plateIds.map((plateId, index) => [plateId, index]));
    const records = [];
    for (const [plateId, override] of overrides || []) {
        if (override == null || !indexByPlate.has(plateId)) continue;
        records.push({ plateIndex: indexByPlate.get(plateId), ...normalizeMotionOverride(override) });
    }
    records.sort((a, b) => a.plateIndex - b.plateIndex);
    return records;
}
