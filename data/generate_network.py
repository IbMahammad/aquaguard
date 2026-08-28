"""
AquaGuard - synthetic InSAR displacement dataset generator
==========================================================

Builds a realistic water distribution network for the Nərimanov district of
Baku and, for every pipe segment, a 24-month ground-displacement time series
in the style of a Sentinel-1 InSAR product.

IMPORTANT / HONESTY NOTE
------------------------
The displacement values here are SYNTHETIC. They are calibrated to the
amplitude and noise characteristics you would actually see in a Sentinel-1
PS-InSAR / SBAS time series over an urban area:

  * Sentinel-1 revisit          : 12 days (6 days with S1A+S1B)
  * LOS displacement precision  : ~1-3 mm per epoch on coherent urban targets
  * Monthly product             : epochs stacked/averaged to one value per month
  * Seasonal signal             : 1-3 mm amplitude (thermal expansion +
                                  shallow groundwater table cycle)
  * Regional background trend   : |v| < 0.3 mm/month for stable urban ground
  * Leak-induced subsidence     : localised, ACCELERATING, typically 1-5
                                  mm/month once the void starts developing

Only the physics-plausible *shape* of the signal is being simulated - no real
SAR data is used. See README.md.

Deterministic: a fixed RNG seed means the demo looks identical every run.
Pure standard library - no numpy - so it runs anywhere.
"""

import json
import math
import sys
import random
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
# Configuration
# --------------------------------------------------------------------------

SEED = 20260827
N_MONTHS = 24                 # length of the displacement time series
LAST_MONTH = (2026, 8)        # most recent acquisition month (YYYY, M)

# Nərimanov rayonu, Bakı - district centre used as the local origin.
ORIGIN_LAT = 40.4093
ORIGIN_LNG = 49.8671

TARGET_SEGMENT_LEN_M = 200.0  # nominal length a main is chopped into

# Sentinel-1 style noise budget (mm)
EPOCH_NOISE_MM = 0.85         # per-epoch LOS measurement noise (1 sigma)
RANDOM_WALK_MM = 0.28         # month-to-month correlated ground wobble
SEASONAL_AMP_RANGE = (0.8, 2.6)
BACKGROUND_VELOCITY_SIGMA = 0.055   # mm/month, regional settlement

rng = random.Random(SEED)

# --------------------------------------------------------------------------
# Geometry helpers - local ENU (metres) <-> WGS84
# --------------------------------------------------------------------------

M_PER_DEG_LAT = 111_132.0
M_PER_DEG_LNG = 111_320.0 * math.cos(math.radians(ORIGIN_LAT))


def to_lnglat(x_m, y_m):
    """Local metric offset (east, north) -> [lng, lat] rounded to ~1 cm."""
    return [
        round(ORIGIN_LNG + x_m / M_PER_DEG_LNG, 6),
        round(ORIGIN_LAT + y_m / M_PER_DEG_LAT, 6),
    ]


def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def densify(vertices, step=45.0):
    """Resample a polyline at ~`step` metres so segments follow a smooth curve."""
    out = [vertices[0]]
    for a, b in zip(vertices, vertices[1:]):
        seg_len = dist(a, b)
        n = max(1, int(round(seg_len / step)))
        for i in range(1, n + 1):
            t = i / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def jitter_polyline(vertices, amp=9.0):
    """Nudge interior vertices so mains do not look computer-straight."""
    out = [vertices[0]]
    for v in vertices[1:-1]:
        out.append((v[0] + rng.uniform(-amp, amp), v[1] + rng.uniform(-amp, amp)))
    out.append(vertices[-1])
    return out


def chop(vertices, target_len):
    """Split a densified polyline into consecutive runs of ~target_len metres."""
    pieces, current, acc = [], [vertices[0]], 0.0
    for a, b in zip(vertices, vertices[1:]):
        acc += dist(a, b)
        current.append(b)
        if acc >= target_len:
            pieces.append(current)
            current, acc = [b], 0.0
    if len(current) > 1:
        if acc < target_len * 0.45 and pieces:
            pieces[-1].extend(current[1:])   # absorb a short tail
        else:
            pieces.append(current)
    return pieces


def polyline_length(vertices):
    return sum(dist(a, b) for a, b in zip(vertices, vertices[1:]))


# --------------------------------------------------------------------------
# The network: mains laid out in the local metric frame
# --------------------------------------------------------------------------
# (street name, nominal diameter mm, material, install year, vertices in metres)

MAINS = [
    ("Ziya Bünyadov pr.", 400, "Ductile iron", 1996, [
        (-1420, -70), (-980, -40), (-520, -14), (-40, 4), (480, 26),
        (980, 34), (1500, 8),
    ]),
    ("Təbriz küç.", 350, "Steel", 1984, [
        (210, -1120), (196, -760), (182, -400), (196, -40),
        (214, 340), (244, 720), (226, 1180),
    ]),
    ("Fətəli Xan Xoyski pr.", 250, "Ductile iron", 2003, [
        (-1110, -55), (-1096, 220), (-1078, 500), (-1058, 760), (-1046, 940),
    ]),
    ("Koroğlu Rəhimov küç.", 200, "Cast iron", 1971, [
        (-604, -18), (-596, -300), (-584, -600), (-566, -960),
    ]),
    ("Şərifzadə küç.", 200, "HDPE", 2011, [
        (702, 28), (714, 300), (738, 600), (764, 946),
    ]),
    ("Həsən bəy Zərdabi pr.", 150, "Cast iron", 1968, [
        (-1082, 420), (-760, 428), (-420, 438), (-80, 448), (184, 452),
    ]),
    ("Ağa Neymətulla küç.", 150, "Cast iron", 1974, [
        (-566, -958), (-260, -968), (100, -980), (420, -992), (700, -1004),
    ]),
    ("Atatürk pr.", 150, "Steel", 1989, [
        (1104, 22), (1112, -240), (1130, -520), (1152, -806),
    ]),
]


def build_segments():
    segments = []
    counter = 0
    for street, diameter, material, year, verts in MAINS:
        line = densify(jitter_polyline(list(verts), amp=11.0), step=42.0)
        for piece in chop(line, TARGET_SEGMENT_LEN_M):
            counter += 1
            length_m = polyline_length(piece)
            mid = piece[len(piece) // 2]
            segments.append({
                "id": f"AZ-NRM-{counter:03d}",
                "street": street,
                "diameter_mm": diameter,
                "material": material,
                "install_year": year,
                "length_m": round(length_m, 1),
                "coords": [to_lnglat(x, y) for x, y in piece],
                "centroid": to_lnglat(*mid),
                # PS density: how many persistent scatterers back this segment.
                # Drives how much you should trust the measurement.
                "ps_count": int(max(9, round(length_m / 4.2 * rng.uniform(0.55, 1.35)))),
            })
    return segments


# --------------------------------------------------------------------------
# Displacement time series
# --------------------------------------------------------------------------

def month_labels():
    y, m = LAST_MONTH
    labels = []
    for back in range(N_MONTHS - 1, -1, -1):
        yy, mm = y, m - back
        while mm <= 0:
            mm += 12
            yy -= 1
        labels.append(f"{yy}-{mm:02d}")
    return labels


def stable_series(n):
    """Background urban ground: seasonal + correlated walk + white noise."""
    amp = rng.uniform(*SEASONAL_AMP_RANGE)
    phase = rng.uniform(0, 12)
    v0 = rng.gauss(0.0, BACKGROUND_VELOCITY_SIGMA)
    walk = 0.0
    series = []
    for t in range(n):
        walk += rng.gauss(0.0, RANDOM_WALK_MM)
        seasonal = amp * math.sin(2 * math.pi * (t + phase) / 12.0)
        series.append(v0 * t + seasonal + walk + rng.gauss(0.0, EPOCH_NOISE_MM))
    base = series[0]
    return [v - base for v in series]      # referenced to the first epoch


def add_leak_signal(series, onset_idx, total_mm, exponent=1.85):
    """
    Superimpose accelerating subsidence starting at `onset_idx`, reaching
    `total_mm` (negative = downward) by the final epoch.

    A power law with exponent > 1 is the signature the detector looks for:
    velocity keeps increasing rather than settling to a constant rate, which
    is what distinguishes a developing void from ordinary consolidation.
    """
    n = len(series)
    span = (n - 1) - onset_idx
    out = list(series)
    for t in range(onset_idx, n):
        frac = (t - onset_idx) / span
        out[t] += total_mm * (frac ** exponent)
    return out


# Injected "ground truth" leaks. Amplitudes deliberately sit in the few-mm
# band so the demo stays inside what InSAR can genuinely resolve.
#   segment_index : (onset month index, cumulative subsidence mm, label)
LEAKS = {
    3:  (12, -26.0, "Mature leak - void developing, already visible 6 months ago"),
    22: (18, -17.0, "Active leak - classic accelerating signature"),
    41: (19, -13.5, "Recent leak onset"),
    50: (20,  -8.0, "Early-stage seepage"),
}

# NOT leaks. Two families of confuser, included so the demo shows the detector
# discriminating rather than just lighting up wherever ground moves:
#
#   "settlement" - mild recent trend change from shallow consolidation or
#                  nearby construction. Real ground motion, real ambiguity.
#                  The detector SHOULD raise these to Medium (monitor), and a
#                  utility triages them differently from a High.
#
#   "creep"      - steady linear subsidence over the full two years with no
#                  acceleration at all. The acceleration gate SHOULD reject
#                  these, which is the whole point of comparing a segment
#                  against its own baseline instead of a flat threshold.
CONFUSERS = {
    16: ("settlement", 20, -4.6, "Shallow consolidation adjacent to excavation"),
    35: ("settlement", 19, -5.2, "Localised settlement, no pressure anomaly reported"),
    8:  ("creep", 0, -9.0, "Steady regional consolidation - not accelerating"),
    47: ("creep", 0, -7.2, "Steady regional consolidation - not accelerating"),
}


def add_linear_trend(series, total_mm):
    """Constant-rate subsidence across the whole record (no acceleration)."""
    n = len(series)
    return [v + total_mm * (t / (n - 1)) for t, v in enumerate(series)]


def build_dataset():
    segments = build_segments()
    labels = month_labels()

    truth, confusers = {}, {}
    for idx, seg in enumerate(segments):
        series = stable_series(N_MONTHS)

        if idx in LEAKS:
            onset, total, note = LEAKS[idx]
            series = add_leak_signal(series, onset, total)
            truth[seg["id"]] = {
                "onset_index": onset,
                "onset_month": labels[onset],
                "injected_mm": total,
                "note": note,
            }
        elif idx in CONFUSERS:
            kind, onset, total, note = CONFUSERS[idx]
            if kind == "creep":
                series = add_linear_trend(series, total)
            else:
                series = add_leak_signal(series, onset, total, exponent=1.4)
            confusers[seg["id"]] = {
                "kind": kind,
                "onset_month": labels[onset] if kind != "creep" else None,
                "injected_mm": total,
                "note": note,
            }

        seg["dates"] = labels
        seg["displacement_mm"] = [round(v, 2) for v in series]

    return {
        "meta": {
            "generated_for": "VISTAR Cohort 3 - AquaGuard demo",
            "aoi": "Nərimanov rayonu, Bakı, Azərbaycan",
            "origin": {"lat": ORIGIN_LAT, "lng": ORIGIN_LNG},
            "data_source": "SYNTHETIC - calibrated to Sentinel-1 InSAR characteristics",
            "sensor_reference": "Sentinel-1 IW, 12-day revisit, C-band, LOS displacement",
            "epochs": N_MONTHS,
            "epoch_interval": "1 month (stack of ~2-3 Sentinel-1 acquisitions)",
            "units": "millimetres, line-of-sight, negative = subsidence",
            "seed": SEED,
            "first_month": labels[0],
            "last_month": labels[-1],
            "total_length_km": round(sum(s["length_m"] for s in segments) / 1000.0, 2),
            "segment_count": len(segments),
        },
        "ground_truth": truth,
        "confusers": confusers,
        "segments": segments,
    }


if __name__ == "__main__":
    out_path = Path(__file__).resolve().parent / "raw_displacement.json"
    ds = build_dataset()
    out_path.write_text(json.dumps(ds, ensure_ascii=False, indent=1), encoding="utf-8")

    m = ds["meta"]
    print(f"[generate_network] {m['segment_count']} segments, "
          f"{m['total_length_km']} km, {m['epochs']} monthly epochs "
          f"({m['first_month']} -> {m['last_month']})")
    print(f"[generate_network] injected leaks : {', '.join(ds['ground_truth'])}")
    print(f"[generate_network] confusers      : {', '.join(ds['confusers'])}")
    print(f"[generate_network] wrote {out_path}")
