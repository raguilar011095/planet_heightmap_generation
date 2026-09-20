// The field registry. Every per-cell array the simulation uses is declared
// here with its type, unit, range and purpose, so every field is inspectable,
// range-checkable and allocatable generically. There is no hand-maintained
// list of "debug layers" anywhere — this registry is the only list.

const REGISTRY = new Map();
const NAME_RE = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9_]*$/;
const TYPES = new Set([Float32Array, Float64Array, Int32Array, Int16Array, Int8Array,
                       Uint32Array, Uint16Array, Uint8Array]);

export function defineField(name, spec) {
  if (!NAME_RE.test(name)) throw new Error(`defineField: name "${name}" must be "collection.field"`);
  if (REGISTRY.has(name)) throw new Error(`defineField: "${name}" is already defined`);
  if (!spec || !TYPES.has(spec.type)) throw new Error(`defineField(${name}): type must be a typed-array constructor`);
  if (typeof spec.doc !== 'string' || spec.doc.trim().length < 10) throw new Error(`defineField(${name}): doc is required`);
  if (spec.range != null) {
    const r = spec.range;
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] <= r[1])) throw new Error(`defineField(${name}): range must be [lo, hi]`);
  }
  const initial = spec.initial ?? 0;
  const out = Object.freeze({
    name, type: spec.type, unit: spec.unit ?? '', range: spec.range ?? null,
    doc: spec.doc.trim(), initial,
    isFloat: spec.type === Float32Array || spec.type === Float64Array,
  });
  REGISTRY.set(name, out);
  return out;
}

export function hasField(name) { return REGISTRY.has(name); }

export function getField(name) {
  const f = REGISTRY.get(name);
  if (!f) throw new Error(`Unknown field "${name}" — define it with defineField first`);
  return f;
}

export function listFields() { return [...REGISTRY.values()]; }

// Tests only. Production code never unregisters a field.
export function resetFields() { REGISTRY.clear(); }

// First violation of a field's declared range (NaN always counts), or null.
export function findRangeViolation(spec, arr) {
  const r = spec.range;
  if (spec.isFloat) {
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v !== v) return { index: i, value: v };
      if (r && (v < r[0] || v > r[1])) return { index: i, value: v };
    }
  } else if (r) {
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v < r[0] || v > r[1]) return { index: i, value: v };
    }
  }
  return null;
}
