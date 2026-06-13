import { useMemo } from 'react'
import type { CompletenessView, CsvRow } from '../../types'
import { isMissing } from '../../lib/inferTypes'
import { formatInt, formatPercent } from '../../lib/format'
import { ViewCard, ViewEmpty } from './ViewCard'

/** Per-column completeness for the current (filtered) selection. */
export function CompletenessMap({
  view,
  rows,
  columns,
}: {
  view: CompletenessView
  rows: CsvRow[]
  columns: string[]
}) {
  const stats = useMemo(() => {
    const total = rows.length
    return columns.map((name) => {
      let missing = 0
      for (const row of rows) if (isMissing(row[name])) missing += 1
      const filled = total - missing
      return { name, missing, filled, pct: total === 0 ? 100 : (filled / total) * 100 }
    })
  }, [rows, columns])

  return (
    <ViewCard title={view.title} description={view.description}>
      {rows.length === 0 ? (
        <ViewEmpty>No rows in the current selection.</ViewEmpty>
      ) : (
        <ul className="completeness">
          {stats.map((s) => (
            <li className="completeness__row" key={s.name}>
              <span className="completeness__name" title={s.name}>
                {s.name}
              </span>
              <span className="completeness__track">
                <span
                  className="completeness__fill"
                  style={{ width: `${s.pct}%` }}
                  data-low={s.pct < 75 ? 'true' : undefined}
                  data-empty={s.pct === 0 ? 'true' : undefined}
                />
              </span>
              <span className="completeness__pct">{formatPercent(s.pct)}</span>
              <span className="completeness__missing muted">
                {s.missing > 0 ? `${formatInt(s.missing)} missing` : 'complete'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ViewCard>
  )
}
