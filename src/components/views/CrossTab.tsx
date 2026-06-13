import { useMemo, useState } from 'react'
import type { Aggregate, CrossTabView, CsvRow } from '../../types'
import { crossTabulate } from '../../lib/aggregate'
import { formatInt, formatNumber } from '../../lib/format'
import { ViewCard, ViewEmpty } from './ViewCard'
import { AGGREGATE_OPTIONS, COUNT_VALUE, measureOptions, Select, valueToMeasure } from './controls'

/** A pivot of two dimensions rendered as a heat-table; click a cell to filter. */
export function CrossTab({
  view,
  rows,
  dimensions,
  measures,
  onFilter,
}: {
  view: CrossTabView
  rows: CsvRow[]
  dimensions: string[]
  measures: string[]
  onFilter: (column: string, value: string) => void
}) {
  const [rowDim, setRowDim] = useState(view.rowDimension)
  const [colDim, setColDim] = useState(view.colDimension)
  const [measureValue, setMeasureValue] = useState(view.measure ?? COUNT_VALUE)
  const [aggregate, setAggregate] = useState<Aggregate>(view.aggregate === 'count' ? 'sum' : view.aggregate)

  const measure = valueToMeasure(measureValue)
  const effectiveAgg: Aggregate = measure ? aggregate : 'count'

  const table = useMemo(
    () => crossTabulate(rows, rowDim, colDim, measure, effectiveAgg, 6),
    [rows, rowDim, colDim, measure, effectiveAgg],
  )

  const format = (v: number) => (measure ? formatNumber(v) : formatInt(v))

  const controls = (
    <>
      <Select label="Rows" value={rowDim} options={dimensions.map((d) => ({ value: d, label: d }))} onChange={setRowDim} />
      <Select label="Columns" value={colDim} options={dimensions.map((d) => ({ value: d, label: d }))} onChange={setColDim} />
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

  const truncationNote =
    table.truncatedRows > 0 || table.truncatedCols > 0
      ? `Showing the top 6 of each axis — ${table.truncatedRows} more “${rowDim}” and ${table.truncatedCols} more “${colDim}” values are hidden.`
      : 'Tip: click a cell to filter the report to that combination.'

  return (
    <ViewCard title={`${rowDim} × ${colDim}`} description={view.description} controls={controls} footnote={truncationNote}>
      {table.rowKeys.length === 0 || table.colKeys.length === 0 ? (
        <ViewEmpty>Not enough categories to build a pivot for the current selection.</ViewEmpty>
      ) : (
        <div className="crosstab__scroll">
          <table className="crosstab">
            <thead>
              <tr>
                <th className="crosstab__corner" scope="col">
                  {rowDim} \ {colDim}
                </th>
                {table.colKeys.map((c) => (
                  <th key={c} scope="col" title={c}>
                    {c || '(empty)'}
                  </th>
                ))}
                <th className="crosstab__total" scope="col">
                  Σ
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rowKeys.map((rk, ri) => (
                <tr key={rk}>
                  <th scope="row" title={rk}>
                    {rk || '(empty)'}
                  </th>
                  {table.colKeys.map((ck, ci) => {
                    const v = table.matrix[ri][ci]
                    const alpha = table.max > 0 && v > 0 ? 0.08 + 0.82 * (v / table.max) : 0
                    return (
                      <td key={ck} className="crosstab__cell" style={{ background: `rgba(99, 102, 241, ${alpha})` }}>
                        <button
                          type="button"
                          className="crosstab__cellbtn"
                          onClick={() => {
                            onFilter(rowDim, rk)
                            onFilter(colDim, ck)
                          }}
                          title={`${rk} · ${ck}: ${format(v)} — click to filter`}
                        >
                          {v === 0 ? <span className="crosstab__zero">·</span> : format(v)}
                        </button>
                      </td>
                    )
                  })}
                  <td className="crosstab__total">{format(table.rowTotals[ri])}</td>
                </tr>
              ))}
              <tr className="crosstab__totals">
                <th scope="row">Σ</th>
                {table.colTotals.map((t, ci) => (
                  <td key={table.colKeys[ci]}>{format(t)}</td>
                ))}
                <td className="crosstab__total">{format(table.rowTotals.reduce((a, b) => a + b, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </ViewCard>
  )
}
