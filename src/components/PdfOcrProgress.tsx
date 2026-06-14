import type { PdfOcrProgress as PdfOcrProgressType } from '../types'

export function PdfOcrProgress({ progress }: { progress: PdfOcrProgressType | null }) {
  if (!progress) return null
  const pct = progress.totalPages === 0 ? 0 : Math.round((progress.currentPage / progress.totalPages) * 100)

  return (
    <div className="ocr-progress" role="status" aria-live="polite">
      <div className="ocr-progress__top">
        <strong>{progress.message ?? 'Running OCR'}</strong>
        <span>{pct}%</span>
      </div>
      <div className="ocr-progress__bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p>
        Page {progress.currentPage} of {progress.totalPages} · {progress.status.replace('_', ' ')}
      </p>
    </div>
  )
}

