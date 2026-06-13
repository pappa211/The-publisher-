import type { HistogramBin } from '../types'
import { formatInt } from '../lib/format'

/** Vertical-bar histogram for numeric distributions, built with plain CSS. */
export function Histogram({ bins }: { bins: HistogramBin[] }) {
  const max = Math.max(...bins.map((b) => b.count), 1)
  const first = bins[0]
  const last = bins[bins.length - 1]

  return (
    <div className="histogram">
      <div className="histogram__bars" role="img" aria-label="Value distribution">
        {bins.map((bin, i) => (
          <div
            className="histogram__col"
            key={i}
            title={`${bin.label}: ${formatInt(bin.count)}`}
          >
            <div
              className="histogram__bar"
              style={{ height: `${Math.max((bin.count / max) * 100, bin.count > 0 ? 4 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="histogram__axis">
        <span>{first?.label.split(' – ')[0]}</span>
        <span>{last?.label.split(' – ')[1]}</span>
      </div>
    </div>
  )
}
