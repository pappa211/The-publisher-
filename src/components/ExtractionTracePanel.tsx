import { useMemo, useState } from 'react'
import type { FinancialDocument } from '../types'
import { formatPercent } from '../lib/format'

export function ExtractionTracePanel({ document }: { document: FinancialDocument }) {
  const [showParsed, setShowParsed] = useState(false)
  const lines = useMemo(() => (
    document.rawLines.filter((line) => showParsed || !line.parsed).slice(0, 250)
  ), [document.rawLines, showParsed])

  return (
    <section className="financial-section extraction-trace" aria-label="Extraction diagnostics">
      <div className="financial-section__header">
        <h2>Extraction Trace</h2>
        <p>Raw text and unparsed lines retained for review.</p>
      </div>

      <div className="trace-toolbar">
        <label>
          <input
            type="checkbox"
            checked={showParsed}
            onChange={(event) => setShowParsed(event.target.checked)}
          />
          Include parsed lines
        </label>
        <span>{lines.length} lines shown</span>
      </div>

      {document.pages.length > 0 && (
        <div className="page-quality-strip">
          {document.pages.map((page) => (
            <div key={page.pageNumber} title={page.warnings.map((item) => item.message).join('; ')}>
              <span>Page {page.pageNumber}</span>
              <strong>{formatPercent(page.quality * 100)}</strong>
              <small>{page.extractionMode.replace(/_/g, ' ')}</small>
            </div>
          ))}
        </div>
      )}

      <div className="trace-lines">
        {lines.map((line) => (
          <details key={line.id} className={`trace-line${line.parsed ? ' trace-line--parsed' : ''}`}>
            <summary>
              <span>{line.sourcePage ? `Page ${line.sourcePage}` : 'Table row'}</span>
              <strong>{line.statementKind.replace(/_/g, ' ')}</strong>
              <small>{formatPercent(line.confidence * 100)}</small>
            </summary>
            <p>{line.text}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

