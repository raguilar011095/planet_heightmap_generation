// The PNG files of an export drawn in bands (export-panel.js, through png-stream.js), written in a worker as their rows
// come — each a PngStream (png.js) onto a file the person picked (a FileSystemFileHandle: its createWritable), so the
// page's thread only draws. Each file's messages are handled in the order sent.
// In:  {t: 'open', id, seq, handle, width, height, kind} · {t: 'rows', id, seq, buf, n} (buf: the rows' data, as `kind`
//      — a Uint16Array's buffer for 'gray16', bytes else) · {t: 'close', id, seq} · {t: 'abort', id, seq}
// Out: {t: 'done', id, seq, bytes?} · {t: 'error', id, seq, message}

import { PngStream } from './png.js';

const files = new Map(), queues = new Map();

self.onmessage = ({ data: m }) => {
    const run = (queues.get(m.id) ?? Promise.resolve()).then(() => handle(m));
    queues.set(m.id, run.catch(() => {}));
};

async function handle(m) {
    try {
        const f = files.get(m.id);
        if (m.t === 'open') {
            const out = await m.handle.createWritable();
            const s = new PngStream(bytes => out.write(bytes), m.width, m.height, m.kind);
            files.set(m.id, { out, s, kind: m.kind });
            await s.start();
        } else if (m.t === 'rows') {
            if (!f) throw new Error('the file is not open');
            if (f.failed) throw f.failed;
            await f.s.rows(f.kind === 'gray16' ? new Uint16Array(m.buf) : new Uint8Array(m.buf), m.n);
        } else if (m.t === 'close') {
            if (!f) throw new Error('the file is not open');
            if (f.failed) throw f.failed;
            const bytes = await f.s.end();
            await f.out.close();
            files.delete(m.id); queues.delete(m.id);
            self.postMessage({ t: 'done', id: m.id, seq: m.seq, bytes });
            return;
        } else if (m.t === 'abort') {
            files.delete(m.id); queues.delete(m.id);
            if (f) { f.s.abort(); await f.out.abort().catch(() => {}); }
        }
        self.postMessage({ t: 'done', id: m.id, seq: m.seq });
    } catch (e) {
        const f = files.get(m.id);
        if (f) f.failed = e;
        self.postMessage({ t: 'error', id: m.id, seq: m.seq, message: e?.message || String(e) });
    }
}
