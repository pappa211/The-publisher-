import type { FinancialPeriod, FinancialStatement } from '../types'
import { formatNumber, formatPercent } from '../lib/format'

function valueText(value: number | null | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : '—'
}

export function FinancialStatementTable({
  statement,
  periods,
}: {
  statement: FinancialStatement
  periods: FinancialPeriod[]
}) {
  return (
    <div className="statement-table-wrap">
      <table className="statement-table">
        <thead>
          <tr>
            <th scope="col">Line item</th>
            {periods.map((period) => (
              <th key={period.id} scope="col" className="num">
                {period.label}
              </th>
            ))}
            <th scope="col">Source</th>
            <th scope="col" className="num">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span>{row.label}</span>
                {row.canonicalConcept && <small>{row.canonicalConcept.replace(/_/g, ' ')}</small>}
              </th>
              {periods.map((period) => (
                <td key={period.id} className="num">
                  {valueText(row.values[period.id])}
                </td>
              ))}
              <td>
                {row.sourcePage ? `Page ${row.sourcePage}` : row.extractionMode.replace(/_/g, ' ')}
                <details>
                  <summary>Raw</summary>
                  <p>{row.rawText}</p>
                </details>
              </td>
              <td className="num">
                {formatPercent(row.confidence * 100)}
                {row.warnings.length > 0 && <small>{row.warnings[0].message}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

