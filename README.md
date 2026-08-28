# AquaGuard

**Satellite-based subsurface water leak detection for Azərsu.**
VISTAR Cohort 3 demo — Nərimanov rayonu, Bakı.

Underground mains that leak wash out the soil around them. A void develops and
the ground directly above settles — a few millimetres per month, and crucially
*accelerating* as the void grows. Sentinel-1 radar interferometry resolves
exactly that magnitude of motion from orbit, so the signal is detectable months
before water surfaces or pressure telemetry registers anything.

AquaGuard runs a transparent statistical test over per-segment InSAR
displacement histories and hands field crews a ranked work queue instead of a
map of the whole network.

---

## ⚠️ Read this first — the data is synthetic

The displacement values in this demo are **simulated, not measured**. They are
calibrated to realistic InSAR displacement ranges (Sentinel-1, ~12-day revisit,
millimetre precision) to illustrate the detection concept. A production
deployment would use real Sentinel-1 SAR time series processed via InSAR
(e.g. MintPy) and would require calibration against Azərsu's historical leak
records.

This is stated in the app itself, under **Methodology** in the header. Say it
out loud in the pitch — a judge who discovers it on their own stops believing
everything else on the screen.

What *is* real: the detection algorithm, the arithmetic behind every headline
number, and the honesty about what a production system would still need.

---

## Run it

```bash
git clone <this-repo>
cd aquaguard/frontend
npm install
npm run dev
```

Open **http://localhost:5173**. That is the whole demo.

**No credentials, no API keys, no backend, no Python required.** The detection
results are precomputed into `frontend/public/aquaguard.json`, which the app
reads directly — one dev server and nothing else to babysit.

Requires Node 18+. Python is needed only if you want to regenerate the dataset
from scratch (see below); the committed dataset works as-is.

An internet connection is used only for basemap tiles. Without it the pipe
network, every chart and every interaction still work — you just lose the
street map behind them.

### Regenerating the data (optional)

The detection step is precomputed to a static JSON file rather than served from
a live API, deliberately: one fewer process to fail mid-presentation.

```bash
python data/generate_network.py   # synthetic network + displacement series
python data/detect.py             # runs the detector -> frontend/public/aquaguard.json
```

`detect.py` prints a scoring report against the injected ground truth. Both
scripts are pure standard library — no numpy, no pip install.

---

## Demo script (about 3 minutes)

1. **Open on the map.** 11.45 km of monitored main, 54 segments, four red.
   "Every green segment is ground we've confirmed is stable. We're not
   guessing where to look — we're ruling things out."

2. **Click queue item 1 (AZ-NRM-004).** The chart tells the whole story: flat
   for eighteen months, then it breaks downward. −3.58 mm/month, −8.6σ against
   the network baseline, accelerating for 212 days. R² = 0.99.

3. **Hit the "?" on *Recoverable value*.** The arithmetic appears on screen.
   Every KPI does this. Nothing is a claim you have to take on faith.

4. **Switch to "6 months ago".** One red segment becomes four. This is the
   change-detection argument in one click: three of these were invisible in
   February and are unmissable now — and none of them have surfaced yet.

5. **Open Methodology.** Lead with the synthetic-data disclosure, then the
   detector-vs-ground-truth table, then "what a production system would still
   need". Closing with the limitations is what makes the rest credible.

---

## How the detection works

Deliberately a transparent statistical test, not a black-box model — a utility
has to justify digging up a road.

| Step | What it does |
|---|---|
| **0. Deseasonalise** | Fit an annual harmonic (thermal + groundwater cycle, 1–3 mm) on the **baseline window only** and subtract it. Fitting across the recent window too would absorb a real leak into the seasonal term. Mirrors MintPy's `timeseries2velocity.py --periodic 1`. |
| **1. Recent velocity** | OLS slope over the last 6 months, mm/month. |
| **2. Baseline velocity** | OLS slope over everything before that — the segment's own normal, so a street that has always crept downwards isn't flagged forever. |
| **3. Acceleration** | Recent − baseline. **The discriminator.** A leak subsides *faster over time*; ordinary consolidation does not. |
| **4. Robust z-score** | `(v − median) / (1.4826 × MAD)` across all 54 segments. Median/MAD rather than mean/SD so the leaks can't inflate the baseline they're tested against. |
| **5. Onset changepoint** | Scan for the epoch that best splits the series into two linear pieces → "days since acceleration started". |

**Banding:** High if `z ≤ −3.0` **and** `accel ≤ −0.80 mm/mo²`; Medium if
`z ≤ −1.8` **and** `accel ≤ −0.30 mm/mo²`.

### Scoring against injected ground truth

Because the dataset is synthetic we know the answer, so the detector can be
scored honestly. `detect.py` prints this on every run:

| Case | Injected | Result |
|---|---|---|
| Leaks | 4 accelerating subsidence signals | **4/4 recovered at High** |
| Settlement | 2 mild recent trend changes, not leaks | Both raised to **Medium** — monitor, don't dispatch |
| Steady creep | 2 linear subsidence signals, no acceleration | Both **correctly rejected** by the acceleration gate |
| False positives | — | **1** segment at Medium, sitting on the threshold |

The steady-creep rejections are the ones worth pointing at: they are the reason
the system compares each segment against *its own* baseline rather than a flat
displacement threshold.

---

## The numbers

Every headline figure derives from constants in **`frontend/src/config.js`**.
Nothing is hard-coded into a component. Change a constant and the whole
dashboard re-derives on save — including live, mid-demo, if a judge challenges
an assumption.

| Constant | Value | Basis |
|---|---|---|
| Water value | 0.35 AZN/m³ | Azərsu domestic potable tariff band. Set to ~0.15 to value at marginal production cost instead. |
| Leak discharge | 45 m³/day @ DN200 | IWA BABE planning figure for unreported leaks on distribution mains; scaled linearly by diameter. |
| Detection lead time | 180 days | How much earlier this flags a leak than discovery-by-surfacing. **The most sensitive assumption** — halve it and the benefit halves. |
| Survey cost | 220 AZN/segment | Conventional acoustic correlator sweep. |

Current pilot output: **4 High-risk segments → 236 m³/day → 14,884 AZN per
180-day detection cycle**, plus 87% of blind survey effort avoided.

Only High-risk detections feed the loss figure. Medium is a monitoring state,
not a confirmed loss, and is reported separately.

The network-scale extrapolation shown in the Methodology panel is labelled
illustrative and should stay that way — it assumes this district's leak density
is representative of all ~14,000 km, which it may well not be.

---

## Architecture

```
data/
  generate_network.py   synthetic pipe network + 24-month displacement series
  detect.py             the detector; writes frontend/public/aquaguard.json
  raw_displacement.json intermediate (generator output)

frontend/
  public/aquaguard.json the only data the app reads
  src/config.js         ALL tunable assumptions + derived-figure maths
  src/App.jsx           state: epoch view, selection, ranked queue
  src/components/
    Header.jsx              KPI strip with per-tile arithmetic reveal
    NetworkMap.jsx          Leaflet, plain (no react-leaflet)
    SidePanel.jsx           triage queue + segment detail
    DisplacementChart.jsx   hand-rolled SVG time series
    MethodologyModal.jsx    the honesty layer
```

**Dependency choices, made for demo-day reliability:** React, Leaflet and Vite,
nothing else. Leaflet is driven through a ref rather than react-leaflet (no
React-version coupling), and the time-series chart is hand-rolled SVG rather
than Recharts — which also made the onset marker, the analysis-window shading
and the fitted-trend overlay straightforward.

### Accessibility note

Risk is encoded on three redundant channels — colour, stroke weight, and a
numbered marker matching the queue rank — plus a text label and icon on every
badge. Under deuteranopia the High red and Stable green sit only ~4 ΔE apart, so
colour alone would be unreadable for roughly 1 in 12 men. In a utility ops room
that is not hypothetical.

### If the venue Wi-Fi dies

Basemap tiles come from Esri's key-free World Dark Gray Canvas. If they fail to
load, the pipe network still renders on the dark canvas beneath and every
number, chart and interaction keeps working — you lose the streets, not the
demo. (Note: CARTO's `dark_all` basemap now stamps "API KEY REQUIRED" across
unauthenticated tiles — don't switch back to it without a key.)

---

## Known limitations

Stated plainly, because the Methodology panel states them to judges anyway:

- **Not calibrated.** Thresholds are set from the synthetic distribution. Real
  precision/recall requires tuning against Azərsu's repair history.
- **Confounders are unmasked.** Metro tunnelling, construction dewatering and
  sewer collapse all produce accelerating subsidence. Permit-data masking is
  essential before precision would be usable in the field.
- **Line-of-sight, not vertical.** One orbit measures LOS. Separating true
  vertical from east–west motion needs ascending + descending tracks.
- **Partial coverage.** Vegetated, sandy and rapidly-changing surfaces
  decorrelate. Dense urban Baku is close to the best case for this technique.
- **Deformation alone is a weak prior.** Fusing with DMA night-flow, pressure
  telemetry and pipe age would raise precision well above what this reaches.
