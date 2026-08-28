/**
 * AquaGuard - tunable assumptions
 * ===============================
 *
 * EVERY headline number on the dashboard is derived from the constants in this
 * file. Nothing is hard-coded into a component. If a judge disputes an
 * assumption, change it here and the whole dashboard re-derives on save.
 *
 * Each constant carries its basis. Where a figure is an assumption rather than
 * a measurement, it says so.
 */

export const ECONOMICS = {
  /**
   * Value of one cubic metre of treated water lost, in AZN.
   *
   * BASIS: Azərsu domestic potable-water tariff band (~0.35 AZN/m3). This
   * values non-revenue water at what it would have been billed at.
   *
   * A more conservative accounting would use MARGINAL PRODUCTION COST
   * (abstraction + treatment + pumping, roughly 0.12-0.18 AZN/m3) instead,
   * on the argument that unbilled water was never revenue in the first place.
   * Set this to 0.15 to present the conservative case.
   */
  WATER_TARIFF_AZN_PER_M3: 0.35,

  /**
   * Assumed discharge of a single detectable sub-surface leak, in m3/day,
   * on a nominal DN200 distribution main.
   *
   * BASIS: IWA "BABE" (Background and Bursts Estimates) planning figures for
   * unreported leaks on distribution mains. Unreported leaks are the class
   * that runs for months precisely because nothing surfaces - which is the
   * class this system targets.
   *
   * Only High-risk detections feed the headline loss figure. Medium is a
   * monitoring state, not a confirmed loss, so it is reported separately.
   */
  LEAK_M3_PER_DAY_AT_REFERENCE_DN: {
    High: 45,
    Medium: 12,
    Low: 0,
  },

  /** Reference diameter for the figure above. Leak rate scales linearly with DN. */
  REFERENCE_DIAMETER_MM: 200,

  /**
   * Detection lead time, in days.
   *
   * ASSUMPTION: how much earlier InSAR flags a leak than the status quo, where
   * an unreported leak is found only once water surfaces, pressure drops
   * measurably, or a customer complains. Utility literature puts the average
   * awareness time for unreported leaks in the 6-18 month range; 180 days is
   * the conservative end.
   *
   * This is the single most sensitive assumption in the model. Halve it and
   * the benefit halves.
   */
  DETECTION_LEAD_TIME_DAYS: 180,

  /**
   * Total length of Azərsu's water distribution network, in km.
   * Used ONLY for the clearly-labelled network-scale extrapolation.
   * ASSUMPTION - replace with the operator's own asset register figure.
   */
  UTILITY_NETWORK_KM: 14000,
}

export const OPERATIONS = {
  /**
   * Cost of dispatching a crew to survey one segment by conventional means
   * (acoustic correlator sweep), in AZN. Used for the targeting-efficiency
   * comparison: surveying 54 segments blind vs. surveying the 4 that are flagged.
   */
  SURVEY_COST_PER_SEGMENT_AZN: 220,

  /** Sentinel-1 revisit interval, days. Drives the "next update" countdown. */
  SATELLITE_REVISIT_DAYS: 12,
}

/**
 * Risk presentation.
 *
 * Colour is NEVER the only channel: every risk state also carries a distinct
 * stroke weight on the map, a numbered map marker, and an explicit text label.
 * Red/green sit ~4 dE apart under deuteranopia, so colour alone would be
 * unreadable for roughly 1 in 12 men - which in a utility ops room is not a
 * hypothetical.
 */
export const RISK = {
  High:   { color: '#d03b3b', label: 'High',   weight: 5.5, order: 0, action: 'Dispatch inspection crew' },
  Medium: { color: '#fab219', label: 'Medium', weight: 3.5, order: 1, action: 'Monitor — re-assess next pass' },
  Low:    { color: '#0ca30c', label: 'Stable', weight: 1.8, order: 2, action: 'No action required' },
}

/** Chart + chrome colours (validated against the #1a1a19 dark surface). */
export const VIZ = {
  series: '#3987e5',       // seasonally corrected displacement
  raw: '#898781',          // raw LOS measurement
  grid: '#2c2c2a',
  axis: '#383835',
}

// ---------------------------------------------------------------------------
// Derived figures - the arithmetic behind every KPI tile
// ---------------------------------------------------------------------------

/** Estimated discharge of one segment's leak, m3/day, scaled by diameter. */
export function leakRateM3PerDay(risk, diameterMm) {
  const base = ECONOMICS.LEAK_M3_PER_DAY_AT_REFERENCE_DN[risk] ?? 0
  return base * (diameterMm / ECONOMICS.REFERENCE_DIAMETER_MM)
}

/**
 * Roll the whole network up into the numbers shown in the header.
 * `segments` is the dataset array; `view` is 'current' | 'historic'.
 */
export function summarise(segments, view) {
  const analysisOf = (s) => (view === 'historic' ? s.historic : s.current)

  const lengthKm = segments.reduce((a, s) => a + s.length_m, 0) / 1000
  const high = segments.filter((s) => analysisOf(s).risk === 'High')
  const medium = segments.filter((s) => analysisOf(s).risk === 'Medium')

  // Headline loss counts High-risk detections only.
  const lossM3PerDay = high.reduce(
    (a, s) => a + leakRateM3PerDay('High', s.diameter_mm), 0)
  const monitorM3PerDay = medium.reduce(
    (a, s) => a + leakRateM3PerDay('Medium', s.diameter_mm), 0)

  // Water recovered by acting DETECTION_LEAD_TIME_DAYS earlier than the
  // status quo, valued at the tariff.
  const recoveredM3 = lossM3PerDay * ECONOMICS.DETECTION_LEAD_TIME_DAYS
  const savingsAzn = recoveredM3 * ECONOMICS.WATER_TARIFF_AZN_PER_M3

  // Targeting efficiency: crews visit the flagged segments instead of all of them.
  const blindSurveyAzn = segments.length * OPERATIONS.SURVEY_COST_PER_SEGMENT_AZN
  const targetedSurveyAzn =
    (high.length + medium.length) * OPERATIONS.SURVEY_COST_PER_SEGMENT_AZN

  // Linear extrapolation to the full utility network. Clearly flagged as such
  // in the UI - it assumes this district's leak density is representative,
  // which it may well not be.
  const scale = ECONOMICS.UTILITY_NETWORK_KM / lengthKm

  return {
    lengthKm,
    segmentCount: segments.length,
    highCount: high.length,
    mediumCount: medium.length,
    lossM3PerDay,
    monitorM3PerDay,
    recoveredM3,
    savingsAzn,
    surveySavingsAzn: blindSurveyAzn - targetedSurveyAzn,
    scaled: {
      factor: scale,
      lossM3PerDay: lossM3PerDay * scale,
      savingsAzn: savingsAzn * scale,
    },
  }
}
