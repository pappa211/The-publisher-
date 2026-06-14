import type { FinancialDocument } from '../types'
import type { OcrProgress } from '../lib/pdfOcr'
import { DEFAULT_OCR_PAGE_LIMIT } from '../lib/pdfOcr'

export type OcrState = 'idle' | 'running' | 'done' | 'cancelled' | 'error'

interface PdfOcrPanelProps {
  document: FinancialDocument
  state: OcrState
  progress: OcrProgress | null
  error: string | null
  canRun: boolean
  ocrPageCount: number
  onRun: () => void
  onCancel: () => void
}

function ExperimentalTag() {
  return <span className="ocr-tag">Experimental</span>
}

/**
 * The experimental-OCR control surface: an opt-in call to action for scanned
 * PDFs, a live progress bar with cancel while running, and a clear result note.
 * OCR runs entirely in the browser (WebAssembly); it never uploads the file.
 */
export function PdfOcrPanel({
  document,
  state,
  progress,
  error,
  canRun,
  ocrPageCount,
  onRun,
  onCancel,
}: PdfOcrPanelProps) {
  // Nothing to offer: text PDF that was never OCR'd and needs no OCR.
  if (state === 'idle' && !document.ocrRecommended) return null

  if (state === 'running') {
    const pct = progress ? Math.round(progress.overall * 100) : 0
    return (
      <section className="ocr-panel ocr-panel--running" aria-live="polite">
        <div className="ocr-panel__head">
          <h4>
            Running browser OCR <ExperimentalTag />
          </h4>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="ocr-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="ocr-bar__fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted">
          {progress && progress.page > 0
            ? `Page ${progress.page} · ${progress.pageIndex + 1} of ${progress.totalPages} — ${
                progress.phase === 'render' ? 'rendering' : 'recognizing text'
              } (${pct}%)`
            : 'Loading the OCR engine and language model…'}
        </p>
      </section>
    )
  }

  if (state === 'done') {
    return (
      <section className="ocr-panel ocr-panel--done">
        <p>
          <strong>OCR complete.</strong> Experimental text recognition ran on up to {ocrPageCount} page
          {ocrPageCount === 1 ? '' : 's'}; results were re-parsed below. Treat recognized numbers with care.
        </p>
      </section>
    )
  }

  if (state === 'cancelled' || state === 'error') {
    return (
      <section className={`ocr-panel ocr-panel--${state}`}>
        <p>
          {state === 'cancelled' ? (
            <strong>OCR cancelled.</strong>
          ) : (
            <>
              <strong>OCR could not finish.</strong> {error}
            </>
          )}{' '}
          Whatever could be extracted is still shown below.
        </p>
        {canRun && (
          <button type="button" className="btn btn--soft" onClick={onRun}>
            Try OCR again
          </button>
        )}
      </section>
    )
  }

  // Idle + OCR recommended → the opt-in call to action.
  return (
    <section className="ocr-panel ocr-panel--offer">
      <div>
        <h4>
          This PDF appears to be scanned or image-based <ExperimentalTag />
        </h4>
        <p className="muted">
          Little or no embedded text was found on {document.pagesNeedingOcr} page
          {document.pagesNeedingOcr === 1 ? '' : 's'}. You can run experimental browser OCR to try to read it.
          The first run downloads the OCR engine (≈ a few MB) and processes up to the first{' '}
          {DEFAULT_OCR_PAGE_LIMIT} pages locally — your file is never uploaded.
        </p>
      </div>
      <button type="button" className="btn" onClick={onRun} disabled={!canRun}>
        Run experimental OCR
      </button>
      {!canRun && <p className="muted">OCR is unavailable for this source.</p>}
    </section>
  )
}
