import type { FinancialDocument, FinancialPeriod } from '../types'
import { formatNumber, formatPercent } from '../lib/format'

function valueText(value: number | null | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : '—'
}

export function FinancialKeyFigures({ document }: { document: FinancialDocument }) {
  const periods = document.detectedPeriods.slice(0, 3)

  return (
    <section className="financial-section financial-keyfigures" aria-label="Key financial figures">
      <div className="financial-section__header">
        <h2>Key Figures</h2>
        <p>Canonical figures detected from the reconstructed statements.</p>
      </div>

      <div className="keyfigure-table-wrap">
        <table className="keyfigure-table">
          <thead>
            <tr>
              <th scope="col">Figure</th>
              {periods.map((period: FinancialPeriod) => (
                <th key={period.id} scope="col" className="num">
                  {period.label}
                </th>
              ))}
              <th scope="col">Source</th>
              <th scope="col" className="num">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {document.keyFigures.map((figure) => (
              <tr key={figure.canonicalConcept}>
                <th scope="row">
                  {figure.label}
                  {figure.warning && <small>{figure.warning}</small>}
                </th>
                {periods.map((period) => (
                  <td key={period.id} className="num">
                    {valueText(figure.values[period.id])}
                  </td>
                ))}
                <td>{figure.sourcePage ? `Page ${figure.sourcePage}` : figure.statementKind.replace(/_/g, ' ')}</td>
                <td className="num">{formatPercent(figure.confidence * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {document.keyFigures.length === 0 && (
          <div className="financial-empty">No canonical key figures were confidently extracted.</div>
        )}
      </div>
    </section>
  )
}

