import type { CategoryCount } from '../types'
import { formatInt } from '../lib/format'

/** Horizontal bar list for categorical / most-frequent value breakdowns. */
export function CategoryBars({ data }: { data: CategoryCount[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <ul className="cat-bars">
      {data.map((d) => (
        <li className="cat-bars__row" key={d.value}>
          <span className="cat-bars__label" title={d.value || '(empty)'}>
            {d.value || <em className="muted">(empty)</em>}
          </span>
          <span className="cat-bars__track">
            <span className="cat-bars__fill" style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="cat-bars__count">{formatInt(d.count)}</span>
        </li>
      ))}
    </ul>
  )
}
