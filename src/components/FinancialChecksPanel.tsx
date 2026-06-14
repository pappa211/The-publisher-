import type { FinancialDocumentCheck } from '../types'

function statusText(status: FinancialDocumentCheck['status']): string {
  switch (status) {
    case 'pass':
      return 'Pass'
    case 'warn':
      return 'Review'
    case 'fail':
      return 'Fail'
    case 'not_available':
      return 'N/A'
  }
}

export function FinancialChecksPanel({ checks }: { checks: FinancialDocumentCheck[] }) {
  return (
    <section className="financial-section financial-checks-panel" aria-label="Accounting checks">
      <div className="financial-section__header">
        <h2>Accounting Checks</h2>
        <p>Deterministic checks from the reconstructed values.</p>
      </div>
      <ul className="financial-check-list">
        {checks.map((check, index) => (
          <li key={`${check.kind}-${check.periodId ?? index}`} className={`financial-check-item financial-check-item--${check.status}`}>
            <span>{statusText(check.status)}</span>
            <div>
              <strong>{check.message}</strong>
              {check.details && <p>{check.details}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

