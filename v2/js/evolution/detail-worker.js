// A worker of the detail finer than the mesh (finish/fine-detail.js; detail-view.js DetailService): it draws the
// windows it is sent, each with what it needs of the moment (fine-detail.js cropSource).

import { fineWindow } from '../finish/fine-detail.js';

self.onmessage = ({ data }) => {
    if (data.type !== 'window') return;
    try {
        const out = fineWindow(data.src, data.win);
        self.postMessage({ type: 'done', id: data.id, out }, [out.h.buffer, out.sea.buffer, out.wat.buffer]);
    } catch (err) {
        self.postMessage({ type: 'error', id: data.id, message: err?.stack ?? String(err) });
    }
};
