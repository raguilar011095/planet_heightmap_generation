/**
 * Cross-resolution scale-invariance harness for World Orogen (SP2).
 *
 * Generates the SAME seed across a Detail ladder and measures how much the
 * terrain-metrics scorecard drifts with resolution. Scale-invariant code
 * should produce near-identical metric values at every rung.
 *
 *   node tuning/scale-invariance.mjs --baseline            # record pre-fix divergence
 *   node tuning/scale-invariance.mjs                       # report current vs baseline
 *   node tuning/scale-invariance.mjs --check                # exit 1 unless gated metrics
 *                                                            # improved by IMPROVE_FACTOR
 *   node tuning/scale-invariance.mjs --verify-determinism   # acceptance gate: same planet
 *                                                            # code -> identical metrics
 *
 * Metric groups:
 *   GATE     — land-erosion/smoothing-sensitive, resolution-independent by
 *              intent; these carry the pass/fail signal.
 *   CONTROL  — quantities that are already ~resolution-invariant (land
 *              fraction, ocean-floor stats untouched by land-only erosion).
 *              Their spread defines the achievable noise floor.
 *   RECORDED — everything else in the scorecard, reported but ungated
 *              (e.g. coast_complexity_index legitimately rises with
 *              resolution — Richardson effect — so it must not gate).
 *
 * Seed control:
 *   The harness's original seed mechanism (patching Worker.prototype.postMessage)
 *   never fired, so every generation used `Math.floor(Math.random() * 16777216)`
 *   — the divergence numbers measured unrelated random worlds. Instead we drive
 *   the app's deterministic URL-hash planet-code path: encode seed + params with
 *   encodePlanetCode (js/planet-code.js, a pure function with no DOM access —
 *   safe to import directly here) and navigate to `${baseUrl}#${code}`. main.js
 *   decodes the hash, sets sliders, and calls generate(seed, ...) exactly once.
 *
 *   The harness computes metrics in-page from state.curData via the canonical
 *   computeTerrainMetrics, which is robust regardless of whether generation ran
 *   on the worker or the synchronous fallback — so it works whether or not
 *   window.__terrainMetrics ends up populated. No js/ files are modified; this
 *   only imports them.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { encodePlanetCode } from '../js/planet-code.js';
import { detailFromSlider } from '../js/detail-scale.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'scale-invariance-baseline.json');
const SHOT_DIR = path.join(__dirname, 'scale-invariance-screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--check') ? 'check'
           : process.argv.includes('--verify-determinism') ? 'verify-determinism'
           : 'report';

// First trustworthy measurement (2026-07-11, deterministic seed control via
// URL-hash planet codes): pre-fix GATE aggregate 0.2723 vs post-fix 0.2327,
// ratio 0.855 — the SP2 fixes measurably reduced cross-resolution GATE
// divergence. IMPROVE_FACTOR = ceil(ratio * 10) / 10 = 0.9 with a small
// margin: current must stay at or below 0.9x the recorded (pre-fix)
// baseline, i.e. within reach of the post-fix improvement rather than
// drifting back toward the old, worse behavior. This is a real regression
// gate, not a loose tripwire, now that both post-fix runs reproduced
// byte-for-byte identical metrics.
const IMPROVE_FACTOR = 0.9;

// Relative divergence (max-min)/|mean| is only meaningful when the metric's
// mean is well clear of zero. A near-zero-mean quantity — e.g.
// erosion_slope_correlation in the zero-erosion seed, where erosion is off —
// makes the ratio explode on pure measurement noise and carries no
// scale-invariance signal, so we exclude it. Every valid GATE/CONTROL metric
// here has |mean| >= 0.16; the artifact sits at ~0.004, so 0.05 separates them.
const MIN_MEAN_MAGNITUDE = 0.05;

// Detail ladder: slider positions -> ~5K / 31K / 100K / 299K / 801K regions.
// The 801K rung exercises the >300K range where the SP2 fixes actually bite.
// Climate skipping is the app's own per-rung decision (shouldSkipClimate,
// gated on AUTO_CLIMATE_THRESHOLD=300K): it runs for the <300K rungs and is
// skipped for 801K. Either way it is orthogonal to the terrain GATE metrics
// (computed from elevation before climate), so it affects only runtime.
const LADDER = [
  { pos: 0,   approxN: 5000 },
  { pos: 400, approxN: 31000 },
  { pos: 518, approxN: 100000 },
  { pos: 649, approxN: 299000 },
  { pos: 792, approxN: 801000 },
];

// Seeds: defaults (erosion at app-default sliders — glacial/hydraulic/thermal
// left null so the DOM defaults are used), high-erosion (maximizes the
// defect), zero-erosion (isolates the smoothing fixes from the erosion fixes).
const SEEDS = [
  { name: 'defaults',     seed: 42,  glacial: null, hydraulic: null, thermal: null },
  { name: 'high-erosion', seed: 300, glacial: 0.8,  hydraulic: 0.8,  thermal: 0.8 },
  { name: 'zero-erosion', seed: 500, glacial: 0,    hydraulic: 0,    thermal: 0 },
];

// Land-erosion/smoothing-sensitive, resolution-independent by intent.
const GATE_KEYS = [
  'relief_headroom', 'peak_clustering', 'hypsometry_trough_depth',
  'land_mode_elev', 'erosion_slope_correlation',
];
// Already ~invariant: land fraction (computed below) + ocean-floor stats
// (erosion is land-only; smoothElevation locks coasts).
const CONTROL_KEYS = ['land_fraction', 'ocean_mode_elev', 'ocean_elev_stddev'];

const MIME = {
  '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript',
  '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2',
  '.webmanifest':'application/manifest+json', '.txt':'text/plain', '.xml':'application/xml', '.wasm':'application/wasm',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
      const filePath = path.join(PROJECT_ROOT, urlPath);
      if (!filePath.startsWith(PROJECT_ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Read the app's current (default) slider values from the DOM. These are
// static HTML attribute values, identical across every call, so we read
// them once per browser session rather than once per (seed, rung).
async function readDefaultSliders(browser, baseUrl) {
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return await page.evaluate(() => {
      const val = (id) => +document.getElementById(id).value;
      return {
        jitter: val('sJ'), P: val('sP'), numContinents: val('sCn'),
        roughness: val('sNs'), terrainWarp: val('sTw'), smoothing: val('sS'),
        glacialErosion: val('sGl'), hydraulicErosion: val('sHEr'), thermalErosion: val('sTEr'),
        ridgeSharpening: val('sRs'), continentSizeVariety: val('sCsv'),
        temperatureOffset: val('sTmp'), precipitationOffset: val('sPrc'), landCoverage: val('sLc'),
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

// Build a deterministic planet code for (seed config, rung) against the
// app's current DOM defaults for every param the seed config doesn't override.
function buildPlanetCode(sc, rung, defaults) {
  const N = detailFromSlider(rung.pos);
  return encodePlanetCode(
    sc.seed,
    N,
    defaults.jitter,
    defaults.P,
    defaults.numContinents,
    defaults.roughness,
    defaults.terrainWarp,
    defaults.smoothing,
    sc.glacial ?? defaults.glacialErosion,
    sc.hydraulic ?? defaults.hydraulicErosion,
    sc.thermal ?? defaults.thermalErosion,
    defaults.ridgeSharpening,
    0.75, // soilCreep: fixed app constant — main.js hardcodes 0.75, no UI slider exists
    defaults.continentSizeVariety,
    defaults.temperatureOffset,
    defaults.precipitationOffset,
    defaults.landCoverage,
    [],
  );
}

async function generateAndMeasure(browser, baseUrl, sc, rung, defaults, shotName) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 900 });
    page.on('dialog', (d) => d.dismiss());
    page.on('pageerror', (e) => console.log(`  [PAGE EXCEPTION] ${e.message}`));

    const code = buildPlanetCode(sc, rung, defaults);
    await page.goto(`${baseUrl}#${code}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await page.evaluate(() => {
      for (const id of ['tutorialOverlay', 'whatsNewOverlay']) {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
      }
    });

    // The hash-load path in main.js fires exactly one generate() call; wait
    // for it to finish (button re-enabled by resetUI()).
    await page.waitForFunction(
      () => !document.getElementById('generate').disabled,
      { timeout: 600_000, polling: 250 },
    );

    // Compute metrics in-page from the retained state.curData via the
    // canonical computeTerrainMetrics — see module docstring. This works
    // regardless of whether generation ran on the worker or the fallback.
    const metrics = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { computeTerrainMetrics } = await import('/js/terrain-metrics.js');
      const d = state.curData;
      if (!d) return { _error: 'no curData after generation' };
      try {
        return computeTerrainMetrics({
          mesh: d.mesh, r_xyz: d.r_xyz, r_elevation: d.r_elevation,
          r_plate: d.r_plate, plateIsOcean: d.plateIsOcean,
          r_stress: d.r_stress, debugLayers: d.debugLayers, prePostElev: d.prePostElev,
        });
      } catch (e) {
        return { _error: e.message };
      }
    });
    if (!metrics || metrics._error) {
      throw new Error(`no metrics for ${sc.name}@${rung.pos}: ${metrics && metrics._error}`);
    }
    // Derived control: land fraction (land_cells is a raw count ∝ N).
    metrics.land_fraction = metrics.land_cells / (rung.approxN + 1);

    if (shotName) {
      // Advisory screenshot for the visual A/B grid (sidebar collapsed first).
      await page.click('#sidebarToggle').catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
      const canvas = await page.$('#canvas');
      if (canvas) {
        await canvas.screenshot({ path: path.join(SHOT_DIR, `${shotName}.png`) }).catch(() => {});
      }
    }
    return metrics;
  } finally {
    await page.close().catch(() => {});
  }
}

// Normalized spread of one metric across the ladder.
function divergence(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return null;
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
  if (Math.abs(mean) < MIN_MEAN_MAGNITUDE) return null;
  return (Math.max(...nums) - Math.min(...nums)) / (Math.abs(mean) + 1e-9);
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    // The synchronous fallback path blocks the main thread for the whole
    // generation, so CDP calls (Runtime.callFunctionOn, etc.) need a long
    // protocol timeout or they time out mid-generation.
    protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl',
           '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  });
}

async function verifyDeterminism(browser, baseUrl) {
  const defaults = await readDefaultSliders(browser, baseUrl);
  const rung = LADDER[0]; // fast rung, ~5K regions
  const scDefault = SEEDS[0]; // seed 42, app-default erosion
  const scOther = { name: 'seed999', seed: 999, glacial: null, hydraulic: null, thermal: null };

  console.log(`Generating seed 42, run 1 @ slider ${rung.pos} (~${rung.approxN.toLocaleString()} regions)...`);
  const run1 = await generateAndMeasure(browser, baseUrl, scDefault, rung, defaults);
  console.log(`Generating seed 42, run 2 @ slider ${rung.pos} (~${rung.approxN.toLocaleString()} regions)...`);
  const run2 = await generateAndMeasure(browser, baseUrl, scDefault, rung, defaults);
  console.log(`Generating seed 999 @ slider ${rung.pos} (~${rung.approxN.toLocaleString()} regions)...`);
  const run3 = await generateAndMeasure(browser, baseUrl, scOther, rung, defaults);

  console.log('\n=== --verify-determinism ===');
  console.log(`seed42 run1: land_cells=${run1.land_cells}  relief_headroom=${run1.relief_headroom}`);
  console.log(`seed42 run2: land_cells=${run2.land_cells}  relief_headroom=${run2.relief_headroom}`);
  console.log(`seed999:     land_cells=${run3.land_cells}  relief_headroom=${run3.relief_headroom}`);

  const sameSeedReproducible = run1.land_cells === run2.land_cells && run1.relief_headroom === run2.relief_headroom;
  const seedMatters = run1.land_cells !== run3.land_cells;

  console.log(`\nSAME-SEED REPRODUCIBLE: ${sameSeedReproducible ? 'YES' : 'NO'} (run1 land_cells=${run1.land_cells} vs run2 land_cells=${run2.land_cells})`);
  console.log(`SEED MATTERS:            ${seedMatters ? 'YES' : 'NO'} (seed42 land_cells=${run1.land_cells} vs seed999 land_cells=${run3.land_cells})`);

  if (sameSeedReproducible && seedMatters) {
    console.log('\nPASS: seed is under harness control.');
    return true;
  }
  console.log('\nFAIL: seed is NOT under harness control.');
  if (!sameSeedReproducible) console.log('  -> identical planet codes produced different metrics (non-determinism).');
  if (!seedMatters) console.log('  -> different seeds produced identical metrics (seed not wired through).');
  return false;
}

async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await launchBrowser();

  try {
    if (MODE === 'verify-determinism') {
      const ok = await verifyDeterminism(browser, baseUrl);
      if (!ok) process.exit(1);
      return;
    }

    const defaults = await readDefaultSliders(browser, baseUrl);
    const perSeed = {};
    for (const sc of SEEDS) {
      const rows = [];
      for (const rung of LADDER) {
        console.log(`Generating ${sc.name} @ slider ${rung.pos} (~${rung.approxN.toLocaleString()} regions)...`);
        rows.push(await generateAndMeasure(browser, baseUrl, sc, rung, defaults, `${sc.name}_pos${rung.pos}`));
      }
      // Divergence per metric key present in all rungs.
      const allKeys = new Set(rows.flatMap((r) => Object.keys(r)));
      const D = {};
      for (const k of allKeys) {
        if (k.startsWith('_')) continue;
        const d = divergence(rows.map((r) => r[k]));
        if (d !== null) D[k] = +d.toFixed(4);
      }
      perSeed[sc.name] = { D, rows };
    }

    const agg = (keys) => {
      const vals = [];
      for (const sc of SEEDS) {
        for (const k of keys) {
          const d = perSeed[sc.name].D[k];
          if (Number.isFinite(d)) vals.push(d);
        }
      }
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    const gateAgg = agg(GATE_KEYS);
    const controlAgg = agg(CONTROL_KEYS);

    console.log('\n=== Divergence across the Detail ladder (0 = perfectly scale-invariant) ===');
    for (const sc of SEEDS) {
      console.log(`\n[${sc.name}]`);
      for (const k of [...GATE_KEYS, ...CONTROL_KEYS]) {
        const tag = GATE_KEYS.includes(k) ? 'GATE   ' : 'CONTROL';
        console.log(`  ${tag} ${k}: ${perSeed[sc.name].D[k] ?? 'n/a'}`);
      }
    }
    console.log(`\nGATE aggregate:    ${gateAgg?.toFixed(4)}`);
    console.log(`CONTROL aggregate: ${controlAgg?.toFixed(4)} (noise floor)`);

    if (MODE === 'baseline') {
      fs.writeFileSync(BASELINE_PATH, JSON.stringify({ gateAgg, controlAgg, perSeed }, null, 2));
      console.log(`\nBaseline written to ${path.relative(PROJECT_ROOT, BASELINE_PATH)}`);
      return;
    }

    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    console.log(`\nBaseline GATE aggregate: ${baseline.gateAgg?.toFixed(4)}  ->  current: ${gateAgg?.toFixed(4)}`);
    const target = baseline.gateAgg * IMPROVE_FACTOR;
    const pass = gateAgg <= target;
    console.log(pass
      ? `PASS: ${gateAgg.toFixed(4)} <= ${target.toFixed(4)} (${IMPROVE_FACTOR} x baseline)`
      : `FAIL: ${gateAgg.toFixed(4)} > ${target.toFixed(4)} (${IMPROVE_FACTOR} x baseline)`);
    if (MODE === 'check' && !pass) process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
