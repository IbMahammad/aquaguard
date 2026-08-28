"""
AquaGuard - leak-candidate detection over InSAR displacement time series
=======================================================================

Deliberately a TRANSPARENT statistical detector, not a black-box network.
Every number on the dashboard can be traced back to one of these five steps,
which matters when a utility has to justify sending a crew to dig up a road.

    0. DESEASONALISE     urban InSAR carries a 1-3 mm annual cycle (thermal
                         expansion of the built surface + shallow groundwater
                         table). An annual harmonic is fitted on the BASELINE
                         window only - never on the recent window, so a real
                         leak cannot be absorbed into the seasonal term - and
                         subtracted from the whole record. This mirrors what
                         MintPy does with `timeseries2velocity.py --periodic 1`.

    1. RECENT VELOCITY   ordinary least-squares slope over the last W epochs
                         -> mm/month, negative = subsiding

    2. BASELINE VELOCITY OLS slope over everything before that window
                         -> the segment's own "normal", so a street that was
                            always creeping downwards is not flagged forever

    3. ACCELERATION      recent - baseline (mm/month). A leak does not just
                         subside, it subsides FASTER over time. This is the
                         discriminator against ordinary consolidation.

    4. ROBUST Z-SCORE    (recent_velocity - median) / (1.4826 * MAD) computed
                         across the whole network for this epoch. Median/MAD
                         instead of mean/std so that the leaks themselves do
                         not inflate the baseline they are being tested
                         against. Answers: "how unusual is this segment
                         compared to every other segment we monitor today?"

    5. ONSET CHANGEPOINT least-squares scan for the epoch that best splits the
                         series into two linear pieces -> when did it start,
                         and therefore how long has it been leaking

Risk banding is a pure threshold on (4) gated by (3) - printed below so the
rule is auditable.

Runs on the standard library only.
"""

import json
import math
import sys
from datetime import date
from pathlib import Path

# Azerbaijani street names contain characters (ə, ü, ş) that Windows' default
# cp1252 console codec cannot encode. Without this, piping the output anywhere
# crashes the script on the report line.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# --------------------------------------------------------------------------
# Detector parameters - the entire tuneable surface of the algorithm
# --------------------------------------------------------------------------

RECENT_WINDOW = 6          # epochs (months) treated as "recent"
MIN_BASELINE = 10          # epochs required before a verdict is issued

# Risk bands on the robust z-score. Negative because subsidence is negative.
Z_HIGH = -3.0
Z_MEDIUM = -1.8

# A segment must also actually be accelerating downwards, not merely be the
# fastest-subsiding of an otherwise quiet network.
ACCEL_HIGH = -0.80         # mm/month faster than its own baseline
ACCEL_MEDIUM = -0.30

SEASONAL_PERIOD = 12.0     # months - annual thermal / groundwater cycle

DAYS_PER_MONTH = 30.44

# --------------------------------------------------------------------------
# Small statistics toolkit
# --------------------------------------------------------------------------


def ols_slope(values):
    """Least-squares slope of `values` against index. Units: y-units / epoch."""
    n = len(values)
    if n < 2:
        return 0.0
    mean_t = (n - 1) / 2.0
    mean_y = sum(values) / n
    num = sum((t - mean_t) * (v - mean_y) for t, v in enumerate(values))
    den = sum((t - mean_t) ** 2 for t in range(n))
    return num / den if den else 0.0


def ols_fit(values):
    """Return (slope, intercept, r_squared)."""
    n = len(values)
    slope = ols_slope(values)
    mean_t = (n - 1) / 2.0
    mean_y = sum(values) / n
    intercept = mean_y - slope * mean_t
    ss_tot = sum((v - mean_y) ** 2 for v in values)
    ss_res = sum((v - (slope * t + intercept)) ** 2 for t, v in enumerate(values))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
    return slope, intercept, r2


def solve(matrix, rhs):
    """Gaussian elimination with partial pivoting. Small, dense, exact enough."""
    n = len(rhs)
    aug = [row[:] + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-12:
            return None
        aug[col], aug[pivot] = aug[pivot], aug[col]
        for r in range(col + 1, n):
            f = aug[r][col] / aug[col][col]
            for c in range(col, n + 1):
                aug[r][c] -= f * aug[col][c]
    out = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = aug[r][n] - sum(aug[r][c] * out[c] for c in range(r + 1, n))
        out[r] = s / aug[r][r]
    return out


def deseasonalise(series, baseline_len):
    """
    Fit  y = a + b*t + c*sin(2*pi*t/12) + d*cos(2*pi*t/12)  over the baseline
    window, then strip the (c, d) harmonic from the ENTIRE record.

    Fitting on the baseline only is deliberate: if the harmonic were fitted
    across the recent window too, an accelerating leak would partly be
    absorbed into the seasonal term and the detector would hide the very
    signal it is looking for.

    Returns (deseasonalised_series, seasonal_component, baseline_velocity).
    """
    w = 2 * math.pi / SEASONAL_PERIOD
    basis = lambda t: [1.0, float(t), math.sin(w * t), math.cos(w * t)]

    if baseline_len < MIN_BASELINE:
        return list(series), [0.0] * len(series), ols_slope(series)

    # Normal equations  (X^T X) p = X^T y  over the baseline window.
    xtx = [[0.0] * 4 for _ in range(4)]
    xty = [0.0] * 4
    for t in range(baseline_len):
        b = basis(t)
        for i in range(4):
            xty[i] += b[i] * series[t]
            for j in range(4):
                xtx[i][j] += b[i] * b[j]

    params = solve(xtx, xty)
    if params is None:
        return list(series), [0.0] * len(series), ols_slope(series[:baseline_len])

    _, slope, c, d = params
    seasonal = [c * math.sin(w * t) + d * math.cos(w * t) for t in range(len(series))]
    return ([v - s for v, s in zip(series, seasonal)], seasonal, slope)


def median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def mad_sigma(values):
    """Median absolute deviation rescaled to a Gaussian-equivalent sigma."""
    med = median(values)
    return 1.4826 * median([abs(v - med) for v in values])


def piecewise_sse(values, split):
    """Residual sum of squares for two independent linear fits either side."""
    left, right = values[:split], values[split:]
    total = 0.0
    for part in (left, right):
        if len(part) < 2:
            continue
        slope, intercept, _ = ols_fit(part)
        total += sum((v - (slope * t + intercept)) ** 2 for t, v in enumerate(part))
    return total


def find_onset(values, min_left=6, min_right=3):
    """
    Scan every admissible split point and keep the one with the lowest
    two-piece residual - the classic single-changepoint detector.
    Returns None when no split beats a plain single line.
    """
    n = len(values)
    if n < min_left + min_right:
        return None
    _, _, r2 = ols_fit(values)
    mean_y = sum(values) / n
    single_sse = sum((v - mean_y) ** 2 for v in values)
    _, _, _ = r2, mean_y, single_sse
    slope, intercept, _ = ols_fit(values)
    single_sse = sum((v - (slope * t + intercept)) ** 2 for t, v in enumerate(values))

    best_split, best_sse = None, single_sse * 0.75   # must explain 25% more
    for split in range(min_left, n - min_right + 1):
        sse = piecewise_sse(values, split)
        if sse < best_sse:
            best_split, best_sse = split, sse
    return best_split


def month_to_date(label):
    y, m = label.split("-")
    return date(int(y), int(m), 15)


# --------------------------------------------------------------------------
# Detection
# --------------------------------------------------------------------------


def analyse(segments, upto):
    """
    Run the full detector over the first `upto` epochs of every segment.
    Returns {segment_id: analysis dict}. `upto` lets us replay the exact same
    algorithm as it would have run 6 months ago, which is what powers the
    change-detection toggle in the UI.
    """
    window = RECENT_WINDOW
    prepared = {}

    for seg in segments:
        raw = seg["displacement_mm"][:upto]
        baseline_len = upto - window

        # Step 0: strip the annual harmonic, fitted on the baseline only.
        series, seasonal, baseline_v = deseasonalise(raw, baseline_len)

        recent_v, _, recent_r2 = ols_fit(series[-window:])

        prepared[seg["id"]] = {
            "raw": raw,
            "series": series,
            "seasonal": seasonal,
            "recent_velocity": recent_v,
            "baseline_velocity": baseline_v,
            "acceleration": recent_v - baseline_v,
            "recent_fit_r2": recent_r2,
        }

    # --- network-wide robust baseline for THIS epoch -----------------------
    velocities = [p["recent_velocity"] for p in prepared.values()]
    net_median = median(velocities)
    net_sigma = mad_sigma(velocities) or 1e-6

    results = {}
    for seg in segments:
        p = prepared[seg["id"]]
        z = (p["recent_velocity"] - net_median) / net_sigma
        accel = p["acceleration"]

        if z <= Z_HIGH and accel <= ACCEL_HIGH:
            risk = "High"
        elif z <= Z_MEDIUM and accel <= ACCEL_MEDIUM:
            risk = "Medium"
        else:
            risk = "Low"

        onset_idx = find_onset(p["series"]) if risk != "Low" else None
        onset_month = seg["dates"][onset_idx] if onset_idx is not None else None

        days_since_onset = None
        if onset_month:
            last = month_to_date(seg["dates"][upto - 1])
            days_since_onset = (last - month_to_date(onset_month)).days

        # Detection confidence: how far past the flagging threshold the segment
        # sits, tempered by how many persistent scatterers back the measurement
        # (a 12-PS segment is a weaker observation than a 60-PS one).
        z_term = min(1.0, abs(z) / 6.0) if risk != "Low" else 0.0
        ps_term = min(1.0, seg["ps_count"] / 40.0)
        fit_term = max(0.0, min(1.0, p["recent_fit_r2"]))
        # Capped at 0.95 on purpose. Without calibration against real repair
        # records there is no basis for ever telling an operator a detection is
        # certain, and a dashboard that prints 100% stops being believed.
        raw_conf = 0.55 * z_term + 0.2 * ps_term + 0.25 * fit_term
        confidence = round(min(0.95, raw_conf), 3)

        results[seg["id"]] = {
            "risk": risk,
            "recent_velocity_mm_per_month": round(p["recent_velocity"], 3),
            "baseline_velocity_mm_per_month": round(p["baseline_velocity"], 3),
            "acceleration_mm_per_month2": round(accel, 3),
            "z_score": round(z, 2),
            "recent_fit_r2": round(p["recent_fit_r2"], 3),
            # Cumulative figures come from the RAW record - that is the motion
            # the ground actually underwent. Velocities come from the
            # deseasonalised record, which is what the trend test needs.
            "cumulative_displacement_mm": round(p["raw"][-1] - p["raw"][0], 2),
            "recent_displacement_mm": round(p["raw"][-1] - p["raw"][-window], 2),
            "corrected_mm": [round(v, 2) for v in p["series"]],
            "onset_index": onset_idx,
            "onset_month": onset_month,
            "days_since_onset": days_since_onset,
            "confidence": confidence if risk != "Low" else None,
            "as_of": seg["dates"][upto - 1],
        }

    return results, {
        "network_median_velocity": round(net_median, 3),
        "network_sigma_velocity": round(net_sigma, 3),
        "as_of": segments[0]["dates"][upto - 1],
        "flagged_high": sum(1 for r in results.values() if r["risk"] == "High"),
        "flagged_medium": sum(1 for r in results.values() if r["risk"] == "Medium"),
    }


# --------------------------------------------------------------------------
# Build the artefact the frontend consumes
# --------------------------------------------------------------------------


def main():
    here = Path(__file__).resolve().parent
    raw = json.loads((here / "raw_displacement.json").read_text(encoding="utf-8"))
    segments = raw["segments"]
    n = raw["meta"]["epochs"]

    current, current_stats = analyse(segments, upto=n)
    historic, historic_stats = analyse(segments, upto=n - 6)

    out_segments = []
    for seg in segments:
        out_segments.append({
            "id": seg["id"],
            "street": seg["street"],
            "diameter_mm": seg["diameter_mm"],
            "material": seg["material"],
            "install_year": seg["install_year"],
            "length_m": seg["length_m"],
            "ps_count": seg["ps_count"],
            "coords": seg["coords"],
            "centroid": seg["centroid"],
            "dates": seg["dates"],
            "displacement_mm": seg["displacement_mm"],
            "current": current[seg["id"]],
            "historic": historic[seg["id"]],
        })

    payload = {
        "meta": {
            **raw["meta"],
            "detector": {
                "method": "Robust z-score on recent OLS velocity, gated on acceleration",
                "recent_window_months": RECENT_WINDOW,
                "z_high": Z_HIGH,
                "z_medium": Z_MEDIUM,
                "accel_high_mm_per_month2": ACCEL_HIGH,
                "accel_medium_mm_per_month2": ACCEL_MEDIUM,
                "network_baseline": "median / 1.4826*MAD across all segments",
            },
        },
        "views": {
            "current": current_stats,
            "historic": historic_stats,
        },
        "ground_truth": raw["ground_truth"],
        "confusers": raw.get("confusers", {}),
        "segments": out_segments,
    }

    out = here.parent / "frontend" / "public" / "aquaguard.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    # ---------------- console report -------------------------------------
    print("\n=== AquaGuard detector ===")
    print(f"segments {len(out_segments)} | {raw['meta']['total_length_km']} km | "
          f"{n} epochs -> {raw['meta']['last_month']}")
    print(f"network baseline velocity: median {current_stats['network_median_velocity']} "
          f"mm/mo, sigma {current_stats['network_sigma_velocity']} mm/mo")
    print(f"rule: High if z<={Z_HIGH} and accel<={ACCEL_HIGH} | "
          f"Medium if z<={Z_MEDIUM} and accel<={ACCEL_MEDIUM}")

    print(f"\n-- current view ({current_stats['as_of']}) --")
    print(f"{'ID':<12}{'street':<24}{'risk':<8}{'v_recent':>9}{'accel':>8}"
          f"{'z':>8}{'onset':>9}{'days':>6}")
    flagged = [s for s in out_segments if s["current"]["risk"] != "Low"]
    flagged.sort(key=lambda s: s["current"]["z_score"])
    for s in flagged:
        c = s["current"]
        print(f"{s['id']:<12}{s['street'][:22]:<24}{c['risk']:<8}"
              f"{c['recent_velocity_mm_per_month']:>9.2f}"
              f"{c['acceleration_mm_per_month2']:>8.2f}{c['z_score']:>8.1f}"
              f"{str(c['onset_month']):>9}{str(c['days_since_onset']):>6}")

    truth = set(raw["ground_truth"])
    confusers = raw.get("confusers", {})
    creep = {k for k, v in confusers.items() if v["kind"] == "creep"}
    settle = {k for k, v in confusers.items() if v["kind"] == "settlement"}
    hits = {s["id"] for s in flagged}
    high = {s["id"] for s in flagged if s["current"]["risk"] == "High"}

    print(f"\ninjected leaks        : {sorted(truth)}")
    print(f"flagged (any)         : {sorted(hits)}")
    print(f"flagged High          : {sorted(high)}")
    print(f"leak recall           : {len(truth & hits)}/{len(truth)} "
          f"({len(truth & high)}/{len(truth)} at High)")
    print(f"settlement -> Medium  : {len(settle & hits)}/{len(settle)} "
          f"(expected: raised for monitoring, not dispatch)")
    print(f"steady creep rejected : {len(creep - hits)}/{len(creep)} "
          f"(acceleration gate working)")
    print(f"unexplained flags     : {sorted(hits - truth - set(confusers))}")

    print(f"\n-- historic view ({historic_stats['as_of']}, 6 months ago) --")
    print(f"High {historic_stats['flagged_high']} | "
          f"Medium {historic_stats['flagged_medium']}")
    for s in out_segments:
        if s["historic"]["risk"] != "Low":
            h = s["historic"]
            print(f"  {s['id']} {h['risk']:<7} z={h['z_score']:.1f} "
                  f"v={h['recent_velocity_mm_per_month']:.2f}")

    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
