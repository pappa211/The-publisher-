import { useMemo } from 'react'
import type { CsvRow, KeyMeasuresView } from '../../types'
import { measureSummary } from '../../lib/aggregate'
import { formatInt, formatNumber } from '../../lib/format'
import { ViewCard, ViewEmpty } from './ViewCard'

/** Filter-aware totals/averages for each numeric measure. */
export function KeyMeasures({ view, rows }: { view: KeyMeasuresView; rows: CsvRow[] }) {
  const summaries = useMemo(
    () => view.measures.map((name) => ({ name, ...measureSummary(rows, name) })),
    [view.measures, rows],
  )

  return (
    <ViewCard title={view.title} description={view.description}>
      {summaries.length === 0 ? (
        <ViewEmpty>No numeric measures to summarise.</ViewEmpty>
      ) : (
        <div className="key-measures">
          {summaries.map((s) => (
            <div className="measure-tile" key={s.name}>
              <span className="measure-tile__name" title={s.name}>
                {s.name}
              </span>
              <span className="measure-tile__sum" title="Sum">
                {formatNumber(s.sum)}
              </span>
              <span className="measure-tile__caption">total · {formatInt(s.count)} values</span>
              <dl className="measure-tile__stats">
                <div>
                  <dt>avg</dt>
                  <dd>{formatNumber(s.mean)}</dd>
                </div>
                <div>
                  <dt>min</dt>
                  <dd>{formatNumber(s.min)}</dd>
                </div>
                <div>
                  <dt>max</dt>
                  <dd>{formatNumber(s.max)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </ViewCard>
  )
}
