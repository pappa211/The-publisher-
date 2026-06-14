import { useState } from 'react'
import type { FinancialLineItem, FinancialStatement } from '../types'
import { formatNumber } from '../lib/format'
import { ConfidenceBadge } from './Confidence'

/** Columns for a statement: its detected periods, or the union of value keys. */
function columnsFor(statement: FinancialStatement): string[] {
  if (statement.periods.length > 0) return statement.periods
  const seen: string[] = []
  for (const row of statement.rows) {
    for (const key of Object.keys(row.values)) {
      if (!seen.includes(key)) seen.push(key)
    }
  }
  return seen
}

function renderCell(value: number | string | null | undefined): { text: string; missing: boolean } {
  if (value === null || value === undefined) return { text: '—', missing: true }
  if (typeof value === 'number') return { text: formatNumber(value), missing: false }
  return { text: value, missing: false }
}

/** A single detected statement rendered as a period-over-period table. */
export function FinancialStatementView({ statement }: { statement: FinancialStatement }) {
  const [openRow, setOpenRow] = useState<number | null>(null)
  const columns = columnsFor(statement)

  return (
    <section className="view-card statement-card">
      <header className="view-card__head">
        <div className="view-card__heading">
          <h3 className="view-card__title">
            {statement.title}
            {statement.sourcePage ? <span className="statement-page">p.{statement.sourcePage}</span> : null}
          </h3>
          <p className="view-card__desc">
            {statement.rows.length} line item{statement.rows.length === 1 ? '' : 's'}
            {columns.length > 0 ? ` · ${columns.length} period${columns.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="view-card__controls">
          <ConfidenceBadge value={statement.confidence} showPercent />
        </div>
      </header>

      <div className="view-card__body">
        <div className="finance-table-wrap">
          <table className="finance-table statement-table">
            <thead>
              <tr>
                <th scope="col">Line item</th>
                {columns.map((col) => (
                  <th scope="col" className="num" key={col}>
                    {col}
                  </th>
                ))}
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {statement.rows.map((row, index) => (
                <RowGroup
                  key={`${row.label}-${index}`}
                  row={row}
                  columns={columns}
                  open={openRow === index}
                  onToggle={() => setOpenRow((cur) => (cur === index ? null : index))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function RowGroup({
  row,
  columns,
  open,
  onToggle,
}: {
  row: FinancialLineItem
  columns: string[]
  open: boolean
  onToggle: () => void
}) {
  const span = columns.length + 2
  return (
    <>
      <tr className={open ? 'statement-row statement-row--open' : 'statement-row'}>
        <th scope="row">
          <button type="button" className="statement-row__label" onClick={onToggle} title="Inspect raw extracted text">
            <span aria-hidden="true" className="statement-row__caret">
              {open ? '▾' : '▸'}
            </span>
            {row.label}
          </button>
        </th>
        {columns.map((col) => {
          const { text, missing } = renderCell(row.values[col])
          return (
            <td className={`num${missing ? ' is-missing' : ''}`} key={col}>
              {text}
            </td>
          )
        })}
        <td>
          <ConfidenceBadge value={row.confidence} />
        </td>
      </tr>
      {open && (
        <tr className="statement-rawrow">
          <td colSpan={span}>
            <div className="statement-raw">
              <span className="statement-raw__meta">
                {row.sourcePage ? `Page ${row.sourcePage}` : 'Source page unknown'}
                {row.unit ? ` · ${row.unit}` : ''}
              </span>
              <code>{row.rawText ?? '(no raw text captured)'}</code>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
