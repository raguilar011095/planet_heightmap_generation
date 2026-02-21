// Non-linear detail slider mapping (power curve, p=5).
// Slider position 0–1000 maps to detail 2,000–2,560,000.
// Gives generous control in the normal range; the old max (640K) sits at ~76%.

const MIN = 2000, MAX = 2560000, RANGE = MAX - MIN, STEPS = 1000, P = 5;

export function detailFromSlider(pos) {
    const t = pos / STEPS;
    return Math.round((MIN + RANGE * Math.pow(t, P)) / 1000) * 1000;
}

export function sliderFromDetail(n) {
    return Math.round(STEPS * Math.pow(Math.max(0, n - MIN) / RANGE, 1 / P));
}
