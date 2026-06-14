import type {
  FinancialDocumentCheck,
  FinancialKeyFigure,
  FinancialLineItem,
  FinancialPeriod,
  FinancialStatement,
} from '../types'

function valueFor(items: FinancialLineItem[], concept: string, periodId: string): number | null {
  const candidates = items
    .filter((item) => item.canonicalConcept === concept)
    .map((item) => ({ item, value: item.values[periodId] }))
    .filter((candidate): candidate is { item: FinancialLineItem; value: number } => (
      typeof candidate.value === 'number' && Number.isFinite(candidate.value)
    ))
    .sort((a, b) => b.item.confidence - a.item.confidence)

  return candidates[0]?.value ?? null
}

function absOrNull(value: number | null): number | null {
  return value === null ? null : Math.abs(value)
}

export function buildFinancialChecks(
  statements: FinancialStatement[],
  periods: FinancialPeriod[],
  keyFigures: FinancialKeyFigure[],
  extractionQuality: number,
): FinancialDocumentCheck[] {
  const rows = statements.flatMap((statement) => statement.rows)
  const checks: FinancialDocumentCheck[] = []

  for (const period of periods.slice(0, 3)) {
    const assets = absOrNull(valueFor(rows, 'total_assets', period.id))
    const equityAndLiabilities = absOrNull(valueFor(rows, 'total_equity_and_liabilities', period.id))
    const equity = absOrNull(valueFor(rows, 'total_equity', period.id))
    const liabilities = absOrNull(valueFor(rows, 'total_liabilities', period.id))
    const expected = equityAndLiabilities ?? (
      equity !== null && liabilities !== null ? equity + liabilities : null
    )

    if (assets === null || expected === null) {
      checks.push({
        kind: 'balance_sheet_equation',
        status: 'not_available',
        periodId: period.id,
        message: `Balance sheet equation could not be checked for ${period.label}.`,
        details: 'Total assets and total equity/liabilities were not both confidently extracted.',
      })
      continue
    }

    const diff = assets - expected
    const tolerance = Math.max(1, Math.abs(assets) * 0.01)
    checks.push({
      kind: 'balance_sheet_equation',
      status: Math.abs(diff) <= tolerance ? 'pass' : 'fail',
      periodId: period.id,
      message: Math.abs(diff) <= tolerance
        ? `Balance sheet equation passes for ${period.label}.`
        : `Balance sheet equation does not tie for ${period.label}.`,
      details: `Assets ${assets.toLocaleString()} vs equity/liabilities ${expected.toLocaleString()} (difference ${diff.toLocaleString()}).`,
    })
  }

  const statementKinds = new Set(statements.filter((statement) => statement.rows.length > 0).map((statement) => statement.kind))
  const missingPrimary = ['income_statement', 'balance_sheet', 'cash_flow']
    .filter((kind) => !statementKinds.has(kind as FinancialStatement['kind']))
  checks.push({
    kind: 'period_consistency',
    status: periods.length > 0 ? (missingPrimary.length === 0 ? 'pass' : 'warn') : 'fail',
    message: periods.length > 0
      ? `Detected ${periods.length} reporting period${periods.length === 1 ? '' : 's'}.`
      : 'No reporting periods were confidently detected.',
    details: missingPrimary.length > 0
      ? `Primary statements missing or uncertain: ${missingPrimary.join(', ')}.`
      : 'Income statement, balance sheet and cash flow statement were all detected.',
  })

  checks.push({
    kind: 'extraction_quality',
    status: extractionQuality >= 0.65 ? 'pass' : extractionQuality >= 0.35 ? 'warn' : 'fail',
    message: extractionQuality >= 0.65
      ? 'Extraction quality is sufficient for analyst review.'
      : extractionQuality >= 0.35
        ? 'Extraction quality is usable but should be reviewed.'
        : 'Extraction quality is weak.',
    details: `${keyFigures.length} key figure${keyFigures.length === 1 ? '' : 's'} and ${rows.length} statement line${rows.length === 1 ? '' : 's'} reconstructed.`,
  })

  return checks
}

