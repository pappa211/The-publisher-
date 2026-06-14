/** The product brand mark — a small page-with-bars glyph. */
function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
      <defs>
        <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#brandGrad)" />
      <rect x="9" y="6.5" width="14" height="19" rx="2.5" fill="#ffffff" opacity="0.96" />
      <rect x="11.75" y="18" width="2.5" height="4" rx="1" fill="#6366f1" />
      <rect x="14.75" y="14.5" width="2.5" height="7.5" rx="1" fill="#8b5cf6" />
      <rect x="17.75" y="11" width="2.5" height="11" rx="1" fill="#a78bfa" />
    </svg>
  )
}

/** Top app bar with brand identity and a "new file" action when data is loaded. */
export function Header({ hasData, onReset }: { hasData: boolean; onReset: () => void }) {
  return (
    <header className="app-header">
      <div className="brand">
        <BrandMark />
        <div className="brand__text">
          <span className="brand__name">The Publisher</span>
          <span className="brand__tag">Data → living document</span>
        </div>
      </div>
      {hasData && (
        <button className="btn btn--ghost" onClick={onReset}>
          <span aria-hidden="true">↺</span> New file
        </button>
      )}
    </header>
  )
}
