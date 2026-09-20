// Pass/module size budget (ARCHITECTURE.md §2.1): soft cap 250 lines, hard cap
// 400. A file over the soft cap is doing more than one thing; over the hard cap
// fails the check. Blank lines and comment-only lines are not counted.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['core', 'state', 'sim', 'passes', 'app', 'render', 'ui', 'dev'];
const SOFT = 250, HARD = 400;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}

let hard = 0, soft = 0;
for (const dir of DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
      .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); });
    const n = lines.length, rel = path.relative(ROOT, file);
    if (n > HARD) { hard++; console.error(`check-size: ${rel} has ${n} code lines (hard cap ${HARD}) — split it`); }
    else if (n > SOFT) { soft++; console.warn(`check-size: ${rel} has ${n} code lines (soft cap ${SOFT}) — consider splitting`); }
  }
}
if (hard) process.exit(1);
console.log(`check-size: ok${soft ? ` (${soft} over soft cap)` : ''}`);
