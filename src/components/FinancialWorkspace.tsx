import { useCallback, useRef, useState } from 'react'
import type { FinancialDocument } from '../types'
import { buildFinancialDocument } from '../lib/parsePdf'
import {
  applyOcrResults,
  DEFAULT_OCR_PAGE_LIMIT,
  OcrCancelledError,
  runPdfOcr,
  type OcrProgress,
} from '../lib/pdfOcr'
import { PdfExtractionSummary } from './PdfExtractionSummary'
import { PdfOcrPanel, type OcrState } from './PdfOcrProgress'
import { FinancialStatementView } from './FinancialStatementView'
import { ExtractedTableView } from './ExtractedTableView'

interface FinancialWorkspaceProps {
  /** The initial document from the embedded-text parse. */
  document: FinancialDocument
  /** The original file, retained so OCR can re-open and rasterize it. */
  sourceFile: File | null
}

/** Collapsible raw page text — the always-available extraction fallback. */
function RawPageText({ document }: { document: FinancialDocument }) {
  return (
    <details className="raw-pages">
      <summary>Raw extracted text by page ({document.pageCount})</summary>
      <div className="raw-pages__body">
        {document.pages.map((page) => {
          const text = (page.extractionMode === 'ocr' ? page.ocrText : page.embeddedText) ?? ''
          return (
            <section className="raw-page" key={page.pageNumber}>
              <h5>
                Page {page.pageNumber}
                <span className="raw-page__mode">{page.extractionMode.replace('_', ' ')}</span>
                {page.confidence !== undefined && (
                  <span className="raw-page__conf">OCR {Math.round(page.confidence * 100)}%</span>
                )}
              </h5>
              {text.trim() ? (
                <pre>{text}</pre>
              ) : (
                <p className="muted">No text extracted from this page.</p>
              )}
            </section>
          )
        })}
      </div>
    </details>
  )
}

/**
 * The financial-document reader for an uploaded PDF: a document overview, the
 * experimental OCR control, each detected statement, the searchable extracted
 * table, and a raw-text fallback. OCR is owned here so it can re-parse the
 * document in place with live progress and cancellation.
 */
export function FinancialWorkspace({ document: initial, sourceFile }: FinancialWorkspaceProps) {
  const [document, setDocument] = useState<FinancialDocument>(initial)
  const [ocrState, setOcrState] = useState<OcrState>('idle')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocrPageCount, setOcrPageCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const canRun = sourceFile !== null && document.ocrAvailable

  const handleRun = useCallback(async () => {
    if (!sourceFile) return
    const controller = new AbortController()
    abortRef.current = controller
    setOcrState('running')
    setError(null)
    setProgress(null)
    try {
      const results = await runPdfOcr(sourceFile, {
        maxPages: DEFAULT_OCR_PAGE_LIMIT,
        onProgress: setProgress,
        signal: controller.signal,
      })
      const mergedPages = applyOcrResults(document.pages, results)
      setDocument(buildFinancialDocument(document.sourceFile, mergedPages))
      setOcrPageCount(results.length)
      setOcrState('done')
    } catch (err) {
      if (err instanceof OcrCancelledError) {
        setOcrState('cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'OCR failed unexpectedly.')
        setOcrState('error')
      }
    } finally {
      abortRef.current = null
    }
  }, [document.pages, document.sourceFile, sourceFile])

  const handleCancel = useCallback(() => abortRef.current?.abort(), [])

  const statements = document.statements

  return (
    <div className="financial-workspace">
      <PdfExtractionSummary document={document} />

      <PdfOcrPanel
        document={document}
        state={ocrState}
        progress={progress}
        error={error}
        canRun={canRun}
        ocrPageCount={ocrPageCount}
        onRun={handleRun}
        onCancel={handleCancel}
      />

      {statements.length > 0 ? (
        <div className="statement-list">
          {statements.map((statement, index) => (
            <FinancialStatementView key={`${statement.title}-${index}`} statement={statement} />
          ))}
        </div>
      ) : (
        <section className="view-card">
          <div className="view-card__body">
            <div className="view-empty">
              No financial statements were confidently detected yet.
              {document.ocrRecommended ? ' Try the experimental OCR fallback above.' : ''} The raw extracted
              text for each page is available below.
            </div>
          </div>
        </section>
      )}

      <ExtractedTableView document={document} />

      <RawPageText document={document} />
    </div>
  )
}
