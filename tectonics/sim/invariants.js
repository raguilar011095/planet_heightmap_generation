// Named invariants that passes can declare. Each is a function
// (world, info) → null | string, where a string is a failure message. The
// Scheduler runs a pass's declared invariants after it in dev mode and throws
// with the pass and step identified — so mass drift is caught on step 12, not
// inferred from a wrong-looking planet at step 900.

const INVARIANTS = new Map();

export function defineInvariant(name, check, doc) {
  if (typeof name !== 'string' || !name) throw new Error('defineInvariant: name is required');
  if (INVARIANTS.has(name)) throw new Error(`defineInvariant: "${name}" already defined`);
  if (typeof check !== 'function') throw new Error(`defineInvariant(${name}): check must be a function`);
  if (typeof doc !== 'string' || !doc.trim()) throw new Error(`defineInvariant(${name}): doc is required`);
  const inv = Object.freeze({ name, check, doc: doc.trim() });
  INVARIANTS.set(name, inv);
  return inv;
}

export function getInvariant(name) {
  const inv = INVARIANTS.get(name);
  if (!inv) throw new Error(`Unknown invariant "${name}"`);
  return inv;
}

export function listInvariants() { return [...INVARIANTS.values()]; }

// Tests only.
export function resetInvariants() { INVARIANTS.clear(); }
