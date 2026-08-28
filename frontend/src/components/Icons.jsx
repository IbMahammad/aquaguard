/* Small inline icon set. Status colours never travel alone - each risk badge
   pairs its colour with one of these glyphs plus a text label. */

export const IconHigh = (p) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M8 1.6 15 14H1L8 1.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8 6v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="8" cy="11.7" r="0.95" fill="currentColor" />
  </svg>
)

export const IconMedium = (p) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 4.6V8.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="8" cy="11" r="0.95" fill="currentColor" />
  </svg>
)

export const IconLow = (p) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.2 8.2 7.2 10.2 10.9 6.2" stroke="currentColor" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconSatellite = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <path d="M7.5 3.5 10 6l-4 4-2.5-2.5a1.4 1.4 0 0 1 0-2l2-2a1.4 1.4 0 0 1 2 0Z"
          stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M14 10.5 16.5 13l-2 2a1.4 1.4 0 0 1-2 0L10 12.5l4-2Z"
          stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m9.5 5.5 9 9M13 21a8 8 0 0 0-8-8" stroke="#fff" strokeWidth="1.5"
          strokeLinecap="round" />
    <path d="M9 21a4 4 0 0 0-4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const IconInfo = (p) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 7.3v3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="5.1" r="0.95" fill="currentColor" />
  </svg>
)

export const IconBack = (p) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...p}>
    <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const RiskIcon = ({ risk, ...p }) =>
  risk === 'High' ? <IconHigh {...p} />
  : risk === 'Medium' ? <IconMedium {...p} />
  : <IconLow {...p} />
