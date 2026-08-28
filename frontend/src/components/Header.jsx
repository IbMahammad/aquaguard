import { useState } from 'react'
import { ECONOMICS, OPERATIONS } from '../config.js'
import { IconSatellite, IconInfo } from './Icons.jsx'

const int = (n) => Math.round(n).toLocaleString('en-US')

/**
 * One KPI tile. The "?" reveals the arithmetic inline - a judge asking
 * "where does that number come from?" gets the answer on screen rather than
 * a verbal claim.
 */
function Kpi({ label, value, unit, note, formula, delta }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="kpi">
      <div className="kpi-label">
        {label}
        {formula && (
          <button className="why" onClick={() => setOpen(!open)}
                  aria-expanded={open} aria-label={`How ${label} is calculated`}>
            ?
          </button>
        )}
      </div>
      <div className="kpi-value">
        {value}{unit && <small>{unit}</small>}
      </div>
      {delta ? <div className={`kpi-delta ${delta.kind}`}>{delta.text}</div>
             : note && <div className="kpi-note">{note}</div>}
      {open && <div className="kpi-formula">{formula}</div>}
    </div>
  )
}

export default function Header({ data, summary, baseline, view, setView, onMethodology }) {
  const asOf = view === 'historic'
    ? data.views.historic.as_of
    : data.views.current.as_of

  const newHigh = summary.highCount - baseline.highCount

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"><IconSatellite /></div>
          <div>
            <div className="brand-name">AquaGuard</div>
            <div className="brand-sub">InSAR leak detection · Azərsu</div>
          </div>
        </div>

        <div className="aoi">
          <span className="live-dot" />
          {data.meta.aoi}
        </div>

        <div className="topbar-spacer" />

        <div className="toggle" role="group" aria-label="Time period">
          <button aria-pressed={view === 'historic'} onClick={() => setView('historic')}>
            6 months ago
          </button>
          <button aria-pressed={view === 'current'} onClick={() => setView('current')}>
            Current
          </button>
        </div>

        <div className="aoi" style={{ borderStyle: 'dashed' }}>
          Epoch <b style={{ color: 'var(--ink)', marginLeft: 4 }}>{asOf}</b>
        </div>

        <button className="btn" onClick={onMethodology}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IconInfo /> Methodology
        </button>
      </div>

      <div className="kpi-strip">
        <Kpi
          label="Network monitored"
          value={summary.lengthKm.toFixed(2)}
          unit="km"
          note={`${summary.segmentCount} segments · DN150–DN400`}
        />

        <Kpi
          label="High-risk segments"
          value={summary.highCount}
          delta={
            view === 'current' && newHigh > 0
              ? { kind: 'up', text: `▲ ${newHigh} new since ${data.views.historic.as_of}` }
              : { kind: 'flat', text: `${summary.mediumCount} more under monitoring` }
          }
          formula={
            <>
              Flagged where the robust z-score of recent velocity ≤{' '}
              {data.meta.detector.z_high} <em>and</em> the segment is accelerating
              downwards by ≥ {Math.abs(data.meta.detector.accel_high_mm_per_month2)} mm/mo²
              against its own baseline.
            </>
          }
        />

        <Kpi
          label="Est. water loss"
          value={int(summary.lossM3PerDay)}
          unit="m³/day"
          note={`${int(summary.lossM3PerDay * 365)} m³/yr if left unrepaired`}
          formula={
            <>
              {summary.highCount} High segments ×{' '}
              {ECONOMICS.LEAK_M3_PER_DAY_AT_REFERENCE_DN.High} m³/day at DN
              {ECONOMICS.REFERENCE_DIAMETER_MM}, scaled linearly by each segment's
              diameter. IWA BABE planning figure for unreported leaks. Medium-risk
              segments ({int(summary.monitorM3PerDay)} m³/day) are excluded — they are
              a monitoring state, not a confirmed loss.
            </>
          }
        />

        <Kpi
          label="Recoverable value"
          value={int(summary.savingsAzn)}
          unit="AZN"
          note={`per ${ECONOMICS.DETECTION_LEAD_TIME_DAYS}-day detection cycle`}
          formula={
            <>
              {int(summary.lossM3PerDay)} m³/day ×{' '}
              {ECONOMICS.DETECTION_LEAD_TIME_DAYS} days of avoided leak-life ×{' '}
              {ECONOMICS.WATER_TARIFF_AZN_PER_M3} AZN/m³ ={' '}
              {int(summary.savingsAzn)} AZN. Plus {int(summary.surveySavingsAzn)} AZN
              of avoided blind survey at {OPERATIONS.SURVEY_COST_PER_SEGMENT_AZN} AZN
              per segment. Water valued at the Azərsu domestic tariff.
            </>
          }
        />

        <Kpi
          label="Survey effort avoided"
          value={Math.round(
            (1 - (summary.highCount + summary.mediumCount) / summary.segmentCount) * 100
          )}
          unit="%"
          note={`crews visit ${summary.highCount + summary.mediumCount} of ${summary.segmentCount} segments`}
          formula={
            <>
              Conventional practice sweeps the whole district acoustically. Targeting
              only flagged segments removes{' '}
              {summary.segmentCount - summary.highCount - summary.mediumCount} of{' '}
              {summary.segmentCount} site visits — {int(summary.surveySavingsAzn)} AZN
              at {OPERATIONS.SURVEY_COST_PER_SEGMENT_AZN} AZN per segment.
            </>
          }
        />
      </div>
    </>
  )
}
