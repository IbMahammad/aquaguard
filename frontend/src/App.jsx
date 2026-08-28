import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header.jsx'
import NetworkMap from './components/NetworkMap.jsx'
import SidePanel from './components/SidePanel.jsx'
import MethodologyModal from './components/MethodologyModal.jsx'
import { RISK, summarise } from './config.js'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('current')          // 'current' | 'historic'
  const [selectedId, setSelectedId] = useState(null)
  const [methodOpen, setMethodOpen] = useState(false)

  useEffect(() => {
    fetch('/aquaguard.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  // Flagged segments, worst first. One ordering shared by the map markers and
  // the triage queue, so "number 3 on the map" is "number 3 in the list".
  const ranked = useMemo(() => {
    if (!data) return []
    const analysisOf = (s) => (view === 'historic' ? s.historic : s.current)
    return data.segments
      .filter((s) => analysisOf(s).risk !== 'Low')
      .sort((a, b) => {
        const ra = RISK[analysisOf(a).risk].order - RISK[analysisOf(b).risk].order
        return ra !== 0 ? ra : analysisOf(a).z_score - analysisOf(b).z_score
      })
  }, [data, view])

  const summary = useMemo(
    () => (data ? summarise(data.segments, view) : null), [data, view])
  const baseline = useMemo(
    () => (data ? summarise(data.segments, 'historic') : null), [data])

  // Switching epoch can leave a selection that is no longer flagged; keeping it
  // is fine (you can inspect any segment), but drop it if it vanished entirely.
  useEffect(() => {
    if (selectedId && data && !data.segments.some((s) => s.id === selectedId)) {
      setSelectedId(null)
    }
  }, [data, selectedId])

  if (error) {
    return (
      <div className="loading">
        Could not load <span className="mono">/aquaguard.json</span> — {error}
        <br />Run <span className="mono">python data/detect.py</span> to regenerate it.
      </div>
    )
  }
  if (!data) return <div className="loading">Loading network…</div>

  return (
    <div className="app">
      <Header
        data={data}
        summary={summary}
        baseline={baseline}
        view={view}
        setView={setView}
        onMethodology={() => setMethodOpen(true)}
      />

      <div className="workspace">
        <div className="map-wrap">
          <NetworkMap
            data={data}
            view={view}
            ranked={ranked}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <div className="map-overlay map-stamp">
            Sentinel-1 InSAR · epoch{' '}
            <b>{view === 'historic' ? data.views.historic.as_of : data.views.current.as_of}</b>
            {view === 'historic' && (
              <span style={{ color: 'var(--risk-medium)' }}> · historical replay</span>
            )}
          </div>

          <Legend data={data} view={view} summary={summary} />
        </div>

        <SidePanel
          data={data}
          view={view}
          ranked={ranked}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {methodOpen && (
        <MethodologyModal data={data} summary={summary}
                          onClose={() => setMethodOpen(false)} />
      )}
    </div>
  )
}

function Legend({ data, view, summary }) {
  const stable = summary.segmentCount - summary.highCount - summary.mediumCount
  const rows = [
    { risk: 'High', text: 'High risk — dispatch', n: summary.highCount },
    { risk: 'Medium', text: 'Medium — monitor', n: summary.mediumCount },
    { risk: 'Low', text: 'Stable', n: stable },
  ]
  return (
    <div className="map-overlay legend">
      <div className="legend-title">Segment risk</div>
      {rows.map((r) => (
        <div className="legend-row" key={r.risk}>
          <span className="legend-swatch"
                style={{ background: RISK[r.risk].color, height: RISK[r.risk].weight }} />
          {r.text}
          <span className="legend-count">{r.n}</span>
        </div>
      ))}
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)',
        fontSize: 10.5, color: 'var(--ink-3)', maxWidth: 190, lineHeight: 1.45,
      }}>
        Line weight also encodes risk — colour is never the only channel.
      </div>
    </div>
  )
}
