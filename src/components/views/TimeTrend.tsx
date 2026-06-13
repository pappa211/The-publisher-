import { useMemo, useState } from 'react'
import type { Aggregate, CsvRow, TimeTrendView } from '../../types'
import { timeSeries } from '../../lib/aggregate'
import type { TimePoint } from '../../lib/aggregate'
import { formatNumber } from '../../lib/format'
import { ViewCard, ViewEmpty } from './ViewCard'
import { AGGREGATE_OPTIONS, COUNT_VALUE, measureOptions, Select, valueToMeasure } from './controls'

const W = 640
const H = 200
const PAD = { top: 14, right: 14, bottom: 26, left: 14 }

/** SVG area+line chart for an ordered time series. Pure CSS/SVG, no deps. */
function LineChart({ points }: { points: TimePoint[] }) {
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const values = points.map((p) => p.value)
  const maxV = Math.max(...values, 0)
  const minV = Math.min(...values, 0)
  const range = maxV - minV || 1

  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH
  const baseline = y(Math.max(0, minV))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${baseline.toFixed(1)} L ${x(0).toFixed(1)} ${baseline.toFixed(1)} Z`

  return (
    <svg className="linechart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend over time">
      {minV < 0 && <line className="linechart__zero" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />}
      <path className="linechart__area" d={areaPath} />
      <path className="linechart__line" d={linePath} />
      {points.map((p, i) => (
        <circle key={p.label} className="linechart__dot" cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 0 : 3}>
          <title>{`${p.label}: ${formatNumber(p.value)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

/** Interactive trend-over-time view: choose the measure and aggregation. */
export function TimeTrend({
  view,
  rows,
  measures,
}: {
  view: TimeTrendView
  rows: CsvRow[]
  measures: string[]
}) {
  const [measureValue, setMeasureValue] = useState(view.measure ?? COUNT_VALUE)
  const [aggregate, setAggregate] = useState<Aggregate>(view.aggregate === 'count' ? 'sum' : view.aggregate)

  const measure = valueToMeasure(measureValue)
  const effectiveAgg: Aggregate = measure ? aggregate : 'count'

  const points = useMemo(
    () => timeSeries(rows, view.timeColumn, measure, effectiveAgg),
    [rows, view.timeColumn, measure, effectiveAgg],
  )

  const peak = points.reduce((m, p) => (p.value > m ? p.value : m), -Infinity)
  const trough = points.reduce((m, p) => (p.value < m ? p.value : m), Infinity)

  const controls = (
    <>
      <Select
        label="Measure"
        value={measureValue}
        options={measureOptions(measures, true)}
        onChange={setMeasureValue}
      />
      {measure && (
        <Select
          label="Aggregate"
          value={aggregate}
          options={AGGREGATE_OPTIONS}
          onChange={(v) => setAggregate(v === 'mean' ? 'mean' : 'sum')}
        />
      )}
    </>
  )

  return (
    <ViewCard title={view.title} description={view.description} controls={controls}>
      {points.length === 0 ? (
        <ViewEmpty>No dated rows to plot for the current selection.</ViewEmpty>
      ) : (
        <div className="trend">
          <LineChart points={points} />
          <div className="trend__axis">
            <span>{points[0].label}</span>
            <span className="trend__peak">
              {Number.isFinite(peak) ? `peak ${formatNumber(peak)}` : ''}
              {trough < 0 ? ` · low ${formatNumber(trough)}` : ''}
            </span>
            <span>{points[points.length - 1].label}</span>
          </div>
        </div>
      )}
    </ViewCard>
  )
}
