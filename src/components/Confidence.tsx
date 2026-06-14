import { formatPercent } from '../lib/format'

export type ConfidenceTone = 'high' | 'medium' | 'low'

/** Bucket a 0–1 confidence into a coarse, honestly-labelled tone. */
export function confidenceTone(value: number): ConfidenceTone {
  if (value >= 0.75) return 'high'
  if (value >= 0.5) return 'medium'
  return 'low'
}

const TONE_LABEL: Record<ConfidenceTone, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** A compact confidence pill used in financial tables and statement headers. */
export function ConfidenceBadge({ value, showPercent = false }: { value: number; showPercent?: boolean }) {
  const tone = confidenceTone(value)
  return (
    <span
      className={`confidence confidence--${tone}`}
      title={`Heuristic confidence: ${formatPercent(value * 100)}`}
    >
      <span className="confidence__dot" aria-hidden="true" />
      {showPercent ? formatPercent(value * 100) : TONE_LABEL[tone]}
    </span>
  )
}
