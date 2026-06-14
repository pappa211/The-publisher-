/**
 * Detect a "wide" financial statement laid out as a flat table — a label column
 * followed by one column per year — and normalize it into the shared
 * FINANCIAL_FIELDS records so a financial CSV/spreadsheet gets the same
 * finance-aware report path as a detected workbook or PDF.
 *
 * The detector is deliberately strict (it needs real year-named columns and
 * several finance-keyword rows) so ordinary tables — trial balances, ledgers,
 * results files, reference data — keep flowing through the generic report.
 */
import type { ParseIssue } from '../types'
import type { RawTable } from './dataset'
import { buildFinancialAnalysis, FINANCIAL_FIELDS } from './financialAnalysis'
import { parseNumber } from './inferTypes'

const YEAR_HEADER_RE = /^(?:FY[\s_-]*)?((?:19|20)\d{2})$/i
const FINANCIAL_KEYWORD_RE =
  /revenue|sales|income|profit|loss|ebit|tax|expense|cost|asset|liabilit|equity|cash|receivable|payable|debt|capital|earnings|deprecia|amorti|gross|operating|dividend|inventor|reserve|\bnet\b/i

interface YearColumn {
  field: string
  period: string
}

function yearColumns(fields: string[]): YearColumn[] {
  return fields
    .map((field) => {
      const match = field.trim().match(YEAR_HEADER_RE)
      return match ? { field, period: `FY ${match[1]}` } : null
    })
    .filter((col): col is YearColumn => col !== null)
}

function asText(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

/** The first non-year column that holds mostly text — the line-item labels. */
function labelField(fields: string[], records: Record<string, unknown>[], yearFields: Set<string>): string | null {
  for (const field of fields) {
    if (yearFields.has(field)) continue
    const sample = records.slice(0, 30)
    const texty = sample.filter((row) => {
      const text = asText(row[field])
      return text !== '' && parseNumber(text) === null
    }).length
    if (texty >= Math.max(2, sample.length * 0.5)) return field
  }
  return null
}

/** Guess the single statement type for the table from its row labels. */
function guessStatement(labels: string[]): string {
  const blob = labels.join(' ').toLowerCase()
  if (/operating activities|investing activities|financing activities/.test(blob)) {
    return 'Cash flow statement'
  }
  if (/total assets|liabilit|equity|receivable|payable|retained earnings/.test(blob)) {
    return 'Balance sheet'
  }
  if (/revenue|sales|gross profit|operating profit|net (?:profit|income)|ebit|tax/.test(blob)) {
    return 'Income statement'
  }
  return 'Financial statement'
}

/** Fraction of a column's values that parse as numbers (0–1). */
function numericRatio(records: Record<string, unknown>[], field: string): number {
  let filled = 0
  let numeric = 0
  for (const row of records) {
    const text = asText(row[field])
    if (text === '') continue
    filled++
    if (parseNumber(text) !== null) numeric++
  }
  return filled === 0 ? 0 : numeric / filled
}

/**
 * Return a finance-normalized RawTable when `fields`/`records` look like a wide
 * statement, otherwise null (caller falls back to the generic table).
 */
export function detectWideFinancialTable(
  fields: string[],
  records: Record<string, unknown>[],
): RawTable | null {
  if (records.length < 3) return null

  const years = yearColumns(fields)
  if (years.length < 2) return null
  const yearFields = new Set(years.map((y) => y.field))
  if (years.some((y) => numericRatio(records, y.field) < 0.5)) return null

  const label = labelField(fields, records, yearFields)
  if (!label) return null

  const labels = records.map((row) => asText(row[label])).filter(Boolean)
  const financialRows = labels.filter((value) => FINANCIAL_KEYWORD_RE.test(value)).length
  if (financialRows < 3) return null

  const statement = guessStatement(labels)
  const sheetName = statement
  const normalized: Record<string, unknown>[] = []
  records.forEach((row, index) => {
    const lineItem = asText(row[label])
    if (!lineItem) return
    for (const year of years) {
      const amount = parseNumber(asText(row[year.field]))
      if (amount === null) continue
      normalized.push({
        Sheet: sheetName,
        Statement: statement,
        Section: '',
        'Line Item': lineItem,
        Metric: 'Amount',
        Period: year.period,
        Amount: amount,
        Unit: '',
        Note: '',
        'Source Row': `Row ${index + 2}`,
      })
    }
  })

  if (normalized.length < 8) return null

  const financialAnalysis = buildFinancialAnalysis(normalized, [
    {
      name: sheetName,
      rowCount: records.length,
      columnCount: fields.length,
      importedRows: normalized.length,
      kind: 'financial-table',
      statementType: statement,
    },
  ])
  if (!financialAnalysis) return null

  const issues: ParseIssue[] = [
    {
      message: `Recognized a ${statement.toLowerCase()} layout and normalized ${normalized.length.toLocaleString()} amounts across ${years.length} periods.`,
    },
  ]

  return { fields: FINANCIAL_FIELDS, records: normalized, issues, financialAnalysis }
}
