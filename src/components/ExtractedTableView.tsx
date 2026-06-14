import { useMemo, useState } from 'react'
import type { FinancialDocument, FinancialLineItem, StatementKind } from '../types'
import { formatNumber } from '../lib/format'
import { STATEMENT_KIND_LABEL } from '../lib/financialStatementDetector'
import { ConfidenceBadge, confidenceTone } from './Confidence'
import { ViewCard } from './views/ViewCard'

interface FlatRow extends FinancialLineItem {
  kind: StatementKind
  statementTitle: string
}

function flatten(document: FinancialDocument): FlatRow[] {
  return document.statements.flatMap((statement) =>
    statement.rows.map((row) => ({ ...row, kind: statement.kind, statementTitle: statement.title })),
  )
}

/**
 * A searchable, filterable table of every extracted line item across the whole
 * document — the place to compare periods, filter by statement type and spot
 * low-confidence or missing values.
 */
export function ExtractedTableView({ document }: { document: FinancialDocument }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<StatementKind | 'all'>('all')

  const allRows = useMemo(() => flatten(document), [document])
  const kinds = useMemo(() => {
    const present = new Set(allRows.map((row) => row.kind))
    return [...present]
  }, [allRows])

  const columns = document.periods.length > 0 ? document.periods : unionPeriods(allRows)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows.filter((row) => {
      if (kind !== 'all' && row.kind !== kind) return false
      if (!q) return true
      return row.label.toLowerCase().includes(q) || (row.rawText ?? '').toLowerCase().includes(q)
    })
  }, [allRows, kind, query])

  if (allRows.length === 0) {
    return (
      <ViewCard
        title="Extracted line items"
        description="No structured financial line items were extracted. The raw text for each page is available below."
      >
        <div className="view-empty">Nothing structured to show yet.</div>
      </ViewCard>
    )
  }

  return (
    <ViewCard
      title="Extracted line items"
      description="Every figure the parser pulled out, across all statements. Search, filter by statement, and compare periods."
      controls={
        <div className="extracted-controls">
          <input
            type="search"
            className="extracted-search"
            placeholder="Search line items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search extracted line items"
          />
          <select
            className="extracted-filter"
            value={kind}
            onChange={(e) => setKind(e.target.value as StatementKind | 'all')}
            aria-label="Filter by statement type"
          >
            <option value="all">All statements</option>
            {kinds.map((k) => (
              <option value={k} key={k}>
                {STATEMENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      }
      footnote={`${rows.length} of ${allRows.length} line items shown.`}
    >
      <div className="finance-table-wrap">
        <table className="finance-table extracted-table">
          <thead>
            <tr>
              <th scope="col">Statement</th>
              <th scope="col">Line item</th>
              {columns.map((col) => (
                <th scope="col" className="num" key={col}>
                  {col}
                </th>
              ))}
              <th scope="col">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.statementTitle}-${row.label}-${index}`}
                className={confidenceTone(row.confidence) === 'low' ? 'is-uncertain' : undefined}
              >
                <td>
                  <span className="extracted-kind">{STATEMENT_KIND_LABEL[row.kind]}</span>
                </td>
                <th scope="row" title={row.rawText}>
                  {row.label}
                </th>
                {columns.map((col) => {
                  const value = row.values[col]
                  const missing = value === null || value === undefined
                  return (
                    <td className={`num${missing ? ' is-missing' : ''}`} key={col}>
                      {missing ? '—' : typeof value === 'number' ? formatNumber(value) : value}
                    </td>
                  )
                })}
                <td>
                  <ConfidenceBadge value={row.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ViewCard>
  )
}

function unionPeriods(rows: FlatRow[]): string[] {
  const seen: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row.values)) {
      if (!seen.includes(key)) seen.push(key)
    }
  }
  return seen
}
