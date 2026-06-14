import type { FinancialAnalysis } from '../types'
import { formatInt, formatNumber, formatPercent } from '../lib/format'
import { ViewCard } from './views/ViewCard'

function statusLabel(status: 'ok' | 'warning' | 'missing'): string {
  switch (status) {
    case 'ok':
      return 'OK'
    case 'warning':
      return 'Review'
    case 'missing':
      return 'Missing'
  }
}

function signed(value: number | undefined, percent = false): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const formatted = percent ? formatPercent(Math.abs(value)) : formatNumber(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return percent ? '0%' : '0'
}

export function FinancialStatementAnalysis({ analysis }: { analysis: FinancialAnalysis }) {
  return (
    <ViewCard
      title="Financial statement analysis"
      description="Statement-aware highlights, coverage and checks derived from every workbook sheet."
    >
      <div className="finance-panel">
        <div className="finance-kpis" aria-label="Financial workbook summary">
          <div className="finance-kpi">
            <span className="finance-kpi__label">Confidence</span>
            <strong>{formatPercent(analysis.confidence * 100)}</strong>
          </div>
          <div className="finance-kpi">
            <span className="finance-kpi__label">Financial sheets</span>
            <strong>{formatInt(analysis.sheetCount)}</strong>
          </div>
          <div className="finance-kpi">
            <span className="finance-kpi__label">Facts</span>
            <strong>{formatInt(analysis.factCount)}</strong>
          </div>
          <div className="finance-kpi">
            <span className="finance-kpi__label">Unit</span>
            <strong title={analysis.unit}>{analysis.unit ?? 'Mixed'}</strong>
          </div>
        </div>

        {analysis.highlights.length > 0 && (
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Current</th>
                  <th scope="col">Prior</th>
                  <th scope="col">Change</th>
                  <th scope="col">Change %</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {analysis.highlights.map((item) => (
                  <tr key={`${item.label}-${item.currentPeriod}-${item.sheet}`}>
                    <th scope="row">{item.label}</th>
                    <td className="num">
                      <span>{formatNumber(item.currentValue)}</span>
                      <small>{item.currentPeriod}</small>
                    </td>
                    <td className="num">
                      <span>{item.priorValue === undefined ? '—' : formatNumber(item.priorValue)}</span>
                      <small>{item.priorPeriod ?? ''}</small>
                    </td>
                    <td className={`num ${item.change && item.change < 0 ? 'is-negative' : 'is-positive'}`}>
                      {signed(item.change)}
                    </td>
                    <td className={`num ${item.changePct && item.changePct < 0 ? 'is-negative' : 'is-positive'}`}>
                      {signed(item.changePct, true)}
                    </td>
                    <td>
                      <span>{item.statement}</span>
                      <small title={item.sheet}>{item.sheet}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="finance-grid">
          <section className="finance-block">
            <h4>Checks</h4>
            <ul className="finance-checks">
              {analysis.checks.map((check) => (
                <li key={`${check.label}-${check.period ?? ''}`} className={`finance-check finance-check--${check.status}`}>
                  <span>{statusLabel(check.status)}</span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="finance-block">
            <h4>Coverage</h4>
            <div className="finance-tags">
              {analysis.statementTypes.map((type) => (
                <span key={type}>{type}</span>
              ))}
            </div>
            <p>
              Periods detected: <strong>{analysis.periods.slice(0, 6).join(', ')}</strong>
              {analysis.periods.length > 6 ? `, +${analysis.periods.length - 6} more` : ''}
            </p>
          </section>
        </div>
      </div>
    </ViewCard>
  )
}
