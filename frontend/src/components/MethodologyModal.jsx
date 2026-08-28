import { useEffect } from 'react'
import { ECONOMICS, OPERATIONS } from '../config.js'
import { IconInfo } from './Icons.jsx'

const azn = (n) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * The honesty layer.
 *
 * Stating plainly that the demo data is synthetic is not a weakness in a
 * pitch - it is the thing that makes every other number on screen worth
 * listening to. A judge who discovers it themselves stops believing the rest.
 */
export default function MethodologyModal({ data, summary, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const d = data.meta.detector

  return (
    <div className="scrim" onClick={onClose} role="dialog" aria-modal="true"
         aria-label="Methodology and data provenance">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>Methodology &amp; data provenance</h2>
            <p>How every number on this dashboard is produced — and what is not real.</p>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          {/* ---------------------------------------------- the disclosure - */}
          <div className="notice">
            <IconInfo style={{ color: '#fab219' }} />
            <div>
              <b>This demo uses synthetic data.</b> Displacement values are
              simulated, not measured — they are calibrated to realistic InSAR
              displacement ranges (Sentinel-1, ~12-day revisit, millimetre
              precision) to illustrate the detection concept. Production
              deployment would use real Sentinel-1 SAR time series processed via
              InSAR (e.g. MintPy) and require calibration against Azərsu's
              historical leak records.
            </div>
          </div>

          {/* ------------------------------------------------ the concept - */}
          <h3>Physical basis</h3>
          <p>
            A pressurised main losing water saturates and erodes the surrounding
            soil. The material migrates, a void develops, and the ground surface
            directly above settles — typically a few millimetres per month, and
            crucially <em>accelerating</em> as the void grows. Radar
            interferometry resolves exactly this magnitude of vertical motion
            from orbit, which is why the signal is detectable long before water
            reaches the surface or pressure telemetry registers anything.
          </p>

          {/* ------------------------------------------------ the pipeline - */}
          <h3>Processing chain</h3>
          <ol className="steps">
            <li>
              <b>Acquisition</b>
              Sentinel-1 IW SLC, C-band, descending track. 12-day revisit;
              acquisitions stacked to one displacement value per month.
            </li>
            <li>
              <b>InSAR time series</b>
              Persistent-scatterer / SBAS processing (MintPy) → line-of-sight
              displacement per coherent target. Urban Baku is well suited: dense
              built surfaces give high coherence and PS density.
            </li>
            <li>
              <b>Network association</b>
              Scatterers are attributed to the nearest pipe segment within a
              buffer, giving each segment its own displacement history.
              PS count per segment is carried through as a confidence weight.
            </li>
            <li>
              <b>Anomaly detection</b>
              The statistical test described below — deliberately transparent,
              because a utility must be able to justify digging up a road.
            </li>
            <li>
              <b>Triage</b>
              Ranked work queue for field crews, worst first.
            </li>
          </ol>

          {/* ------------------------------------------------ the detector - */}
          <h3>Detection rule</h3>
          <p>
            No black box. A z-score against the network's own robust baseline,
            gated on acceleration:
          </p>
          <table className="spec">
            <tbody>
              <tr>
                <td>Deseasonalise</td>
                <td>
                  An annual harmonic (thermal + groundwater cycle, 1–3 mm) is fitted
                  on the baseline window <em>only</em> and removed. Fitting it across
                  the recent window too would absorb a real leak into the seasonal term.
                </td>
              </tr>
              <tr>
                <td>Recent velocity</td>
                <td>OLS slope over the last {d.recent_window_months} months, mm/month.</td>
              </tr>
              <tr>
                <td>Baseline velocity</td>
                <td>
                  OLS slope over everything before that — the segment's own normal, so a
                  street that has always crept downwards is not flagged forever.
                </td>
              </tr>
              <tr>
                <td>Acceleration</td>
                <td>
                  Recent − baseline. This is the discriminator: a leak subsides
                  <em> faster over time</em>, ordinary consolidation does not.
                </td>
              </tr>
              <tr>
                <td>Robust z-score</td>
                <td>
                  (velocity − median) ÷ (1.4826 × MAD) across all {data.segments.length} segments.
                  Median/MAD rather than mean/SD so the leaks cannot inflate the
                  baseline they are being tested against.
                </td>
              </tr>
              <tr>
                <td>Onset</td>
                <td>
                  Single-changepoint scan — the epoch that best splits the series into
                  two linear pieces. Yields "days since acceleration started".
                </td>
              </tr>
              <tr>
                <td>Banding</td>
                <td className="num">
                  High: z ≤ {d.z_high} and accel ≤ {d.accel_high_mm_per_month2} mm/mo²<br />
                  Medium: z ≤ {d.z_medium} and accel ≤ {d.accel_medium_mm_per_month2} mm/mo²
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: 10 }}>
            Current network baseline:{' '}
            <span className="mono">
              median {data.views.current.network_median_velocity} mm/mo, σ ={' '}
              {data.views.current.network_sigma_velocity} mm/mo
            </span>{' '}
            — derived from the observed dispersion, not assumed.
          </p>

          {/* ------------------------------ detector performance on truth - */}
          <h3>Detector performance against injected ground truth</h3>
          <p>
            Because the dataset is synthetic we know the answer, so the detector can be
            scored honestly. Four leaks were injected, along with four deliberate
            confusers:
          </p>
          <table className="spec">
            <thead>
              <tr><th>Case</th><th>Injected</th><th>Detector verdict</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Leaks</td>
                <td>{Object.keys(data.ground_truth).length} accelerating subsidence signals</td>
                <td>
                  {Object.keys(data.ground_truth).filter(
                    (id) => data.segments.find((s) => s.id === id)?.current.risk === 'High'
                  ).length}
                  /{Object.keys(data.ground_truth).length} recovered at High
                </td>
              </tr>
              <tr>
                <td>Settlement</td>
                <td>Mild recent trend change, not a leak</td>
                <td>Raised to Medium — monitor, do not dispatch</td>
              </tr>
              <tr>
                <td>Steady creep</td>
                <td>Linear subsidence, no acceleration</td>
                <td>Correctly rejected by the acceleration gate</td>
              </tr>
              <tr>
                <td>False positives</td>
                <td>—</td>
                <td>
                  {Object.values(data.segments).filter(
                    (s) => s.current.risk !== 'Low' &&
                      !data.ground_truth[s.id] && !data.confusers[s.id]
                  ).length}{' '}
                  segment(s) at Medium, sitting on the threshold
                </td>
              </tr>
            </tbody>
          </table>

          {/* ------------------------------------------------ the economics - */}
          <h3>Economic assumptions</h3>
          <p>
            Every figure in the header derives from these constants. They live in one
            file (<span className="mono">src/config.js</span>) and are meant to be argued
            with — change one and the dashboard re-derives.
          </p>
          <table className="spec">
            <thead>
              <tr><th>Constant</th><th>Value</th><th>Basis</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Water value</td>
                <td className="num">{ECONOMICS.WATER_TARIFF_AZN_PER_M3} AZN/m³</td>
                <td>
                  Azərsu domestic potable tariff band. A conservative alternative is
                  marginal production cost (~0.15 AZN/m³) on the argument that unbilled
                  water was never revenue.
                </td>
              </tr>
              <tr>
                <td>Leak discharge</td>
                <td className="num">
                  {ECONOMICS.LEAK_M3_PER_DAY_AT_REFERENCE_DN.High} m³/day
                  @ DN{ECONOMICS.REFERENCE_DIAMETER_MM}
                </td>
                <td>
                  IWA BABE planning figure for an unreported leak on a distribution
                  main; scaled linearly with diameter. Only High detections count
                  toward the headline loss.
                </td>
              </tr>
              <tr>
                <td>Detection lead time</td>
                <td className="num">{ECONOMICS.DETECTION_LEAD_TIME_DAYS} days</td>
                <td>
                  How much earlier this flags a leak than discovery-by-surfacing.
                  The most sensitive assumption in the model — halve it and the
                  benefit halves.
                </td>
              </tr>
              <tr>
                <td>Survey cost</td>
                <td className="num">{OPERATIONS.SURVEY_COST_PER_SEGMENT_AZN} AZN/segment</td>
                <td>Conventional acoustic correlator sweep, per segment.</td>
              </tr>
            </tbody>
          </table>

          <div className="callout" style={{ marginTop: 16 }}>
            <b>Pilot arithmetic.</b>{' '}
            {summary.highCount} High-risk segments ×
            diameter-scaled discharge = <b>{Math.round(summary.lossM3PerDay)} m³/day</b>.
            Acting {ECONOMICS.DETECTION_LEAD_TIME_DAYS} days earlier recovers{' '}
            {Math.round(summary.recoveredM3).toLocaleString()} m³, worth{' '}
            <b>{azn(summary.savingsAzn)} AZN</b> at {ECONOMICS.WATER_TARIFF_AZN_PER_M3} AZN/m³,
            across {summary.lengthKm.toFixed(1)} km of monitored main.
          </div>

          <div className="callout">
            <b>Network-scale extrapolation — illustrative only.</b>{' '}
            Scaling this district linearly to Azərsu's ~
            {ECONOMICS.UTILITY_NETWORK_KM.toLocaleString()} km network (×
            {Math.round(summary.scaled.factor)}) implies{' '}
            {Math.round(summary.scaled.lossM3PerDay).toLocaleString()} m³/day and{' '}
            {azn(summary.scaled.savingsAzn)} AZN per detection cycle. This assumes
            the district's leak density is representative of the whole network, which
            it may well not be — an older or higher-pressure zone would differ
            substantially. Treat it as an order of magnitude, not a forecast.
          </div>

          {/* ---------------------------------------------- what's missing - */}
          <h3>What a production system would still need</h3>
          <table className="spec">
            <tbody>
              <tr>
                <td>Calibration</td>
                <td>
                  Supervised tuning of the thresholds against Azərsu's historical
                  repair records — the only way to state a real precision/recall.
                </td>
              </tr>
              <tr>
                <td>Confounders</td>
                <td>
                  Metro tunnelling, construction dewatering, sewer collapse and
                  natural consolidation all produce subsidence. Masking against
                  permit and construction data is essential to keep precision usable.
                </td>
              </tr>
              <tr>
                <td>Vertical decomposition</td>
                <td>
                  A single orbit measures line-of-sight, not true vertical.
                  Ascending + descending tracks are needed to separate vertical
                  from east–west motion.
                </td>
              </tr>
              <tr>
                <td>Coherence limits</td>
                <td>
                  Vegetated, sandy or rapidly-changing surfaces decorrelate. Coverage
                  is genuinely partial outside dense urban fabric.
                </td>
              </tr>
              <tr>
                <td>Fusion</td>
                <td>
                  Combining with DMA night-flow, pressure telemetry and pipe age
                  would raise precision well above what deformation alone can reach.
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Dataset</h3>
          <table className="spec">
            <tbody>
              <tr><td>Area of interest</td><td>{data.meta.aoi}</td></tr>
              <tr><td>Network monitored</td><td className="num">{data.meta.total_length_km} km · {data.meta.segment_count} segments</td></tr>
              <tr><td>Record</td><td className="num">{data.meta.first_month} → {data.meta.last_month} ({data.meta.epochs} monthly epochs)</td></tr>
              <tr><td>Reference sensor</td><td>{data.meta.sensor_reference}</td></tr>
              <tr><td>Units</td><td>{data.meta.units}</td></tr>
              <tr><td>Provenance</td><td style={{ color: '#fab219' }}>{data.meta.data_source}</td></tr>
              <tr><td>Reproducibility</td><td className="num">deterministic, RNG seed {data.meta.seed}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
