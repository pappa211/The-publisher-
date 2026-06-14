import type { ExtractionMode, FinancialDocument } from '../types'
import { formatInt } from '../lib/format'
import { ViewCard } from './views/ViewCard'

const MODE_LABEL: Record<ExtractionMode, string> = {
  embedded_text: 'Embedded text',
  ocr: 'OCR (experimental)',
  mixed: 'Mixed · text + OCR',
  none: 'No text found',
}

/** The document overview: source, page accounting, extraction mode and warnings. */
export function PdfExtractionSummary({ document }: { document: FinancialDocument }) {
  const statementCount = document.statements.filter((s) => s.kind !== 'unknown').length

  const kpis: { label: string; value: string; title?: string }[] = [
    { label: 'File type', value: document.sourceType.toUpperCase() },
    { label: 'Pages', value: formatInt(document.pageCount) },
    { label: 'Extraction', value: MODE_LABEL[document.extractionMode] },
    { label: 'Pages with text', value: formatInt(document.pagesWithText) },
    { label: 'Pages needing OCR', value: formatInt(document.pagesNeedingOcr) },
    { label: 'Statements', value: formatInt(statementCount) },
    { label: 'Line items', value: formatInt(document.extractedRows.length) },
    {
      label: 'Currency / unit',
      value: document.unit ?? document.currency ?? 'Unknown',
      title: document.unit ?? document.currency,
    },
  ]

  return (
    <ViewCard
      title="Document overview"
      description="What the browser pulled out of this PDF, page by page. All processing is local — nothing is uploaded."
    >
      <div className="finance-panel">
        <div className="finance-kpis" aria-label="PDF extraction summary">
          {kpis.map((kpi) => (
            <div className="finance-kpi" key={kpi.label}>
              <span className="finance-kpi__label">{kpi.label}</span>
              <strong title={kpi.title ?? kpi.value}>{kpi.value}</strong>
            </div>
          ))}
        </div>

        <p className="pdf-source muted">
          Source file: <strong>{document.sourceFile}</strong>
          {document.periods.length > 0 && (
            <>
              {' · '}Periods detected: <strong>{document.periods.slice(0, 6).join(', ')}</strong>
              {document.periods.length > 6 ? ` +${document.periods.length - 6} more` : ''}
            </>
          )}
        </p>

        {document.warnings.length > 0 && (
          <section className="pdf-warnings" aria-label="Extraction warnings">
            <h4>Heads up — extraction is heuristic</h4>
            <ul>
              {document.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ViewCard>
  )
}
