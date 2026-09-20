// Enforces the dependency direction from ARCHITECTURE.md §5:
//
//     core ← state ← sim ← passes ← app / render / ui / dev
//
// Imports only ever point left. The simulation layers (core, state, sim,
// passes) may not import three.js, any bare-specifier package, or touch the
// DOM. Exit code 1 on any violation.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYER = { core: 0, state: 1, sim: 2, passes: 3, app: 4, render: 4, ui: 4, dev: 4 };
const SIM_LAYERS = new Set(['core', 'state', 'sim', 'passes']);
const SKIP = new Set(['test', 'scripts', 'node_modules']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(e.name)) out.push(p);
  }
  return out;
}

function layerOf(file) {
  const rel = path.relative(ROOT, file).split(path.sep)[0];
  return { name: rel, level: LAYER[rel] };
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const DOM_RE = /\b(window|document|navigator|localStorage)\s*[.[]/;

const violations = [];
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const from = layerOf(file);
  if (from.level === undefined) continue;                  // stray file at root
  const rel = path.relative(ROOT, file);
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  if (SIM_LAYERS.has(from.name) && DOM_RE.test(noComments)) {
    violations.push(`${rel}: touches the DOM/browser globals from simulation layer "${from.name}"`);
  }
  for (const m of noComments.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      if (SIM_LAYERS.has(from.name)) violations.push(`${rel}: bare import "${spec}" is not allowed in simulation layer "${from.name}"`);
      else if (spec === 'three' && from.name !== 'render') violations.push(`${rel}: only render/ may import three.js`);
      continue;
    }
    const target = path.resolve(path.dirname(file), spec);
    const to = layerOf(target);
    if (to.level === undefined) { violations.push(`${rel}: import "${spec}" resolves outside a known layer`); continue; }
    if (to.level > from.level) violations.push(`${rel}: "${from.name}" (${from.level}) imports "${spec}" from "${to.name}" (${to.level}) — imports must point left`);
  }
}

if (violations.length) {
  console.error(`check-deps: ${violations.length} violation(s)\n  ` + violations.join('\n  '));
  process.exit(1);
}
console.log('check-deps: ok');
