// A .cpuprofile (node --cpu-prof, or Chrome's) summed by function: the most time in each one's own lines, and the most
// with what it calls. For finding where a pipeline's time goes (v2/tools/perf-bench.mjs).
//   node --cpu-prof --cpu-prof-dir=v2/out/perf/prof v2/tools/perf-bench.mjs finish
//   node v2/tools/lib/cpu-profile.mjs v2/out/perf/prof/<file>.cpuprofile [top=40] [filter]
//   node v2/tools/lib/cpu-profile.mjs <file>.cpuprofile lines <file-name-part> [top=40]     the hottest lines of one source file

import fs from 'node:fs';

const [file, a1 = '40', a2 = '', a3 = '40'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map(), self = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
let total = 0;
for (let i = 0; i < p.samples.length; i++) { const d = p.timeDeltas[i] / 1000; total += d; self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + d); }
const key = n => `${n.callFrame.functionName || '(anonymous)'}  ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;

if (a1 === 'lines') {
    // (each node's ticks by line: its own time shared out by them — an inlined callee's lines count as its own)
    const perTick = total / p.samples.length, lines = new Map();
    for (const n of p.nodes) {
        if (!n.callFrame.url.includes(a2)) continue;
        for (const t of n.positionTicks ?? []) { const k = `${n.callFrame.url.split('/').slice(-2).join('/')}:${t.line}`; lines.set(k, (lines.get(k) ?? 0) + t.ticks * perTick); }
    }
    console.log(`── the hottest lines of ${a2} (of ${(total / 1000).toFixed(2)} s) ──`);
    for (const [k, t] of [...lines].sort((a, b) => b[1] - a[1]).slice(0, Number(a3))) console.log(`${(t / 1000).toFixed(2).padStart(7)} s  ${k}`);
} else {
    const own = new Map(), incl = new Map();
    for (const [id, t] of self) {
        own.set(key(byId.get(id)), (own.get(key(byId.get(id))) ?? 0) + t);
        const seen = new Set();
        for (let c = id; c !== undefined; c = parent.get(c)) { const k = key(byId.get(c)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + t); } }
    }
    for (const [m, title] of [[own, 'own time'], [incl, 'with what it calls']]) {
        console.log(`\n── ${title} (of ${(total / 1000).toFixed(2)} s) ──`);
        for (const [k, t] of [...m].filter(([k]) => k.includes(a2)).sort((x, y) => y[1] - x[1]).slice(0, Number(a1))) console.log(`${(t / 1000).toFixed(2).padStart(7)} s ${(100 * t / total).toFixed(1).padStart(5)} %  ${k}`);
    }
}
