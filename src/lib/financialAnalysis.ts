import type {
  FinancialAnalysis,
  FinancialCheck,
  FinancialHighlight,
  WorkbookSheetMeta,
} from '../types'
import { parseNumber } from './inferTypes'

export const FINANCIAL_FIELDS = [
  'Sheet',
  'Statement',
  'Section',
  'Line Item',
  'Metric',
  'Period',
  'Amount',
  'Unit',
  'Note',
  'Source Row',
]

interface KeyMetricRule {
  label: string
  patterns: RegExp[]
  statementHints?: RegExp[]
}

const KEY_METRICS: KeyMetricRule[] = [
  {
    label: 'Revenue',
    patterns: [/^revenue$/i, /\btotal revenue and income\b/i, /revenue from contracts/i],
    statementHints: [/income/i, /revenue/i],
  },
  {
    label: 'EBITDA',
    patterns: [/\bebitda\b/i],
    statementHints: [/income/i, /ebitda/i],
  },
  {
    label: 'Operating income',
    patterns: [/operating income/i, /\bebit\b/i],
    statementHints: [/income/i],
  },
  {
    label: 'Net income',
    patterns: [/^net income(\s*\(loss\))?$/i, /profit .* period/i],
    statementHints: [/income/i],
  },
  {
    label: 'Total assets',
    patterns: [/^total assets$/i],
    statementHints: [/balance/i],
  },
  {
    label: 'Total liabilities and equity',
    patterns: [/^total liabilities and equity$/i],
    statementHints: [/balance/i],
  },
  {
    label: 'Total equity',
    patterns: [/^total equity$/i, /equity to .* shareholders/i],
    statementHints: [/balance/i, /equity/i],
  },
  {
    label: 'Cash and cash equivalents',
    patterns: [/cash and cash equivalents/i],
    statementHints: [/balance/i],
  },
  {
    label: 'Operating cash flow',
    patterns: [/net cash .* operating activities/i, /cash provided by operating activities/i],
    statementHints: [/cash/i],
  },
]

interface Fact {
  sheet: string
  statement: string
  lineItem: string
  metric: string
  period: string
  amount: number
  unit?: string
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return value == null ? '' : String(value).trim()
}

function amount(record: Record<string, unknown>): number | null {
  const raw = record.Amount
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  return parseNumber(text(record, 'Amount'))
}

function toFact(record: Record<string, unknown>): Fact | null {
  const parsed = amount(record)
  if (parsed === null) return null
  const lineItem = text(record, 'Line Item')
  const period = text(record, 'Period')
  if (!lineItem || !period) return null
  return {
    sheet: text(record, 'Sheet'),
    statement: text(record, 'Statement') || 'Financial table',
    lineItem,
    metric: text(record, 'Metric') || 'Amount',
    period,
    amount: parsed,
    unit: text(record, 'Unit') || undefined,
  }
}

function yearOf(period: string): number {
  const match = period.match(/(?:FY\s*)?(\d{4})/)
  return match ? Number(match[1]) : -Infinity
}

function sortPeriods(periods: Iterable<string>): string[] {
  const counts = new Map<string, number>()
  for (const period of periods) {
    counts.set(period, (counts.get(period) ?? 0) + 1)
  }
  const datedCounts = [...counts.entries()]
    .filter(([period]) => Number.isFinite(yearOf(period)))
    .map(([, count]) => count)
  const coreThreshold = Math.max(1, Math.max(...datedCounts, 1) * 0.35)

  return [...counts.keys()].sort((a, b) => {
    const ay = yearOf(a)
    const by = yearOf(b)
    const aDated = Number.isFinite(ay)
    const bDated = Number.isFinite(by)
    if (aDated !== bDated) return aDated ? -1 : 1
    const aCore = (counts.get(a) ?? 0) >= coreThreshold
    const bCore = (counts.get(b) ?? 0) >= coreThreshold
    if (aCore !== bCore) return aCore ? -1 : 1
    if (aCore && bCore && ay !== by) return by - ay
    const countDiff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    if (countDiff !== 0) return countDiff
    if (ay !== by) return by - ay
    return a.localeCompare(b)
  })
}

function mostCommon(values: Iterable<string | undefined>): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function metricScore(fact: Fact, rule: KeyMetricRule): number {
  const line = fact.lineItem
  const statement = `${fact.statement} ${fact.sheet}`
  let score = 0
  rule.patterns.forEach((pattern, index) => {
    if (pattern.test(line)) score += 100 - index * 8
  })
  if (/^total\b/i.test(line)) score += 15
  if (fact.metric !== 'Amount') score -= 8
  if (rule.statementHints?.some((hint) => hint.test(statement))) score += 12
  if (/per share|share capital|treasury shares/i.test(line)) score -= 30
  return score
}

function bestFactForPeriod(facts: Fact[], rule: KeyMetricRule, period: string): Fact | undefined {
  return facts
    .filter((fact) => fact.period === period && rule.patterns.some((pattern) => pattern.test(fact.lineItem)))
    .sort((a, b) => metricScore(b, rule) - metricScore(a, rule))[0]
}

function buildHighlights(facts: Fact[], periods: string[]): FinancialHighlight[] {
  const [currentPeriod, priorPeriod] = periods
  if (!currentPeriod) return []

  const highlights: FinancialHighlight[] = []
  for (const rule of KEY_METRICS) {
    const current = bestFactForPeriod(facts, rule, currentPeriod)
    if (!current) continue
    const prior = priorPeriod ? bestFactForPeriod(facts, rule, priorPeriod) : undefined
    const change = prior ? current.amount - prior.amount : undefined
    const changePct = prior && prior.amount !== 0 ? (change ?? 0) / Math.abs(prior.amount) * 100 : undefined
    highlights.push({
      label: rule.label,
      currentPeriod,
      currentValue: current.amount,
      priorPeriod: prior?.period,
      priorValue: prior?.amount,
      change,
      changePct,
      statement: current.statement,
      sheet: current.sheet,
      unit: current.unit,
    })
  }
  return highlights
}

function findFact(facts: Fact[], period: string, pattern: RegExp): Fact | undefined {
  return facts
    .filter((fact) => fact.period === period && pattern.test(fact.lineItem))
    .sort((a, b) => {
      const exactA = /^total\b/i.test(a.lineItem) ? 1 : 0
      const exactB = /^total\b/i.test(b.lineItem) ? 1 : 0
      return exactB - exactA
    })[0]
}

function buildChecks(facts: Fact[], periods: string[], statementTypes: string[]): FinancialCheck[] {
  const checks: FinancialCheck[] = []
  const currentPeriod = periods[0]
  if (currentPeriod) {
    const assets = findFact(facts, currentPeriod, /^total assets$/i)
    const liabilitiesAndEquity = findFact(facts, currentPeriod, /^total liabilities and equity$/i)
    const liabilities = findFact(facts, currentPeriod, /^total liabilities$/i)
    const equity = findFact(facts, currentPeriod, /^total equity$/i)
    const expected = liabilitiesAndEquity?.amount ?? (
      liabilities && equity ? liabilities.amount + equity.amount : undefined
    )

    if (assets && expected !== undefined) {
      const diff = assets.amount - expected
      const tolerance = Math.max(1, Math.abs(assets.amount) * 0.001)
      checks.push({
        label: 'Balance sheet equation',
        status: Math.abs(diff) <= tolerance ? 'ok' : 'warning',
        period: currentPeriod,
        detail: Math.abs(diff) <= tolerance
          ? 'Total assets tie to liabilities and equity within rounding tolerance.'
          : `Assets differ from liabilities and equity by ${diff.toLocaleString()}.`,
      })
    } else {
      checks.push({
        label: 'Balance sheet equation',
        status: 'missing',
        period: currentPeriod,
        detail: 'Could not find enough total rows to tie assets to liabilities and equity.',
      })
    }
  }

  const hasIncome = statementTypes.some((type) => /income/i.test(type))
  const hasBalance = statementTypes.some((type) => /balance/i.test(type))
  const hasCash = statementTypes.some((type) => /cash/i.test(type))
  checks.push({
    label: 'Primary statement coverage',
    status: hasIncome && hasBalance && hasCash ? 'ok' : 'warning',
    detail: hasIncome && hasBalance && hasCash
      ? 'Income statement, balance sheet and cash flow statement tables were detected.'
      : 'One or more primary statement types were not confidently detected.',
  })

  return checks
}

export function buildFinancialAnalysis(
  records: Record<string, unknown>[],
  sheets: WorkbookSheetMeta[],
): FinancialAnalysis | undefined {
  const facts = records.map(toFact).filter((fact): fact is Fact => fact !== null)
  if (facts.length < 8) return undefined

  const periods = sortPeriods(facts.map((fact) => fact.period))
  const statementTypes = [...new Set(facts.map((fact) => fact.statement).filter(Boolean))].sort()
  const importedFinancialSheets = sheets.filter((sheet) => sheet.kind === 'financial-table')
  const confidence = Math.min(
    0.96,
    0.38 +
      Math.min(0.24, statementTypes.length * 0.04) +
      Math.min(0.18, periods.length * 0.06) +
      Math.min(0.16, facts.length / 500),
  )

  return {
    confidence,
    unit: mostCommon(facts.map((fact) => fact.unit)),
    periods,
    sheetCount: importedFinancialSheets.length,
    factCount: facts.length,
    statementTypes,
    highlights: buildHighlights(facts, periods),
    checks: buildChecks(facts, periods, statementTypes),
    notes: [
      `${facts.length.toLocaleString()} financial facts normalized from ${importedFinancialSheets.length.toLocaleString()} source${importedFinancialSheets.length === 1 ? '' : 's'}.`,
      'Amounts are read from source cells and grouped by statement, section, line item and period.',
    ],
  }
}
