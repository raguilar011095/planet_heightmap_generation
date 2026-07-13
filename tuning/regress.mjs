/**
 * Golden-master regression harness for World Orogen.
 *
 * Generates a fixed basket of planets headlessly and hashes the worker's
 * deterministic output arrays (elevation + climate). SP1's contract is that
 * these hashes never change; SP2/SP3 reuse this file in --diff mode to see
 * intended changes.
 *
 *   node tuning/regress.mjs --update   # write baseline
 *   node tuning/regress.mjs            # check against baseline (default)
 *   node tuning/regress.mjs --diff     # report changed arrays, don't fail
 *
 * Screenshots are saved to tuning/regress-screenshots/ for optional human
 * comparison but are NOT hash-asserted (GPU rasterization isn't bit-stable).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'regress-baseline.json');
const SHOT_DIR = path.join(__dirname, 'regress-screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const MODE = process.argv.includes('--update') ? 'update'
           : process.argv.includes('--diff') ? 'diff'
           : 'check';

// Fixed basket: 3 seeds x 3 detail levels + one extra. All detail levels are
// below AUTO_CLIMATE_THRESHOLD (300k) so climate is computed inline and its
// arrays are present in state.curData for hashing.
const CASES = [
  { name: 'seed42-d5k',   seed: 42,  detail: 0,   sliders: {} },   // detail slider 0 -> 5,000 regions
  { name: 'seed42-d50k',  seed: 42,  detail: 300, sliders: {} },
  { name: 'seed42-d200k', seed: 42,  detail: 470, sliders: {} },
  { name: 'seed100-d50k', seed: 100, detail: 300, sliders: { sP: 8,  sLc: 0.6 } },
  { name: 'seed200-d50k', seed: 200, detail: 300, sliders: { sP: 80, sLc: 0.25 } },
  { name: 'seed300-d50k', seed: 300, detail: 300, sliders: { sGl: 0.8, sHEr: 0.8, sTEr: 0.8 } },
];

// Arrays to hash (only those present are hashed; climate ones appear <300k).
const HASH_KEYS = [
  'r_elevation', 't_elevation',
  'r_precip_summer', 'r_precip_winter',
  'r_temperature_summer', 'r_temperature_winter',
];

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

async function hashCase(page, tc) {
  await page.evaluate(() => { window.__WO_CAPTURE = true; });

  // Overlays off, detail + sliders set.
  await page.evaluate(() => {
    for (const id of ['tutorialOverlay', 'whatsNewOverlay']) {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    }
  });

  // The app auto-generates once on load with a random seed and default
  // sliders (js/main.js), and #generate stays disabled with #buildOverlay
  // (pointer-events: auto) covering it until that generation finishes. If we
  // click before it settles the click is a no-op and the harness ends up
  // hashing the random auto-gen instead of our seeded case. Wait for it to
  // fully finish so the generate-done waiter installed below catches OUR
  // generation, not the auto-gen's.
  await page.waitForFunction(() => {
    const o = document.getElementById('buildOverlay');
    const b = document.getElementById('generate');
    return o && o.classList.contains('hidden') && b && !b.disabled;
  }, { timeout: 180_000 });

  await page.evaluate(({ id, value }) => {
    const el = document.getElementById(id); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id: 'sN', value: String(tc.detail) });
  for (const [id, val] of Object.entries(tc.sliders)) {
    await page.evaluate(({ id, value }) => {
      const el = document.getElementById(id); el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { id, value: String(val) });
  }

  // Inject fixed seed by patching the next 'generate' postMessage.
  await page.evaluate((seed) => {
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (msg, ...rest) {
      if (msg && msg.cmd === 'generate' && msg.seed === undefined) msg.seed = Number(seed);
      return orig.call(this, msg, ...rest);
    };
  }, tc.seed);

  const done = page.evaluate((timeout) => new Promise((resolve, reject) => {
    const btn = document.getElementById('generate');
    const timer = setTimeout(() => reject(new Error('gen timeout')), timeout);
    btn.addEventListener('generate-done', () => { clearTimeout(timer); resolve(); }, { once: true });
  }), 180_000);
  await new Promise((r) => setTimeout(r, 100));

  // For detail/erosion-only cases (no PLATE_SLIDERS change) the click handler
  // would otherwise see isRebuild=true and reuse state.curData.seed, so the
  // postMessage patch's `msg.seed === undefined` check never fires and our
  // seed is silently ignored. Stripping 'stale' forces seed=undefined so the
  // patch above actually injects tc.seed.
  await page.evaluate(() => {
    const b = document.getElementById('generate');
    if (b) b.classList.remove('stale');
  });
  await page.click('#generate');
  await done;
  await new Promise((r) => setTimeout(r, 500));

  // Hash arrays in-page (cyrb53 over the raw bytes) — only short hex crosses the bridge.
  const hashes = await page.evaluate((keys) => {
    const cyrb53 = (bytes) => {
      let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
      for (let i = 0; i < bytes.length; i++) {
        const ch = bytes[i];
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    };
    const d = window.__WO_state && window.__WO_state.curData;
    const out = {};
    if (!d) return out;
    for (const k of keys) {
      const arr = d[k];
      if (arr && arr.buffer) out[k] = `${arr.length}:${cyrb53(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))}`;
    }
    return out;
  }, HASH_KEYS);

  // Advisory screenshot (not asserted).
  const canvas = await page.$('#canvas');
  if (canvas) await canvas.screenshot({ path: path.join(SHOT_DIR, `${tc.name}.png`) }).catch(() => {});

  return hashes;
}

async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl',
           '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  });

  const results = {};
  try {
    for (const tc of CASES) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 900 });
      page.on('dialog', (d) => d.dismiss());
      page.on('pageerror', (e) => console.log(`  [PAGE EXCEPTION] ${e.message}`));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await new Promise((r) => setTimeout(r, 2000));
      console.log(`Generating ${tc.name}...`);
      results[tc.name] = await hashCase(page, tc);
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (MODE === 'update') {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(results, null, 2));
    console.log(`\nBaseline written to ${path.relative(PROJECT_ROOT, BASELINE_PATH)}`);
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  let mismatches = 0;
  for (const tc of CASES) {
    const a = baseline[tc.name] || {}, b = results[tc.name] || {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] !== b[k]) {
        mismatches++;
        console.log(`  CHANGED ${tc.name}.${k}: ${a[k]} -> ${b[k]}`);
      }
    }
  }
  if (mismatches === 0) console.log('\nAll cases byte-identical to baseline.');
  else console.log(`\n${mismatches} array(s) differ from baseline.`);
  if (MODE === 'check' && mismatches > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
