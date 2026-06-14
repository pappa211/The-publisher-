import type { FinancialDocument } from '../types'
import { formatInt, formatPercent } from '../lib/format'
import { DEFAULT_OCR_PAGE_LIMIT } from '../lib/pdfOcr'

interface FinancialDocumentOverviewProps {
  document: FinancialDocument
  onRunOcr?: () => void
  ocrBusy?: boolean
}

function extractionLabel(mode: string): string {
  return mode.replace(/_/g, ' ')
}

export function FinancialDocumentOverview({
  document,
  onRunOcr,
  ocrBusy = false,
}: FinancialDocumentOverviewProps) {
  const statementCount = document.statements.filter((statement) => statement.rows.length > 0).length
  const warningCount = document.warnings.length + document.statements.reduce((sum, statement) => sum + statement.warnings.length, 0)

  return (
    <section className="financial-overview" aria-label="Financial document overview">
      <div className="financial-overview__heading">
        <div>
          <h1>{document.sourceFile}</h1>
          <p>
            {document.sourceType.toUpperCase()} · {extractionLabel(document.extractionMode)} · local browser processing
          </p>
        </div>
        <div className="financial-confidence">
          <span>Confidence</span>
          <strong>{formatPercent(document.confidence * 100)}</strong>
        </div>
      </div>

      <div className="financial-overview__grid">
        <div>
          <span>Pages</span>
          <strong>{document.pageCount == null ? '—' : formatInt(document.pageCount)}</strong>
        </div>
        <div>
          <span>Periods</span>
          <strong>{document.detectedPeriods.map((period) => period.label).join(', ') || 'Not detected'}</strong>
        </div>
        <div>
          <span>Currency / scale</span>
          <strong>{document.currency ?? 'Unknown'} · {document.scale}</strong>
        </div>
        <div>
          <span>Statements</span>
          <strong>{formatInt(statementCount)}</strong>
        </div>
        <div>
          <span>Line items</span>
          <strong>{formatInt(document.statements.reduce((sum, statement) => sum + statement.rows.length, 0))}</strong>
        </div>
        <div>
          <span>Warnings</span>
          <strong>{formatInt(warningCount)}</strong>
        </div>
      </div>

      {document.ocrAvailable && onRunOcr && (
        <div className="ocr-callout">
          <div>
            <strong>OCR may improve this PDF extraction.</strong>
            <p>
              {document.ocrReason ?? 'Embedded text looks weak or incomplete.'} Local OCR will process the
              full document, capped at {formatInt(DEFAULT_OCR_PAGE_LIMIT)} pages.
            </p>
          </div>
          <button type="button" className="btn" onClick={onRunOcr} disabled={ocrBusy}>
            {ocrBusy ? 'Running OCR…' : 'Run local OCR'}
          </button>
        </div>
      )}

      {document.warnings.length > 0 && (
        <ul className="financial-warnings">
          {document.warnings.slice(0, 5).map((item, index) => (
            <li key={index} className={`financial-warning financial-warning--${item.severity}`}>
              {item.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
