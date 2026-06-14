import { useEffect, useMemo, useState } from 'react'
import type { FinancialDocument, FinancialStatement, FinancialStatementKind } from '../types'
import { formatInt, formatPercent } from '../lib/format'
import { statementTitle } from '../lib/financialConcepts'
import { FinancialStatementTable } from './FinancialStatementTable'

const ORDER: FinancialStatementKind[] = ['income_statement', 'balance_sheet', 'cash_flow', 'unknown']

export function FinancialStatementTabs({ document }: { document: FinancialDocument }) {
  const statements = useMemo(() => (
    [...document.statements].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  ), [document.statements])
  const firstPopulatedKind = statements.find((statement) => statement.rows.length > 0)?.kind
    ?? statements[0]?.kind
    ?? 'income_statement'
  const [activeKind, setActiveKind] = useState<FinancialStatementKind>(firstPopulatedKind)
  const active = statements.find((statement) => statement.kind === activeKind) ?? statements[0]

  useEffect(() => {
    const current = statements.find((statement) => statement.kind === activeKind)
    if (!current || (current.rows.length === 0 && statements.some((statement) => statement.rows.length > 0))) {
      setActiveKind(firstPopulatedKind)
    }
  }, [activeKind, firstPopulatedKind, statements])

  if (!active) {
    return (
      <section className="financial-section">
        <div className="financial-empty">No statement rows were reconstructed.</div>
      </section>
    )
  }

  return (
    <section className="financial-section statement-tabs" aria-label="Reconstructed financial statements">
      <div className="financial-section__header">
        <h2>Statements</h2>
        <p>Primary statements reconstructed from extracted lines and structured tables.</p>
      </div>

      <div className="statement-tablist" role="tablist">
        {statements.map((statement: FinancialStatement) => (
          <button
            key={statement.kind}
            type="button"
            role="tab"
            aria-selected={active.kind === statement.kind}
            className={`statement-tab${active.kind === statement.kind ? ' statement-tab--active' : ''}`}
            onClick={() => setActiveKind(statement.kind)}
          >
            <span>{statementTitle(statement.kind)}</span>
            <small>{formatInt(statement.rows.length)} rows · {formatPercent(statement.confidence * 100)}</small>
          </button>
        ))}
      </div>

      <FinancialStatementTable
        statement={active}
        periods={document.detectedPeriods.length > 0 ? document.detectedPeriods : active.periods}
      />
    </section>
  )
}
