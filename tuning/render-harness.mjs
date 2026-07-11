/**
 * Headless rendering harness for World Orogen.
 *
 * Launches a local HTTP server, drives the app with Puppeteer, generates
 * planets from fixed seeds/slider combos, and saves globe screenshots to
 * tuning/screenshots/.
 *
 * Usage:  node tuning/render-harness.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// MIME types for the static server
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
  '.wasm': 'application/wasm',
};

// ---------------------------------------------------------------------------
// Static file server
// ---------------------------------------------------------------------------
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

      const filePath = path.join(PROJECT_ROOT, urlPath);

      // Security: stay inside project root
      if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403); res.end(); return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`Static server listening on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
const DETAIL_SLIDER_VALUE = 400;   // ~31 000 regions — fast iteration

const TEST_CASES = [
  {
    name: 'default',
    seed: '42',
    sliders: {},
  },
  {
    name: 'few-plates-high-land',
    seed: '100',
    sliders: { sP: 8, sLc: 0.6 },
  },
  {
    name: 'many-plates-low-land',
    seed: '200',
    sliders: { sP: 80, sLc: 0.25 },
  },
  {
    name: 'high-erosion',
    seed: '300',
    sliders: { sGl: 0.8, sHEr: 0.8, sTEr: 0.8 },
  },
  {
    name: 'mountainous-sharp-ridges',
    seed: '400',
    sliders: { sNs: 0.4, sRs: 0.8 },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set a slider's value and dispatch an 'input' event so the app reacts. */
async function setSlider(page, id, value) {
  await page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Slider #${id} not found`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value: String(value) });
}

/**
 * Install a one-shot listener for 'generate-done' on #generate BEFORE
 * clicking the button, and return a promise that resolves when it fires.
 * Call this, store the promise, click the button, then await the promise.
 */
function installGenerationWaiter(page, timeoutMs = 120_000) {
  // page.evaluate returns a promise that resolves when the inner promise does
  return page.evaluate((timeout) => {
    return new Promise((resolve, reject) => {
      const btn = document.getElementById('generate');
      const timer = setTimeout(() => reject(new Error('Generation timed out')), timeout);
      btn.addEventListener('generate-done', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }, timeoutMs);
}

/** Rotate the globe by dragging horizontally (yaw) and/or vertically (pitch). */
async function rotateGlobe(page, yawRadians, pitchRadians = 0) {
  await page.evaluate(({ yaw, pitch }) => {
    const canvas = document.getElementById('canvas');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    // OrbitControls maps 2*PI rotation to a full canvas-width/height drag.
    const dx = (yaw / (2 * Math.PI)) * w;
    const dy = (pitch / (Math.PI)) * h;

    const pointerDown = new PointerEvent('pointerdown', {
      clientX: cx, clientY: cy, button: 0, bubbles: true, pointerId: 1,
    });
    const pointerMove = new PointerEvent('pointermove', {
      clientX: cx - dx, clientY: cy - dy, button: 0, bubbles: true, pointerId: 1,
    });
    const pointerUp = new PointerEvent('pointerup', {
      clientX: cx - dx, clientY: cy - dy, button: 0, bubbles: true, pointerId: 1,
    });

    canvas.dispatchEvent(pointerDown);
    canvas.dispatchEvent(pointerMove);
    canvas.dispatchEvent(pointerUp);
  }, { yaw: yawRadians, pitch: pitchRadians });

  // Let the render loop catch up.
  await new Promise((r) => setTimeout(r, 1500));
}

/** Take a screenshot of the canvas element. */
async function screenshotCanvas(page, filePath) {
  const canvas = await page.$('#canvas');
  if (!canvas) throw new Error('Canvas not found');
  await canvas.screenshot({ path: filePath });
  console.log(`  Saved: ${path.relative(PROJECT_ROOT, filePath)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
    ],
  });

  try {
    for (const tc of TEST_CASES) {
      console.log(`\n=== Test case: ${tc.name} (seed ${tc.seed}) ===`);
      let page;
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 900 });

        // Suppress dialogs / permission prompts
        page.on('dialog', (d) => d.dismiss());

        // Forward page console and errors for debugging
        page.on('console', (msg) => {
          if (msg.type() === 'error') console.log(`  [PAGE ERROR] ${msg.text()}`);
        });
        page.on('pageerror', (err) => console.log(`  [PAGE EXCEPTION] ${err.message}`));

        // Navigate and wait for initial load
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        // Wait for ES modules and Three.js to initialize
        await new Promise((r) => setTimeout(r, 2000));

        // Close any overlay that may be showing (tutorial / what's new)
        await page.evaluate(() => {
          for (const id of ['tutorialOverlay', 'whatsNewOverlay']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          }
        });

        // The app auto-generates once on load with a random seed and default
        // sliders (js/main.js), and #generate stays disabled until that
        // generation finishes. If we proceed before it settles, the click
        // below is a no-op and the harness ends up capturing the random
        // auto-gen instead of our seeded case. Wait for it to fully finish.
        await page.waitForFunction(() => {
          const o = document.getElementById('buildOverlay');
          const b = document.getElementById('generate');
          return o && o.classList.contains('hidden') && b && !b.disabled;
        }, { timeout: 180000 });

        // Set detail slider low for fast iteration
        await setSlider(page, 'sN', DETAIL_SLIDER_VALUE);

        // Set any custom sliders for this test case
        for (const [id, val] of Object.entries(tc.sliders)) {
          await setSlider(page, id, val);
        }

        // Intercept the Web Worker postMessage to inject our fixed seed.
        // The generate() function passes seed as `undefined` for fresh builds,
        // and the worker fills it with Math.random(). We patch postMessage so
        // the next 'generate' command carries our chosen seed instead.
        await page.evaluate((seed) => {
          const origPost = Worker.prototype.postMessage;
          Worker.prototype.postMessage = function(msg, ...rest) {
            if (msg && msg.cmd === 'generate' && msg.seed === undefined) {
              msg.seed = Number(seed);
              msg.computeMetrics = true;
            }
            return origPost.call(this, msg, ...rest);
          };
        }, tc.seed);

        // Install the completion listener BEFORE clicking, then click, then await.
        const t0 = performance.now();
        const genDone = installGenerationWaiter(page, 120_000);
        // Small delay so the evaluate above has time to register the listener
        await new Promise((r) => setTimeout(r, 100));
        // For detail/erosion-only cases (no plate-affecting slider change) the
        // click handler would otherwise see isRebuild=true and reuse the prior
        // seed, so the postMessage patch's `msg.seed === undefined` check never
        // fires and our seed is silently ignored. Stripping 'stale' forces
        // seed=undefined so the patch above actually injects tc.seed.
        await page.evaluate(() => {
          const b = document.getElementById('generate');
          if (b) b.classList.remove('stale');
        });
        await page.click('#generate');

        // Wait for generation to finish
        await genDone;

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        console.log(`  Generation completed in ${elapsed}s`);

        // Let rendering settle
        await new Promise((r) => setTimeout(r, 1000));

        // Extract terrain metrics scorecard
        const metrics = await page.evaluate(() => window.__terrainMetrics);
        if (metrics) {
          const metricsPath = path.join(SCREENSHOT_DIR, `seed-${tc.seed}_${tc.name}_metrics.json`);
          fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
          console.log(`  Metrics: ${path.relative(PROJECT_ROOT, metricsPath)}`);
          if (metrics._error) console.warn(`  Metrics error: ${metrics._error}`);
        } else {
          console.warn('  No terrain metrics available');
        }

        // Collapse the side panel to maximize canvas area
        await page.click('#sidebarToggle');
        // Let the panel animate closed and Three.js resize
        await new Promise((r) => setTimeout(r, 800));

        // Take globe screenshots covering the full planet:
        // 4 equatorial rotations (0°, 90°, 180°, 270°) + north pole + south pole
        const base = `seed-${tc.seed}_${tc.name}`;

        // Equatorial views — rotate around Y axis
        for (let i = 0; i < 4; i++) {
          if (i > 0) await rotateGlobe(page, Math.PI / 2, 0);
          await screenshotCanvas(page, path.join(SCREENSHOT_DIR, `${base}_eq-${i * 90}.png`));
        }

        // North pole — tilt camera up
        await rotateGlobe(page, 0, -Math.PI / 2.2);
        await screenshotCanvas(page, path.join(SCREENSHOT_DIR, `${base}_north-pole.png`));

        // South pole — tilt camera down (reset first, then go down)
        await rotateGlobe(page, 0, Math.PI / 1.1);
        await screenshotCanvas(page, path.join(SCREENSHOT_DIR, `${base}_south-pole.png`));
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
    server.close();
    console.log('\nDone. Screenshots saved to tuning/screenshots/');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
