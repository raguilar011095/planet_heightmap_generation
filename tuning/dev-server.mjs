/**
 * Minimal static dev server that mimics the production host's clean URLs
 * (so `/import` resolves to `import.html`, matching orogen.studio).
 *
 * Usage:  node tuning/dev-server.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.argv[2] || 8000);

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2',
    '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};

function resolveFile(urlPath) {
    let p = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
    if (p === '/' || p === '') p = '/index.html';
    const candidates = [p];
    if (!path.extname(p)) { candidates.push(p + '.html', path.join(p, 'index.html')); }
    for (const c of candidates) {
        const fp = path.join(ROOT, c);
        if (fp.startsWith(ROOT) && fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp;
    }
    return null;
}

http.createServer((req, res) => {
    // a directory asked for without its trailing slash (/v2) → redirect to /v2/, as the production host does,
    // so the page's relative links resolve inside the directory
    const url = new URL(req.url, 'http://x'), dir = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!url.pathname.endsWith('/') && dir.startsWith(ROOT) && fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'index.html'))) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search }); res.end(); return;
    }
    const fp = resolveFile(req.url);
    if (!fp) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
}).listen(PORT, () => console.log(`World Orogen dev server → http://localhost:${PORT}  (clean URLs, /import works)`));
