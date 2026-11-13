// PNG files written in the browser, without a library: greyscale at 8 or 16 bits and colour by hand (zlib through the
// browser's CompressionStream — V1's encoder, js/planet-mesh.js encode16BitGrayscalePNG), whole or as their rows come
// (PngStream: a file too big to hold); a canvas's picture; and the download.

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

/** The CRC-32 of `buf` — or, given `prev` (the CRC of the bytes before), of those bytes and these: one file in pieces. */
export function crc32(buf, prev = 0) {
    let crc = (prev ^ 0xFFFFFFFF) >>> 0;
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

// ── the rows of a PNG: each filtered by its left neighbour (PNG's Sub filter: smooth heights compress several times
// better), as the kinds of picture the exports give — 'gray16' (a Uint16Array), 'gray8' (a Uint8Array), 'rgb' (RGBA
// bytes, the alpha dropped: the maps are opaque) and 'rgba' (RGBA bytes, kept: a layer on a clear ground) ──
const KINDS = { gray16: { bits: 16, type: 0, bpp: 2 }, gray8: { bits: 8, type: 0, bpp: 1 }, rgb: { bits: 8, type: 2, bpp: 3 }, rgba: { bits: 8, type: 6, bpp: 4 } };

/** `n` rows `width` pixels wide of a kind, filtered: (1 + width × its bytes a pixel) bytes a row. */
export function pngRows(kind, width, n, data) {
    const bpp = KINDS[kind].bpp, rowLen = 1 + width * bpp, raw = new Uint8Array(n * rowLen);
    for (let y = 0; y < n; y++) {
        const o = y * rowLen;
        raw[o] = 1;                                                 // (filter: Sub)
        if (kind === 'gray16') {
            const row = y * width;
            let prevHi = 0, prevLo = 0;
            for (let x = 0; x < width; x++) {
                const v = data[row + x], hi = (v >> 8) & 0xFF, lo = v & 0xFF;
                raw[o + 1 + 2 * x] = (hi - prevHi) & 0xFF; raw[o + 2 + 2 * x] = (lo - prevLo) & 0xFF;
                prevHi = hi; prevLo = lo;
            }
        } else if (kind === 'gray8') {
            const row = y * width;
            let prev = 0;
            for (let x = 0; x < width; x++) { const v = data[row + x] & 0xFF; raw[o + 1 + x] = (v - prev) & 0xFF; prev = v; }
        } else if (kind === 'rgb') {
            const row = 4 * y * width;
            let pr = 0, pg = 0, pb = 0;
            for (let x = 0; x < width; x++) {
                const i = row + 4 * x, r = data[i], g = data[i + 1], b = data[i + 2], q = o + 1 + 3 * x;
                raw[q] = (r - pr) & 0xFF; raw[q + 1] = (g - pg) & 0xFF; raw[q + 2] = (b - pb) & 0xFF;
                pr = r; pg = g; pb = b;
            }
        } else {
            const row = 4 * y * width;
            let pr = 0, pg = 0, pb = 0, pa = 0;
            for (let x = 0; x < width; x++) {
                const i = row + 4 * x, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3], q = o + 1 + 4 * x;
                raw[q] = (r - pr) & 0xFF; raw[q + 1] = (g - pg) & 0xFF; raw[q + 2] = (b - pb) & 0xFF; raw[q + 3] = (a - pa) & 0xFF;
                pr = r; pg = g; pb = b; pa = a;
            }
        }
    }
    return raw;
}
/** A PNG's header chunk for a picture of a kind. */
function ihdrOf(kind, width, height) {
    const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
    iv.setUint32(0, width); iv.setUint32(4, height);
    ihdr[8] = KINDS[kind].bits; ihdr[9] = KINDS[kind].type;
    return ihdr;
}
const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * A PNG written as its rows come, for a picture too big to hold whole (export-panel.js: an export drawn in bands, each
 * file in a worker — png-stream-worker.js): `sink(bytes)` (async) takes the file's bytes in order — the header, the
 * rows' deflated data as IDAT chunks of a few MB as the compressor gives it, the end. The same bytes, filtered and
 * deflated as one stream, as the whole encoders below would give (but split over its IDAT chunks).
 */
export class PngStream {
    constructor(sink, width, height, kind) { this.sink = sink; this.width = width; this.height = height; this.kind = kind; this.bytes = 0; this.rowsIn = 0; }
    async start() {
        await this.put(SIGNATURE); await this.put(chunk('IHDR', ihdrOf(this.kind, this.width, this.height)));
        const cs = new CompressionStream('deflate');
        this.writer = cs.writable.getWriter();
        // (the compressor's output gathered into chunks of ≥ 4 MB, each written as it fills)
        this.pump = (async () => {
            const reader = cs.readable.getReader(), CH = 4 * 2 ** 20;
            let parts = [], size = 0;
            const flush = async () => {
                if (!size) return;
                const z = new Uint8Array(size);
                let o = 0; for (const p of parts) { z.set(p, o); o += p.length; }
                parts = []; size = 0;
                await this.put(chunk('IDAT', z));
            };
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                parts.push(value); size += value.length;
                if (size >= CH) await flush();
            }
            await flush();
        })();
        // (the sink failing — the disk full, the folder gone — ends the stream: the writer aborted, so rows() waiting on
        // it fails at once rather than waiting on a compressor whose output no one takes)
        this.pump = this.pump.catch(e => { this.failed = e; this.writer.abort(e).catch(() => {}); throw e; });
        this.pump.catch(() => {});
    }
    async put(bytes) { await this.sink(bytes); this.bytes += bytes.length; }
    /** `n` rows of the picture (its kind's data, `width` pixels a row), the next ones down. */
    async rows(data, n) {
        if (this.failed) throw this.failed;
        if (this.rowsIn + n > this.height) throw new Error('more rows than the picture has');
        this.rowsIn += n;
        await this.writer.ready;
        await this.writer.write(pngRows(this.kind, this.width, n, data));
    }
    /** The last rows given: the compressor emptied, the end written. @returns {Promise<number>} the file's bytes */
    async end() {
        if (this.failed) throw this.failed;
        if (this.rowsIn !== this.height) throw new Error(`${this.rowsIn} of ${this.height} rows given`);
        await this.writer.close(); await this.pump;
        await this.put(chunk('IEND', new Uint8Array(0)));
        return this.bytes;
    }
    abort() { this.writer?.abort().catch(() => {}); }
}

/**
 * A greyscale PNG: `data` is width × height values, rows top to bottom — a Uint16Array at 16 bits, a Uint8Array at 8.
 * Each row is filtered by its left neighbour (PNG's Sub filter: smooth heights compress several times better).
 * @returns {Promise<Blob>}
 */
export async function encodeGrayPng(width, height, data, bits = 16) {
    const kind = bits === 16 ? 'gray16' : 'gray8', ihdr = ihdrOf(kind, width, height), raw = pngRows(kind, width, height, data);
    const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter();
    writer.write(raw); writer.close();
    const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
    return new Blob(parts, { type: 'image/png' });
}

/**
 * A colour PNG without a canvas (no browser canvas-size limit): `rgba` is width × height × 4 bytes (an ImageData's data,
 * say), written as RGB — the alpha dropped, the maps are opaque — each row filtered by its left neighbour.
 * @returns {Promise<Blob>}
 */
export async function encodeRgbPng(width, height, rgba) {
    const ihdr = ihdrOf('rgb', width, height), raw = pngRows('rgb', width, height, rgba);
    const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter();
    writer.write(raw); writer.close();
    const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}

/**
 * A colour PNG with its transparency (colour type 6, RGBA) — for a layer on a clear ground (rivers alone, a projection's
 * outside): `rgba` is width × height × 4 bytes, each row filtered by its left neighbour.
 * @returns {Promise<Blob>}
 */
export async function encodeRgbaPng(width, height, rgba) {
    const ihdr = ihdrOf('rgba', width, height), raw = pngRows('rgba', width, height, rgba);
    const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter();
    writer.write(raw); writer.close();
    const z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}

/** A canvas of the given size (an OffscreenCanvas where there is one). */
export function canvasOf(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    return c;
}

/** A canvas as a PNG (colour, with its transparency). @returns {Promise<Blob>} */
export function canvasPng(canvas) {
    if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('the picture could not be encoded (too large for this browser?)'))), 'image/png'));
}

/** Save a file: a link clicked, the object URL let go a little later. */
export function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
