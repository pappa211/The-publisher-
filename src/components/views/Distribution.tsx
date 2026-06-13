import { useMemo, useState } from 'react'
import type { CsvRow, DistributionView } from '../../types'
import { numericColumnValues } from '../../lib/aggregate'
import { buildHistogram, computeNumericStats } from '../../lib/profile'
import { formatInt, formatNumber } from '../../lib/format'
import { Histogram } from '../Histogram'
import { ViewCard, ViewEmpty } from './ViewCard'
import { measureOptions, Select } from './controls'

/** Histogram of a chosen measure, recomputed against the filtered rows. */
export function Distribution({
  view,
  rows,
  measures,
}: {
  view: DistributionView
  rows: CsvRow[]
  measures: string[]
}) {
  const [measure, setMeasure] = useState(view.measure)

  const { bins, stats, count } = useMemo(() => {
    const values = numericColumnValues(rows, measure)
    if (values.length === 0) return { bins: [], stats: null, count: 0 }
    const s = computeNumericStats(values)
    return { bins: buildHistogram(values, s), stats: s, count: values.length }
  }, [rows, measure])

  const controls = (
    <Select label="Measure" value={measure} options={measureOptions(measures, false)} onChange={setMeasure} />
  )

  return (
    <ViewCard title={`Distribution of ${measure}`} description={view.description} controls={controls}>
      {!stats || bins.length === 0 ? (
        <ViewEmpty>No numeric values to chart for the current selection.</ViewEmpty>
      ) : (
        <div className="distribution">
          <Histogram bins={bins} />
          <dl className="distribution__stats">
            <div>
              <dt>min</dt>
              <dd>{formatNumber(stats.min)}</dd>
            </div>
            <div>
              <dt>median</dt>
              <dd>{formatNumber(stats.median)}</dd>
            </div>
            <div>
              <dt>mean</dt>
              <dd>{formatNumber(stats.mean)}</dd>
            </div>
            <div>
              <dt>max</dt>
              <dd>{formatNumber(stats.max)}</dd>
            </div>
            <div>
              <dt>count</dt>
              <dd>{formatInt(count)}</dd>
            </div>
          </dl>
        </div>
      )}
    </ViewCard>
  )
}
