// Shared climate utilities: smoothing, ITCZ lookup, and percentile selection.

// ── Laplacian smoothing ──────────────────────────────────────────────────────

export function smoothField(mesh, field, passes) {
    const { adjOffset, adjList, numRegions } = mesh;
    const tmp = new Float32Array(numRegions);

    for (let pass = 0; pass < passes; pass++) {
        for (let r = 0; r < numRegions; r++) {
            let sum = field[r];
            let count = 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                sum += field[adjList[ni]];
                count++;
            }
            tmp[r] = sum / count;
        }
        field.set(tmp);
    }
}

// ── ITCZ latitude lookup (linear interpolation with wrapping) ────────────────

export function makeItczLookup(itczLons, itczLats) {
    const n = itczLons.length;
    const step = (2 * Math.PI) / n;
    const lonStart = -Math.PI + step * 0.5;

    return function (lon) {
        let fi = (lon - lonStart) / step;
        fi = ((fi % n) + n) % n;
        const i0 = Math.floor(fi);
        const i1 = (i0 + 1) % n;
        const frac = fi - i0;
        return itczLats[i0] * (1 - frac) + itczLats[i1] * frac;
    };
}

// ── Floyd-Rivest selection (O(N) expected percentile) ────────────────────────

function floydRivest(arr, left, right, k) {
    while (right > left) {
        if (right - left > 600) {
            const n = right - left + 1;
            const i = k - left + 1;
            const z = Math.log(n);
            const s = 0.5 * Math.exp(2 * z / 3);
            const sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (i - n / 2 < 0 ? -1 : 1);
            const newLeft = Math.max(left, Math.floor(k - i * s / n + sd));
            const newRight = Math.min(right, Math.floor(k + (n - i) * s / n + sd));
            floydRivest(arr, newLeft, newRight, k);
        }

        const t = arr[k];
        if (t !== t) return; // NaN pivot — cannot partition, bail out
        let i = left;
        let j = right;

        arr[k] = arr[left];
        arr[left] = t;

        if (arr[right] > t) {
            arr[left] = arr[right];
            arr[right] = t;
        }

        while (i < j) {
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
            i++;
            j--;
            while (arr[i] < t) i++;
            while (arr[j] > t) j--;
        }

        if (arr[left] === t) {
            const tmp = arr[left];
            arr[left] = arr[j];
            arr[j] = tmp;
        } else {
            j++;
            const tmp = arr[j];
            arr[j] = arr[right];
            arr[right] = tmp;
        }

        if (j <= k) left = j + 1;
        if (k <= j) right = j - 1;
    }
}

/**
 * Compute the p-th percentile of a numeric array in O(N) expected time.
 * Returns the value at index floor(n * p) of the sorted order.
 * Makes a copy so the input is not mutated. Returns 1 if the result is 0.
 */
export function percentile(arr, p) {
    const n = arr.length;
    if (n === 0) return 1;
    const work = new Float32Array(arr);
    const k = Math.floor(n * p);
    floydRivest(work, 0, n - 1, k);
    return work[k] || 1;
}
