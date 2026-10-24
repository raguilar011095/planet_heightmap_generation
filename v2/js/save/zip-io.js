// The planet file's ZIP (plans/V2_SAVE_LOAD_PLAN.md), written and read without a library: each entry deflated by the
// browser's CompressionStream (ZIP's method 8 — any unzip tool opens the file) and written from pieces (a detailed
// moment's arrays one after another, never copied into one), read back in pieces through DecompressionStream, its CRC
// checked. Under 4 GB in all (no ZIP64), as view/zip.js (the exports' ZIP: stored, its PNGs compressed already).

import { crc32 } from '../view/png.js';

/** The time now as DOS time and date (what ZIP records). */
function dosTime(d = new Date()) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
const enc = new TextEncoder(), dec = new TextDecoder();

export class ZipWriter {
    constructor() { this.parts = []; this.central = []; this.offset = 0; Object.assign(this, dosTime()); }

    /**
     * An entry from `pieces` (Uint8Arrays: an iterable, or an async one), deflated (or stored); `onBytes(n)` as each
     * piece is taken.
     */
    async add(name, pieces, { deflate = true, onBytes = () => {} } = {}) {
        let crc = 0, size = 0, data;
        const feed = async put => { for await (const p of pieces) { crc = crc32(p, crc); size += p.length; await put(p); onBytes(p.length); } };
        if (deflate) {
            const cs = new CompressionStream('deflate-raw'), out = new Response(cs.readable).blob(), w = cs.writable.getWriter();
            await feed(p => w.write(p));
            await w.close();
            data = await out;
        } else {
            const kept = [];
            await feed(p => { kept.push(p.slice()); });
            data = new Blob(kept);
        }
        const nm = enc.encode(name), method = deflate ? 8 : 0;
        const head = new Uint8Array(30 + nm.length), h = new DataView(head.buffer);
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
        h.setUint16(10, this.time, true); h.setUint16(12, this.date, true); h.setUint32(14, crc, true);
        h.setUint32(18, data.size, true); h.setUint32(22, size, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
        head.set(nm, 30);
        const dir = new Uint8Array(46 + nm.length), c = new DataView(dir.buffer);
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
        c.setUint16(12, this.time, true); c.setUint16(14, this.date, true); c.setUint32(16, crc, true); c.setUint32(20, data.size, true); c.setUint32(24, size, true);
        c.setUint16(28, nm.length, true); c.setUint32(42, this.offset, true);
        dir.set(nm, 46);
        this.parts.push(head, data); this.central.push(dir);
        this.offset += head.length + data.size;
        if (this.offset > 0xFFFFFFFF || size > 0xFFFFFFFF) throw new Error('the planet is too big for one file (over 4 GB)');
        return { size, packed: data.size };
    }

    /** The ZIP, every entry added. @returns {Blob} */
    finish(type = 'application/octet-stream') {
        const n = this.central.length, dirSize = this.central.reduce((a, d) => a + d.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
        if (n > 0xFFFF) throw new Error('the planet has too many parts for one file');
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, n, true); e.setUint16(10, n, true);
        e.setUint32(12, dirSize, true); e.setUint32(16, this.offset, true);
        return new Blob([...this.parts, ...this.central, end], { type });
    }
}

export class ZipReader {
    constructor(blob, entries) { this.blob = blob; this.entries = entries; }

    /** A ZIP's directory, read from the end of the file (a File or a Blob: only the parts asked for are read). */
    static async open(blob) {
        const tail = Math.min(blob.size, 22 + 0xFFFF), buf = new Uint8Array(await blob.slice(blob.size - tail).arrayBuffer()), t = new DataView(buf.buffer);
        let e = -1;
        for (let i = buf.length - 22; i >= 0; i--) if (t.getUint32(i, true) === 0x06054b50) { e = i; break; }
        if (e < 0) throw new Error('not a planet file (it is not a ZIP)');
        const count = t.getUint16(e + 10, true), size = t.getUint32(e + 12, true), at = t.getUint32(e + 16, true);
        const cd = new Uint8Array(await blob.slice(at, at + size).arrayBuffer()), c = new DataView(cd.buffer), entries = new Map();
        for (let p = 0, k = 0; k < count; k++) {
            if (p + 46 > cd.length || c.getUint32(p, true) !== 0x02014b50) throw new Error('the planet file is damaged (its directory)');
            const nl = c.getUint16(p + 28, true), name = dec.decode(cd.subarray(p + 46, p + 46 + nl));
            entries.set(name, { name, method: c.getUint16(p + 10, true), crc: c.getUint32(p + 16, true), packed: c.getUint32(p + 20, true), size: c.getUint32(p + 24, true), local: c.getUint32(p + 42, true) });
            p += 46 + nl + c.getUint16(p + 30, true) + c.getUint16(p + 32, true);
        }
        return new ZipReader(blob, entries);
    }

    has(name) { return this.entries.has(name); }

    /** An entry's bytes, piece by piece, as they are decompressed — its size and CRC checked at the end. */
    async *pieces(name) {
        const e = this.entries.get(name);
        if (!e) throw new Error(`the planet file is missing ${name}`);
        const h = new DataView(await this.blob.slice(e.local, e.local + 30).arrayBuffer());
        if (h.getUint32(0, true) !== 0x04034b50) throw new Error(`the planet file is damaged (${name})`);
        const start = e.local + 30 + h.getUint16(26, true) + h.getUint16(28, true);
        let stream = this.blob.slice(start, start + e.packed).stream();
        if (e.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
        else if (e.method !== 0) throw new Error(`the planet file uses a compression this page cannot read (${name})`);
        const reader = stream.getReader();
        let crc = 0, size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            crc = crc32(value, crc); size += value.length;
            yield value;
        }
        if (size !== e.size || crc !== e.crc) throw new Error(`the planet file is damaged (${name})`);
    }

    /** An entry's bytes, whole. */
    async bytes(name) {
        const parts = [];
        let n = 0;
        for await (const p of this.pieces(name)) { parts.push(p); n += p.length; }
        const out = new Uint8Array(n);
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    }
    async json(name) { return JSON.parse(dec.decode(await this.bytes(name))); }
}
