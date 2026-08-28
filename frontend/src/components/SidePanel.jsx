import { useState, useEffect } from 'react'
import DisplacementChart from './DisplacementChart.jsx'
import { RiskIcon, IconBack } from './Icons.jsx'
import { RISK, ECONOMICS, OPERATIONS, leakRateM3PerDay } from '../config.js'

const int = (n) => Math.round(n).toLocaleString('en-US')

/* ------------------------------------------------------------------ queue - */

function TriageQueue({ ranked, view, selectedId, onSelect, epoch }) {
  const analysisOf = (s) => (view === 'historic' ? s.historic : s.current)

  if (ranked.length === 0) {
    return (
      <div className="empty">
        <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
        No anomalies above threshold as of {epoch}.
        <div style={{ marginTop: 10, fontSize: 12 }}>
          Every segment is within 2σ of the network baseline. Switch to
          <b style={{ color: 'var(--ink-2)' }}> Current</b> to see how the picture
          changed.
        </div>
      </div>
    )
  }

  return (
    <>
      {ranked.map((seg, i) => {
        const a = analysisOf(seg)
        const style = RISK[a.risk]
        return (
          <button key={seg.id}
                  className={`queue-item${seg.id === selectedId ? ' sel' : ''}`}
                  onClick={() => onSelect(seg.id)}>
            <div className="queue-top">
              <span className={`queue-rank ${a.risk.toLowerCase()}`}>{i + 1}</span>
              <span className="queue-id">{seg.id}</span>
              <span className="queue-v" style={{ color: style.color }}>
                {a.recent_velocity_mm_per_month.toFixed(2)} mm/mo
              </span>
            </div>
            <div className="queue-street">{seg.street} · DN{seg.diameter_mm}</div>
            <div className="queue-meta">
              {a.risk === 'High' ? 'High risk' : 'Monitor'} ·
              z = {a.z_score.toFixed(1)} ·
              {a.days_since_onset != null
                ? ` accelerating ${a.days_since_onset} days`
                : ' onset unresolved'}
            </div>
          </button>
        )
      })}
    </>
  )
}

/* ----------------------------------------------------------------- detail - */

function SegmentDetail({ segment, view, onBack, rank }) {
  const a = view === 'historic' ? segment.historic : segment.current
  const style = RISK[a.risk]
  const [dispatched, setDispatched] = useState(false)

  useEffect(() => setDispatched(false), [segment.id, view])

  const leak = leakRateM3PerDay(a.risk, segment.diameter_mm)
  const [lng, lat] = segment.centroid
  const age = new Date().getFullYear() - segment.install_year

  return (
    <div className="detail">
      <button className="back" onClick={onBack}><IconBack /> Triage queue</button>

      <div className="detail-id">{segment.id}</div>
      <div className="detail-street">
        {segment.street} · DN{segment.diameter_mm} {segment.material}
      </div>
      <div className="detail-coord">
        {lat.toFixed(5)}° N, {lng.toFixed(5)}° E · {segment.length_m} m
      </div>

      <div className={`badge ${a.risk.toLowerCase()}`}>
        <RiskIcon risk={a.risk} />
        {a.risk === 'Low' ? 'Stable — no action required' : `${a.risk} risk`}
        {rank && a.risk !== 'Low' && (
          <span style={{ opacity: 0.7, fontWeight: 500 }}>· priority {rank}</span>
        )}
      </div>

      {/* ------------------------------------------------------ time series - */}
      <div className="section-label">Ground displacement history</div>
      <DisplacementChart segment={segment} analysis={a}
                         windowMonths={6} />

      {/* --------------------------------------------------------- headline - */}
      <div className="section-label">Deformation</div>
      <div className="facts">
        <div className="fact">
          <dt>RECENT VELOCITY</dt>
          <dd style={{ color: style.color }}>
            {a.recent_velocity_mm_per_month.toFixed(2)}<small>mm/mo</small>
          </dd>
        </div>
        <div className="fact">
          <dt>ACCELERATION</dt>
          <dd style={{ color: style.color }}>
            {a.acceleration_mm_per_month2.toFixed(2)}<small>mm/mo²</small>
          </dd>
        </div>
        <div className="fact">
          <dt>CUMULATIVE</dt>
          <dd>{a.cumulative_displacement_mm.toFixed(1)}<small>mm</small></dd>
        </div>
        <div className="fact">
          <dt>LAST 6 MONTHS</dt>
          <dd>{a.recent_displacement_mm.toFixed(1)}<small>mm</small></dd>
        </div>
      </div>

      {/* ------------------------------------------------------ the verdict - */}
      <div className="section-label">Detection evidence</div>
      <dl style={{ margin: 0 }}>
        <div className="kv">
          <dt>Robust z-score</dt>
          <dd style={{ color: a.risk === 'Low' ? undefined : style.color, fontWeight: 600 }}>
            {a.z_score.toFixed(2)} σ
          </dd>
        </div>
        <div className="kv">
          <dt>Baseline velocity</dt>
          <dd>{a.baseline_velocity_mm_per_month.toFixed(2)} mm/mo</dd>
        </div>
        <div className="kv">
          <dt>Trend fit (R²)</dt>
          <dd>{a.recent_fit_r2.toFixed(2)}</dd>
        </div>
        <div className="kv">
          <dt>Acceleration onset</dt>
          <dd>{a.onset_month ?? '—'}</dd>
        </div>
        <div className="kv">
          <dt>Days since onset</dt>
          <dd style={{ fontWeight: 600 }}>
            {a.days_since_onset != null ? `${a.days_since_onset} days` : '—'}
          </dd>
        </div>
        <div className="kv">
          <dt>Persistent scatterers</dt>
          <dd>{segment.ps_count}</dd>
        </div>
        <div className="kv">
          <dt>Detection confidence</dt>
          <dd>{a.confidence != null ? `${Math.round(a.confidence * 100)}%` : '—'}</dd>
        </div>
      </dl>

      {/* ------------------------------------------------------- assessment - */}
      {a.risk !== 'Low' && (
        <>
          <div className="section-label">Assessment</div>
          <div className="callout">
            {a.risk === 'High' ? (
              <>
                Ground above this segment has been subsiding at{' '}
                <b>{Math.abs(a.recent_velocity_mm_per_month).toFixed(2)} mm/month</b> for
                the past <b>{a.days_since_onset} days</b>, accelerating away from its own
                baseline of{' '}
                {Math.abs(a.baseline_velocity_mm_per_month).toFixed(2)} mm/month. At{' '}
                <b>{a.z_score.toFixed(1)}σ</b> it is the kind of localised, accelerating
                signature consistent with soil washout from a pressurised main.
                Estimated discharge <b>{leak.toFixed(0)} m³/day</b> —{' '}
                {int(leak * ECONOMICS.WATER_TARIFF_AZN_PER_M3 * 365)} AZN/year unrepaired.
                {age > 40 && (
                  <> This is {age}-year-old {segment.material.toLowerCase()},
                    which raises prior probability further.</>
                )}
              </>
            ) : (
              <>
                Motion is elevated but ambiguous: {a.z_score.toFixed(1)}σ against the
                network baseline, accelerating at{' '}
                {a.acceleration_mm_per_month2.toFixed(2)} mm/mo². This is consistent with
                a developing leak <em>or</em> with shallow consolidation from nearby
                works. <b>Recommend monitoring</b> rather than dispatch — re-assess on
                the next {OPERATIONS.SATELLITE_REVISIT_DAYS}-day pass. Cross-checking
                against DMA night-flow for this zone would resolve it fastest.
              </>
            )}
          </div>
        </>
      )}

      {/* --------------------------------------------------------- dispatch - */}
      <div style={{ marginTop: 20 }}>
        <button className="btn-primary"
                disabled={a.risk === 'Low' || dispatched}
                onClick={() => setDispatched(true)}>
          {a.risk === 'Low' ? 'No action required'
            : dispatched
              ? (a.risk === 'High'
                  ? '✓ Crew dispatched — work order AZS-2026-0448'
                  : '✓ Added to watchlist — re-assess next pass')
              : style.action}
        </button>
        <div className="dispatch-note">
          {dispatched
            ? 'Demo only — nothing was actually created.'
            : a.risk === 'High'
              ? 'Would raise a work order in Azərsu’s dispatch system.'
              : `Would queue re-assessment on the next ${OPERATIONS.SATELLITE_REVISIT_DAYS}-day pass.`}
        </div>
      </div>

      {/* ------------------------------------------------------ asset facts - */}
      <div className="section-label">Asset record</div>
      <dl style={{ margin: 0 }}>
        <div className="kv"><dt>Material</dt><dd>{segment.material}</dd></div>
        <div className="kv"><dt>Nominal diameter</dt><dd>DN{segment.diameter_mm}</dd></div>
        <div className="kv"><dt>Installed</dt><dd>{segment.install_year} ({age} yrs)</dd></div>
        <div className="kv"><dt>Segment length</dt><dd>{segment.length_m} m</dd></div>
        <div className="kv"><dt>Analysis epoch</dt><dd>{a.as_of}</dd></div>
      </dl>
    </div>
  )
}

/* ------------------------------------------------------------------ shell - */

export default function SidePanel({ data, view, ranked, selectedId, onSelect }) {
  const segment = selectedId ? data.segments.find((s) => s.id === selectedId) : null
  const rank = segment ? ranked.findIndex((s) => s.id === segment.id) + 1 : 0
  const epoch = view === 'historic' ? data.views.historic.as_of : data.views.current.as_of

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-title">
          {segment ? 'Segment detail' : 'Inspection queue'}
        </div>
        {!segment && (
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3 }}>
            {ranked.length
              ? `${ranked.length} segment${ranked.length > 1 ? 's' : ''} flagged · ranked by severity`
              : `Nothing flagged as of ${epoch}`}
          </div>
        )}
      </div>

      <div className="panel-body">
        {segment ? (
          <SegmentDetail segment={segment} view={view} rank={rank || null}
                         onBack={() => onSelect(null)} />
        ) : (
          <TriageQueue ranked={ranked} view={view} selectedId={selectedId}
                       onSelect={onSelect} epoch={epoch} />
        )}
      </div>
    </aside>
  )
}
