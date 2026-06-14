import type { PdfOcrProgress } from '../types'

export function PdfOcrProgressPanel({ progress }: { progress: PdfOcrProgress | null }) {
  if (!progress) return null
  const pct = progress.totalPages > 0
    ? Math.round((progress.currentPage / progress.totalPages) * 100)
    : 0

  return (
    <section className="ocr-progress" aria-live="polite">
      <div>
        <strong>{progress.message ?? 'Running OCR'}</strong>
        <span>
          {progress.totalPages > 0
            ? `Page ${progress.currentPage} of ${progress.totalPages}`
            : progress.status}
        </span>
      </div>
      <div className="ocr-progress__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </section>
  )
}
