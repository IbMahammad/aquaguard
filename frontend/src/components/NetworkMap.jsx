import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { RISK } from '../config.js'

/**
 * Leaflet map of the distribution network, coloured by risk.
 *
 * Risk is encoded on THREE redundant channels, not colour alone:
 *   1. stroke colour   (status palette)
 *   2. stroke weight   (High 5.5px -> Stable 1.8px)
 *   3. a numbered marker on every flagged segment, matching the triage queue
 *
 * Under deuteranopia the High red and Stable green sit only ~4 dE apart, so
 * colour on its own would be unreadable for roughly 1 in 12 men. Weight and
 * the numbered markers carry the meaning regardless.
 *
 * Plain Leaflet via a ref rather than react-leaflet: no React-version
 * coupling, and one less thing that can break before a demo.
 */

// Esri World Dark Gray Canvas: genuinely key-free, dark, and cartographically
// restrained so the pipe network stays the loudest thing on screen.
//
// NOTE: CARTO's dark_all basemap now stamps "API KEY REQUIRED" across every
// tile for unauthenticated use - do not switch back to it without a key.
//
// If the venue has no network the tiles simply do not load and the pipes render
// on the dark canvas beneath, which still reads correctly.
const TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/' +
  'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const ATTRIB =
  'Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ' +
  '<b>pipe network &amp; displacement data synthetic</b>'

export default function NetworkMap({ data, view, selectedId, onSelect, ranked }) {
  const nodeRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef({ lines: new Map(), markers: [] })
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ---- create the map once ------------------------------------------------
  useEffect(() => {
    const map = L.map(nodeRef.current, {
      center: [data.meta.origin.lat, data.meta.origin.lng],
      zoom: 14,
      // Top-right keeps the control clear of the epoch stamp and the legend.
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false,
    })
    L.control.zoom({ position: 'topright' }).addTo(map)
    L.tileLayer(TILES, { attribution: ATTRIB, maxZoom: 19 }).addTo(map)
    mapRef.current = map

    // Frame the whole network rather than trusting a hard-coded zoom.
    // animate:false is deliberate - an in-flight zoom transition that outlives
    // the map (React StrictMode mounts, unmounts and remounts) lands in
    // Leaflet's _onZoomTransitionEnd with a destroyed pane.
    const bounds = L.latLngBounds(
      data.segments.flatMap((s) => s.coords.map(([lng, lat]) => [lat, lng]))
    )
    map.fitBounds(bounds, { padding: [46, 46], animate: false })

    return () => {
      map.stop()          // cancel any pan/zoom still running
      map.remove()
      mapRef.current = null
    }
  }, [data])

  // ---- draw / redraw the network on view change ---------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // `lines` holds {line, hit, ...} wrappers - both layers must come off.
    layersRef.current.lines.forEach(({ line, hit }) => { line.remove(); hit.remove() })
    layersRef.current.markers.forEach((m) => m.remove())
    layersRef.current = { lines: new Map(), markers: [] }

    const analysisOf = (s) => (view === 'historic' ? s.historic : s.current)

    // Draw stable pipes first so flagged segments always sit on top.
    const ordered = [...data.segments].sort(
      (a, b) => RISK[analysisOf(b).risk].order - RISK[analysisOf(a).risk].order
    )

    ordered.forEach((seg) => {
      const risk = analysisOf(seg).risk
      const style = RISK[risk]
      const latlngs = seg.coords.map(([lng, lat]) => [lat, lng])

      // A wide transparent line under each pipe makes thin "stable" segments
      // clickable without making them visually heavy.
      const hit = L.polyline(latlngs, {
        color: '#000', opacity: 0, weight: 16, interactive: true,
      }).addTo(map)

      const line = L.polyline(latlngs, {
        color: style.color,
        weight: style.weight,
        opacity: risk === 'Low' ? 0.75 : 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map)

      hit.on('click', () => onSelectRef.current(seg.id))
      hit.on('mouseover', () => {
        line.setStyle({ weight: style.weight + 3, opacity: 1 })
        map.getContainer().style.cursor = 'pointer'
      })
      hit.on('mouseout', () => {
        line.setStyle({ weight: style.weight, opacity: risk === 'Low' ? 0.75 : 0.95 })
        map.getContainer().style.cursor = ''
      })
      hit.bindTooltip(
        `<b>${seg.id}</b><br>${seg.street} · DN${seg.diameter_mm}<br>` +
        `${risk === 'Low' ? 'Stable' : risk + ' risk'} · ` +
        `${analysisOf(seg).recent_velocity_mm_per_month.toFixed(2)} mm/mo`,
        { direction: 'top', opacity: 1, className: 'pipe-tip' }
      )

      layersRef.current.lines.set(seg.id, { line, hit, style, risk })
    })

    // Numbered markers, ranked identically to the triage queue.
    ranked.forEach((seg, i) => {
      const risk = analysisOf(seg).risk
      const cls = risk === 'High' ? 'high' : 'medium'
      const marker = L.marker([seg.centroid[1], seg.centroid[0]], {
        icon: L.divIcon({
          className: '',
          html:
            `<div style="position:relative">` +
            (risk === 'High' ? '<div class="pulse"></div>' : '') +
            `<div class="leak-marker ${cls}">${i + 1}</div></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: risk === 'High' ? 1000 : 500,
      }).addTo(map)
      marker.on('click', () => onSelectRef.current(seg.id))
      layersRef.current.markers.push(marker)
    })
  }, [data, view, ranked])

  // ---- highlight the selected segment -------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.lines.forEach(({ line, style, risk }, id) => {
      const on = id === selectedId
      line.setStyle({
        weight: on ? style.weight + 4 : style.weight,
        opacity: on ? 1 : risk === 'Low' ? 0.75 : 0.95,
      })
      if (on) line.bringToFront()
    })
    if (selectedId) {
      const seg = data.segments.find((s) => s.id === selectedId)
      if (seg) {
        map.panTo([seg.centroid[1], seg.centroid[0]], { animate: true, duration: 0.45 })
      }
    }
  }, [selectedId, data, view])

  return <div className="map" ref={nodeRef} />
}
