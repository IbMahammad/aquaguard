import { useMemo, useRef, useState } from 'react'
import { VIZ, RISK } from '../config.js'

/**
 * Line-of-sight displacement history for one pipe segment.
 *
 * Two series, so a legend is always present:
 *   - raw LOS measurement        (muted, thin, dotted markers)
 *   - seasonally corrected       (blue, 2px - the series the detector reads)
 *
 * Plus two annotation layers that are not series and are directly labelled:
 *   - the fitted trend across the recent window, in the segment's risk colour
 *   - a rule at the detected onset epoch
 *
 * Hand-rolled SVG rather than a chart library: one axis, full control of the
 * annotation layer, and no dependency that can break the morning of a demo.
 */

const W = 360
const H = 208
const M = { top: 16, right: 13, bottom: 26, left: 35 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

function niceTicks(min, max, count = 4) {
  const span = max - min || 1
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) * mag
  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6)
  }
  return ticks
}

function shortMonth(label) {
  const [y, m] = label.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[+m - 1]} ${y.slice(2)}`
}

export default function DisplacementChart({ segment, analysis, windowMonths = 6 }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null)

  const model = useMemo(() => {
    const n = analysis.corrected_mm.length
    const dates = segment.dates.slice(0, n)
    const raw = segment.displacement_mm.slice(0, n)
    const corrected = analysis.corrected_mm

    const all = [...raw, ...corrected, 0]
    let lo = Math.min(...all)
    let hi = Math.max(...all)
    const pad = Math.max(1.5, (hi - lo) * 0.12)
    lo -= pad
    hi += pad

    const x = (i) => M.left + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W)
    const y = (v) => M.top + ((hi - v) / (hi - lo)) * PLOT_H

    const path = (vals) =>
      vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')

    // Fitted trend over the recent window, drawn from the detector's own
    // velocity so the annotation cannot drift from the reported number.
    const start = n - windowMonths
    const seg = corrected.slice(start)
    const mean = seg.reduce((a, b) => a + b, 0) / seg.length
    const v = analysis.recent_velocity_mm_per_month
    const midT = (windowMonths - 1) / 2
    const trend = {
      x1: x(start), y1: y(mean - v * midT),
      x2: x(n - 1), y2: y(mean + v * midT),
    }

    return {
      n, dates, raw, corrected, x, y, lo, hi, path, trend,
      windowX: x(start),
      yTicks: niceTicks(lo, hi, 4),
      tickIdx: [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1],
    }
  }, [segment, analysis, windowMonths])

  const risk = RISK[analysis.risk]
  const onsetIdx = analysis.onset_index

  function onMove(e) {
    const box = wrapRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - box.left) / box.width) * W
    const t = (svgX - M.left) / PLOT_W
    const i = Math.max(0, Math.min(model.n - 1, Math.round(t * (model.n - 1))))
    setHover(i)
  }

  return (
    <div className="chart-frame">
      <div className="chart-legend">
        <span>
          <svg width="16" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="16" y2="4" stroke={VIZ.raw} strokeWidth="1.25"
                  strokeDasharray="2 2" />
            <circle cx="8" cy="4" r="1.8" fill={VIZ.raw} />
          </svg>
          Raw LOS measurement
        </span>
        <span>
          <svg width="16" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="16" y2="4" stroke={VIZ.series} strokeWidth="2"
                  strokeLinecap="round" />
          </svg>
          Seasonally corrected
        </span>
      </div>

      <div className="chart" ref={wrapRef} style={{ position: 'relative' }}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img"
             aria-label={`Displacement history for segment ${segment.id}. Cumulative ${analysis.cumulative_displacement_mm} millimetres.`}>

          {/* recent analysis window -------------------------------------- */}
          <rect x={model.windowX} y={M.top} width={W - M.right - model.windowX}
                height={PLOT_H} fill="rgba(57,135,229,0.055)" />
          <text x={W - M.right - 3} y={M.top + 10} textAnchor="end"
                fontSize="8.5" fill={VIZ.raw} letterSpacing="0.05em">
            {windowMonths}-MONTH WINDOW
          </text>

          {/* gridlines ---------------------------------------------------- */}
          {model.yTicks.map((t) => (
            <g key={t}>
              <line x1={M.left} y1={model.y(t)} x2={W - M.right} y2={model.y(t)}
                    stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth="1" />
              <text x={M.left - 6} y={model.y(t) + 3.2} textAnchor="end"
                    fontSize="9" fill={VIZ.raw} fontVariant="tabular-nums">
                {t}
              </text>
            </g>
          ))}
          <text x={9} y={M.top + PLOT_H / 2} fontSize="8.5" fill={VIZ.raw}
                textAnchor="middle" letterSpacing="0.05em"
                transform={`rotate(-90 9 ${M.top + PLOT_H / 2})`}>
            DISPLACEMENT (mm)
          </text>

          {/* x labels ----------------------------------------------------- */}
          {model.tickIdx.map((i, k) => (
            <text key={i} x={model.x(i)} y={H - 8} fontSize="9" fill={VIZ.raw}
                  textAnchor={k === 0 ? 'start' : k === model.tickIdx.length - 1 ? 'end' : 'middle'}>
              {shortMonth(model.dates[i])}
            </text>
          ))}

          {/* onset rule --------------------------------------------------- */}
          {onsetIdx != null && (
            <g>
              <line x1={model.x(onsetIdx)} y1={M.top} x2={model.x(onsetIdx)} y2={M.top + PLOT_H}
                    stroke={risk.color} strokeWidth="1.25" strokeDasharray="3 3" opacity="0.75" />
              <text x={model.x(onsetIdx) - 4} y={M.top + PLOT_H - 4} textAnchor="end"
                    fontSize="8.5" fill={risk.color} letterSpacing="0.04em">
                ONSET
              </text>
            </g>
          )}

          {/* raw series --------------------------------------------------- */}
          <path d={model.path(model.raw)} fill="none" stroke={VIZ.raw}
                strokeWidth="1.1" strokeDasharray="2.5 2.5" opacity="0.65" />
          {model.raw.map((v, i) => (
            <circle key={i} cx={model.x(i)} cy={model.y(v)} r="1.5"
                    fill={VIZ.raw} opacity="0.8" />
          ))}

          {/* fitted recent trend ------------------------------------------ */}
          <line x1={model.trend.x1} y1={model.trend.y1} x2={model.trend.x2} y2={model.trend.y2}
                stroke={risk.color} strokeWidth="2" strokeDasharray="5 3"
                strokeLinecap="round" opacity="0.95" />

          {/* corrected series --------------------------------------------- */}
          <path d={model.path(model.corrected)} fill="none" stroke={VIZ.series}
                strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* end-point emphasis, ringed against the surface ---------------- */}
          <circle cx={model.x(model.n - 1)} cy={model.y(model.corrected[model.n - 1])}
                  r="4" fill={VIZ.series} stroke="#0d0d0d" strokeWidth="2" />

          {/* crosshair ---------------------------------------------------- */}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={model.x(hover)} y1={M.top} x2={model.x(hover)} y2={M.top + PLOT_H}
                    stroke={VIZ.raw} strokeWidth="1" opacity="0.5" />
              <circle cx={model.x(hover)} cy={model.y(model.corrected[hover])} r="4.5"
                      fill={VIZ.series} stroke="#0d0d0d" strokeWidth="2" />
            </g>
          )}
        </svg>

        {hover != null && (
          <div
            style={{
              position: 'absolute',
              left: `${(model.x(hover) / W) * 100}%`,
              top: 0,
              transform: `translateX(${hover > model.n * 0.6 ? 'calc(-100% - 10px)' : '10px'})`,
              pointerEvents: 'none',
              background: '#232322',
              border: '1px solid #383835',
              borderRadius: 6,
              padding: '7px 9px',
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: 'nowrap',
              boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{ color: '#898781', marginBottom: 3, letterSpacing: '0.03em' }}>
              {shortMonth(model.dates[hover])}
            </div>
            <div style={{ color: VIZ.series, fontVariantNumeric: 'tabular-nums' }}>
              {model.corrected[hover].toFixed(2)} mm <span style={{ color: '#898781' }}>corrected</span>
            </div>
            <div style={{ color: '#c3c2b7', fontVariantNumeric: 'tabular-nums' }}>
              {model.raw[hover].toFixed(2)} mm <span style={{ color: '#898781' }}>raw</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
