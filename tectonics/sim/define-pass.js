// The pass contract — the unit of all simulation behaviour (ARCHITECTURE.md §2).
//
// definePass validates the shape of a pass and returns a frozen descriptor.
// Field *existence* is checked later by the Scheduler at registration, so a
// pass module can be imported before the fields it uses are defined.

import { hashString } from '../core/hash-rng.js';

const ID_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const FIELD_RE = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9_]*$/;

function checkFieldList(id, kind, list) {
  if (!Array.isArray(list)) throw new Error(`definePass(${id}): ${kind} must be an array`);
  const seen = new Set();
  for (const f of list) {
    if (typeof f !== 'string' || !FIELD_RE.test(f)) throw new Error(`definePass(${id}): bad ${kind} entry "${f}"`);
    if (seen.has(f)) throw new Error(`definePass(${id}): duplicate ${kind} entry "${f}"`);
    seen.add(f);
  }
  return Object.freeze([...list]);
}

function checkParams(id, params) {
  const out = {};
  for (const [name, p] of Object.entries(params)) {
    if (!p || typeof p !== 'object') throw new Error(`definePass(${id}): param "${name}" must be an object`);
    if (typeof p.doc !== 'string' || !p.doc.trim()) throw new Error(`definePass(${id}): param "${name}" needs a doc`);
    const isNum = typeof p.value === 'number', isBool = typeof p.value === 'boolean';
    if (!isNum && !isBool) throw new Error(`definePass(${id}): param "${name}" value must be a number or boolean`);
    if (isNum) {
      const r = p.range;
      if (!Array.isArray(r) || r.length !== 2 || !(r[0] <= p.value && p.value <= r[1])) {
        throw new Error(`definePass(${id}): numeric param "${name}" needs a range [lo, hi] containing its value`);
      }
    }
    out[name] = Object.freeze({
      value: p.value, range: isNum ? Object.freeze([...p.range]) : null,
      unit: p.unit ?? '', doc: p.doc.trim(),
    });
  }
  return Object.freeze(out);
}

export function definePass(spec) {
  const id = spec?.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`definePass: id "${id}" must look like "group.name"`);
  if (typeof spec.phase !== 'string' || !spec.phase) throw new Error(`definePass(${id}): phase is required`);
  if (typeof spec.doc !== 'string' || spec.doc.trim().length < 20) {
    throw new Error(`definePass(${id}): doc is required — say what this pass does and why it exists`);
  }
  if (typeof spec.run !== 'function') throw new Error(`definePass(${id}): run(world, params, ctx) is required`);

  const reads = checkFieldList(id, 'reads', spec.reads ?? []);
  const writes = checkFieldList(id, 'writes', spec.writes ?? []);
  const params = checkParams(id, spec.params ?? {});
  const invariants = Object.freeze([...(spec.invariants ?? [])]);
  for (const inv of invariants) if (typeof inv !== 'string') throw new Error(`definePass(${id}): invariants must be names`);

  return Object.freeze({
    id, phase: spec.phase, doc: spec.doc.trim(), reads, writes, params, invariants,
    run: spec.run, hash: hashString(id),
  });
}
