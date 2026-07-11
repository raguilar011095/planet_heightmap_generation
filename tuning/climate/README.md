# Climate Tuning Suite

Automated tuning of the climate simulation parameters against **real Earth**.

The suite runs the app's heightmap-import pipeline on `assets/earth.png` directly
in Node (no browser), simulates climate (wind → ocean currents → precipitation →
temperature → Köppen), and scores the resulting Köppen map against the observed
Köppen-Geiger classification (Kottek et al. 2006, 0.5°, observed 1976–2000).
An optimizer then tweaks the parameters in `js/climate-config.js` to maximize
the match.

## Scoring

Only cells where **both** the simulated mesh says land **and** the ground-truth
grid has a climate class are scored — coastline/land-mask disagreements are
excluded (and reported separately as `landAgreement`).

- `exactAcc` — fraction of scored cells with the exact Köppen class (30 types)
- `majorAcc` — match on major group only (A/B/C/D/E)
- `macroF1` — unweighted mean F1 across classes present in the truth, so rare
  but important classes (Mediterranean Csa/Csb, monsoon Cwa/Dwa…) aren't drowned
  out by large deserts and subarctic zones
- **objective = 0.60·gradedAcc + 0.12·macroF1 + 0.15·groupBalance + 0.13·watchlistF1** — what the optimizer maximizes

Ground-truth codes are mapped onto the app's class set (`As` → `Aw`, the standard
merge). Ground truth lives in `data/ascii/Koeppen-Geiger-ASCII.txt`.

## Usage

```bash
# Baseline score of current defaults (+ PNG comparison maps)
node tuning/climate/evaluate.mjs --maps

# Optimize the ~35 high-impact parameters (150 evaluations)
node tuning/climate/optimize.mjs

# Longer run over all ~80 parameters
node tuning/climate/optimize.mjs --iters 500 --subset all --label big-run

# Validate the winner at higher resolution before trusting it
node tuning/climate/evaluate.mjs --params tuning/results/climate/<label>-best.json --n 160000 --maps

# Write the tuned values into js/climate-config.js (then review the diff!)
node tuning/climate/apply-params.mjs tuning/results/climate/<label>-best.json
```

Default mesh resolution is `--n 40000` (fast, ~seconds per evaluation).
Tuning results are exchangeable across resolutions to a good approximation
because the simulation is scale-invariant by design, but always validate at
≥160K before applying.

## Files

```
evaluate.mjs        score one parameter set, print report, optional PNG maps
optimize.mjs        coordinate descent + stochastic hill-climb over param-space
apply-params.mjs    write tuned values back into js/climate-config.js
param-space.mjs     min/max range + high-impact flag for every parameter
diagnose.mjs        spatial error report: group fractions per lat band + named regions
probe.mjs           parameter sensitivity: swing each lever, flag inert ones
probe-nindia.mjs    root-cause probe for the monsoon region
probe-desert.mjs    which lever controls the subtropical desert glut
probe-tier01.mjs    wiring check for the Tier 0/1 levers
lib/earth-context.mjs   Earth mesh + heightmap sampling + ground-truth mapping
lib/score.mjs           climate chain runner + metrics (objective weights here)
lib/koppen-distance.mjs climatic-distance model for graded scoring
lib/ground-truth.mjs    Köppen-Geiger ASCII grid parser
lib/render.mjs          equirectangular PNG rendering (sim / truth / diff)
data/               ground truth (gitignored; see below to re-download)
maps/               rendered comparison maps (gitignored)
```

## Diagnostic workflow

The tuning loop is: **diagnose → probe → change/tune → re-diagnose**.

```bash
node tuning/climate/diagnose.mjs --n 160000   # where is it wrong (lat bands + regions)?
node tuning/climate/probe.mjs                 # do the levers that should fix it actually work?
```

`probe.mjs` swings each parameter between extremes and flags any that are **INERT**
(a likely bug or downstream cancellation) — this is how the monsoon-relief bug and
the classifier miscalibration were found. Always probe before adding new code: a
lever that does nothing means the fault is elsewhere.

The diff map colors: green = exact match, yellow = major group match,
red = wrong group, dark = not scored (ocean or mask disagreement).

## Re-downloading ground truth

The Vienna server can be unreachable; the Wayback Machine mirror works:

```powershell
curl.exe -L -o tuning/climate/data/Koeppen-Geiger-ASCII.zip `
  https://web.archive.org/web/2023id_/https://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.zip
Expand-Archive tuning/climate/data/Koeppen-Geiger-ASCII.zip tuning/climate/data/ascii
```

## How parameters flow

`js/climate-config.js` exports a mutable `CLIMATE` object (defaults frozen in
`CLIMATE_DEFAULTS`). The climate modules (`wind.js`, `temperature.js`,
`precipitation.js`, `heuristic-precip.js`) read it at runtime, so the optimizer
sweeps parameters in-process without reloading. The browser app always runs the
defaults — tuning only changes the app when you run `apply-params.mjs` and
commit the result.
