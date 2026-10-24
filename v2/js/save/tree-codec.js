// The planet file's codec for plain data (plans/V2_SAVE_LOAD_PLAN.md): a tree of objects, arrays, numbers, strings,
// booleans, null, Maps, Sets and typed arrays — what the page's workers hand it — as JSON, its typed arrays apart in one
// binary (each at a multiple of 8 bytes, so it is read straight into an array of its own, piece by piece). Whatever data
// a newer page adds to a frame or a detailed moment is saved and read with no change here. Anything else (a class, a
// function) stops the save, naming where: it would not come back as it was.

const TYPES = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
// (a tag is an object of one of these keys alone; a saved object that looks like one is wrapped in $o)
const TAGS = new Set(['$a', '$n', '$u', '$map', '$set', '$o']);
const PIECE = 4 << 20;

/**
 * A tree as {json, arrays, byteLength}: json is {v: the tree, its typed arrays as {$a: i}, a: [[type, offset, length], …]}
 * (offsets into the binary, `byteLength` long); `arrays` the typed arrays themselves (not copied). An array met twice is
 * kept once, and comes back as one.
 */
export function encodeTree(value) {
    const arrays = [], specs = [], index = new Map();
    let offset = 0;
    const walk = (x, at) => {
        if (x === null || typeof x === 'string' || typeof x === 'boolean') return x;
        if (x === undefined) return { $u: 1 };
        if (typeof x === 'number') return Number.isFinite(x) && !Object.is(x, -0) ? x : { $n: Object.is(x, -0) ? '-0' : String(x) };
        if (ArrayBuffer.isView(x)) {
            if (index.has(x)) return { $a: index.get(x) };
            const type = x.constructor.name;
            if (!TYPES[type]) throw new Error(`cannot save a ${type} (${at})`);
            offset = (offset + 7) & ~7;
            index.set(x, arrays.length); specs.push([type, offset, x.length]); arrays.push(x);
            offset += x.byteLength;
            return { $a: arrays.length - 1 };
        }
        if (Array.isArray(x)) return x.map((v, i) => walk(v, `${at}[${i}]`));
        if (x instanceof Map) return { $map: [...x].map(([k, v], i) => [walk(k, `${at} key ${i}`), walk(v, `${at} value ${i}`)]) };
        if (x instanceof Set) return { $set: [...x].map((v, i) => walk(v, `${at} item ${i}`)) };
        const proto = typeof x === 'object' ? Object.getPrototypeOf(x) : undefined;
        if (proto !== Object.prototype && proto !== null) throw new Error(`cannot save a ${x?.constructor?.name ?? typeof x} (${at})`);
        const out = {};
        for (const [k, v] of Object.entries(x)) set(out, k, walk(v, `${at}.${k}`));
        const keys = Object.keys(out);
        return keys.length === 1 && TAGS.has(keys[0]) ? { $o: out } : out;
    };
    const v = walk(value, 'the planet');
    return { json: JSON.stringify({ v, a: specs }), arrays, specs, byteLength: offset };
}

/** The tree back from its parsed JSON ({v, a}) and its arrays (allocArrays, filled). */
export function decodeTree({ v }, arrays) {
    const walk = x => {
        if (x === null || typeof x !== 'object') return x;
        if (Array.isArray(x)) return x.map(walk);
        const keys = Object.keys(x);
        if (keys.length === 1 && TAGS.has(keys[0])) {
            const y = x[keys[0]];
            switch (keys[0]) {
                case '$a': return arrays[y];
                case '$n': return y === '-0' ? -0 : Number(y);
                case '$u': return undefined;
                case '$map': return new Map(y.map(([k, val]) => [walk(k), walk(val)]));
                case '$set': return new Set(y.map(walk));
                case '$o': x = y;
            }
        }
        const out = {};
        for (const [k, val] of Object.entries(x)) set(out, k, walk(val));
        return out;
    };
    return walk(v);
}

// (a key named __proto__ is data like any other)
function set(o, k, v) { if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); else o[k] = v; }

/** The binary of an encoded tree, in pieces (≤ 4 MB, views of the arrays themselves; the gaps between them zeros). */
export function* binPieces({ arrays, specs }) {
    let pos = 0;
    for (let i = 0; i < arrays.length; i++) {
        const start = specs[i][1], a = arrays[i];
        if (start > pos) { yield new Uint8Array(start - pos); pos = start; }
        const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        for (let o = 0; o < bytes.length; o += PIECE) yield bytes.subarray(o, Math.min(bytes.length, o + PIECE));
        pos += bytes.length;
    }
}

/** Empty arrays for an encoded tree's specs ([[type, offset, length], …]). */
export function allocArrays(specs) {
    return specs.map(([type, , length]) => {
        if (!TYPES[type]) throw new Error(`the planet file holds an array of an unknown kind (${type})`);
        return new TYPES[type](length);
    });
}

/** Fills `arrays` (allocArrays) from the binary, piece by piece: push(bytes) each, done() at the end. */
export function arrayFiller(specs, arrays) {
    const views = arrays.map(a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    let i = 0, pos = 0;
    const skipEmpty = () => { while (i < views.length && !views[i].length && pos >= specs[i][1]) i++; };
    return {
        push(chunk) {
            let c = 0;
            while (c < chunk.length) {
                skipEmpty();
                if (i >= views.length) throw new Error('the planet file is damaged (more data than its arrays hold)');
                const start = specs[i][1], view = views[i];
                if (pos < start) { const gap = Math.min(start - pos, chunk.length - c); c += gap; pos += gap; continue; }
                const n = Math.min(view.length - (pos - start), chunk.length - c);
                view.set(chunk.subarray(c, c + n), pos - start);
                c += n; pos += n;
                if (pos - start === view.length) i++;
            }
        },
        done() { skipEmpty(); if (i < views.length) throw new Error('the planet file is damaged (its arrays are cut short)'); },
    };
}
