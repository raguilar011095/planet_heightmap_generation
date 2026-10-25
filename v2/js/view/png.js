// PNG files written in the browser, without a library: greyscale at 8 or 16 bits by hand (zlib through the browser's
// CompressionStream — V1's encoder, js/planet-mesh.js encode16BitGrayscalePNG), colour through a canvas; and the download.

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

/**
 * A greyscale PNG: `data` is width × height values, rows top to bottom — a Uint16Array at 16 bits, a Uint8Array at 8.
 * Each row is filtered by its left neighbour (PNG's Sub filter: smooth heights compress several times better).
 * @returns {Promise<Blob>}
 */
export async function encodeGrayPng(width, height, data, bits = 16) {
    const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
    iv.setUint32(0, width); iv.setUint32(4, height);
    ihdr[8] = bits; ihdr[9] = 0;                                   // (colour type 0: greyscale)
    const bpp = bits >> 3, rowLen = 1 + width * bpp, raw = new Uint8Array(height * rowLen);
    for (let y = 0; y < height; y++) {
        const o = y * rowLen, row = y * width;
        raw[o] = 1;                                                 // (filter: Sub)
        if (bits === 16) {
            let prevHi = 0, prevLo = 0;
            for (let x = 0; x < width; x++) {
                const v = data[row + x], hi = (v >> 8) & 0xFF, lo = v & 0xFF;
                raw[o + 1 + 2 * x] = (hi - prevHi) & 0xFF; raw[o + 2 + 2 * x] = (lo - prevLo) & 0xFF;
                prevHi = hi; prevLo = lo;
            }
        } else {
            let prev = 0;
            for (let x = 0; x < width; x++) { const v = data[row + x] & 0xFF; raw[o + 1 + x] = (v - prev) & 0xFF; prev = v; }
        }
    }
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
    const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
    iv.setUint32(0, width); iv.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = 2;                                      // (8 bits, colour type 2: RGB)
    const rowLen = 1 + 3 * width, raw = new Uint8Array(height * rowLen);
    for (let y = 0; y < height; y++) {
        const o = y * rowLen, row = 4 * y * width;
        raw[o] = 1;                                                 // (filter: Sub)
        let pr = 0, pg = 0, pb = 0;
        for (let x = 0; x < width; x++) {
            const i = row + 4 * x, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], q = o + 1 + 3 * x;
            raw[q] = (r - pr) & 0xFF; raw[q + 1] = (g - pg) & 0xFF; raw[q + 2] = (b - pb) & 0xFF;
            pr = r; pg = g; pb = b;
        }
    }
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
    const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
    iv.setUint32(0, width); iv.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = 6;                                      // (8 bits, colour type 6: RGBA)
    const rowLen = 1 + 4 * width, raw = new Uint8Array(height * rowLen);
    for (let y = 0; y < height; y++) {
        const o = y * rowLen, row = 4 * y * width;
        raw[o] = 1;                                                 // (filter: Sub)
        let pr = 0, pg = 0, pb = 0, pa = 0;
        for (let x = 0; x < width; x++) {
            const i = row + 4 * x, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3], q = o + 1 + 4 * x;
            raw[q] = (r - pr) & 0xFF; raw[q + 1] = (g - pg) & 0xFF; raw[q + 2] = (b - pb) & 0xFF; raw[q + 3] = (a - pa) & 0xFF;
            pr = r; pg = g; pb = b; pa = a;
        }
    }
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
