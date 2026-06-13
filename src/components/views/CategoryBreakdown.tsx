import { useMemo, useState } from 'react'
import type { Aggregate, CategoryBreakdownView, CsvRow, Filter } from '../../types'
import { groupBreakdown } from '../../lib/aggregate'
import { formatInt, formatNumber } from '../../lib/format'
import { ViewCard, ViewEmpty } from './ViewCard'
import { BarList } from './BarList'
import type { BarItem } from './BarList'
import { AGGREGATE_OPTIONS, COUNT_VALUE, measureOptions, Select, valueToMeasure } from './controls'

/** Compare categories by count or by an aggregated measure; click to filter. */
export function CategoryBreakdown({
  view,
  rows,
  dimensions,
  measures,
  filters,
  onFilter,
}: {
  view: CategoryBreakdownView
  rows: CsvRow[]
  dimensions: string[]
  measures: string[]
  filters: Filter[]
  onFilter: (column: string, value: string) => void
}) {
  const [dimension, setDimension] = useState(view.dimension)
  const [measureValue, setMeasureValue] = useState(view.measure ?? COUNT_VALUE)
  const [aggregate, setAggregate] = useState<Aggregate>(view.aggregate === 'count' ? 'sum' : view.aggregate)

  const measure = valueToMeasure(measureValue)
  const effectiveAgg: Aggregate = measure ? aggregate : 'count'

  const results = useMemo(
    () => groupBreakdown(rows, dimension, measure, effectiveAgg, 10),
    [rows, dimension, measure, effectiveAgg],
  )

  const items: BarItem[] = results.map((r) => ({
    value: r.value,
    amount: r.total,
    sub: measure ? `${formatInt(r.count)} rows` : undefined,
  }))

  const activeValue = filters.find((f) => f.column === dimension)?.value ?? null
  const format = (amount: number) => (measure ? formatNumber(amount) : formatInt(amount))

  const controls = (
    <>
      <Select
        label="Group by"
        value={dimension}
        options={dimensions.map((d) => ({ value: d, label: d }))}
        onChange={setDimension}
      />
      <Select label="Measure" value={measureValue} options={measureOptions(measures, true)} onChange={setMeasureValue} />
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
    <ViewCard
      title={`Breakdown by ${dimension}`}
      description={view.description}
      controls={controls}
      footnote="Tip: click any bar to filter the whole report by that value."
    >
      {results.length === 0 ? (
        <ViewEmpty>Nothing to group for the current selection.</ViewEmpty>
      ) : (
        <BarList items={items} format={format} activeValue={activeValue} onSelect={(value) => onFilter(dimension, value)} />
      )}
    </ViewCard>
  )
}
