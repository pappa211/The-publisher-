/**
 * Heuristic financial-statement detection.
 *
 * Given the per-page text of a document (embedded or OCR), this walks the lines
 * top-to-bottom, recognises statement headings (income statement, balance
 * sheet, cash flow, equity, notes), segments the body into those statements,
 * and turns each "label … figures" row into a structured {@link FinancialLineItem}
 * mapped to the period columns detected for that statement.
 *
 * It is intentionally transparent: every statement and row carries a confidence,
 * the original text is preserved, and uncertainties are surfaced as warnings
 * rather than hidden.
 */
import type {
  FinancialLineItem,
  FinancialStatement,
  PdfPageExtraction,
  StatementKind,
} from '../types'
import {
  detectPeriods,
  detectUnitCurrency,
  looksLikePeriodHeader,
  parseFinancialLine,
} from './financialTextParser'

/** Human-readable label for each statement kind (also used as the analysis
 * "Statement" type so the existing finance checks recognise income/balance/cash). */
export const STATEMENT_KIND_LABEL: Record<StatementKind, string> = {
  income_statement: 'Income statement',
  balance_sheet: 'Balance sheet',
  cash_flow: 'Cash flow statement',
  equity: 'Equity statement',
  notes: 'Notes',
  unknown: 'Unrecognized section',
}

interface HeadingRule {
  kind: StatementKind
  title: string
  pattern: RegExp
}

/** Heading patterns, ordered most-specific first. */
const HEADING_RULES: HeadingRule[] = [
  {
    kind: 'cash_flow',
    title: 'Cash flow statement',
    pattern: /\b(?:statement of cash flows?|cash\s*flow statement|cash flows? statement)\b/i,
  },
  {
    kind: 'equity',
    title: 'Statement of changes in equity',
    pattern: /\b(?:statement of changes in equity|changes in equity|statement of (?:stockholders'?|shareholders'?) equity)\b/i,
  },
  {
    kind: 'balance_sheet',
    title: 'Balance sheet',
    pattern: /\b(?:balance sheet|statement of financial position)\b/i,
  },
  {
    kind: 'income_statement',
    title: 'Income statement',
    pattern: /\b(?:income statement|statement of profit (?:or|and) loss|profit and loss account|statement of operations|statement of comprehensive income|statement of profit)\b/i,
  },
  {
    kind: 'notes',
    title: 'Notes to the accounts',
    pattern: /\b(?:notes to (?:the )?(?:financial statements|consolidated financial statements|the accounts|accounts)|accounting policies)\b/i,
  },
]

/** Row-label anchors that raise confidence a section is the statement it claims. */
const ANCHORS: Record<StatementKind, RegExp[]> = {
  income_statement: [
    /\brevenue\b/i,
    /\bsales\b/i,
    /operating (?:profit|income)/i,
    /profit (?:before|for)/i,
    /net (?:profit|income|loss)/i,
    /\bebit(?:da)?\b/i,
    /tax expense|income tax/i,
  ],
  balance_sheet: [
    /total assets/i,
    /total equity/i,
    /liabilit/i,
    /cash and cash equivalents/i,
    /receivable/i,
    /payable/i,
    /retained earnings/i,
  ],
  cash_flow: [
    /operating activities/i,
    /investing activities/i,
    /financing activities/i,
    /net cash/i,
    /depreciation|amortis|amortiz/i,
  ],
  equity: [/share capital/i, /retained earnings/i, /reserves/i, /dividend/i],
  notes: [/\bnote\b/i],
  unknown: [],
}

/** A line is a heading when a pattern matches a short, figure-free line. */
function matchHeading(line: string): HeadingRule | null {
  const trimmed = line.trim()
  if (trimmed.length > 70) return null
  if (parseFinancialLine(trimmed)) return null // headings carry no figures
  return HEADING_RULES.find((rule) => rule.pattern.test(trimmed)) ?? null
}

function cleanTitle(line: string, fallback: string): string {
  const cleaned = line.trim().replace(/\s+/g, ' ').replace(/[:.\s]+$/, '')
  return cleaned.length >= 4 && cleaned.length <= 60 ? cleaned : fallback
}

function newStatement(kind: StatementKind, title: string, page: number): FinancialStatement {
  return { kind, title, sourcePage: page, periods: [], rows: [], confidence: 0 }
}

/** Map a row's positional values onto the statement's detected period columns. */
function buildValues(
  values: (number | null)[],
  periods: string[],
): { map: Record<string, number | string | null>; ragged: boolean } {
  const map: Record<string, number | string | null> = {}
  values.forEach((value, index) => {
    const key = periods[index] ?? `Value ${index + 1}`
    map[key] = value
  })
  const ragged = periods.length > 0 && values.length !== periods.length
  return { map, ragged }
}

function scoreStatement(statement: FinancialStatement): number {
  if (statement.kind === 'unknown') {
    return Math.min(0.4, 0.15 + statement.rows.length * 0.02)
  }
  const anchors = ANCHORS[statement.kind] ?? []
  const matched = anchors.filter((re) => statement.rows.some((row) => re.test(row.label))).length
  let score = 0.45
  score += Math.min(0.2, statement.periods.length * 0.1)
  score += Math.min(0.32, matched * 0.08)
  if (statement.rows.length >= 4) score += 0.05
  return Math.min(0.95, score)
}

/** A row's confidence reflects how cleanly it mapped to the period columns. */
function rowConfidence(values: (number | null)[], periods: string[]): number {
  if (periods.length === 0) return 0.5
  if (values.length === periods.length) return 0.85
  return 0.6
}

export interface AnalyzeResult {
  statements: FinancialStatement[]
  extractedRows: FinancialLineItem[]
  periods: string[]
  unit?: string
  currency?: string
  warnings: string[]
}

/** Choose the best available text for a page (OCR overrides empty embedded text). */
function pageText(page: PdfPageExtraction): string {
  if (page.extractionMode === 'ocr' && page.ocrText) return page.ocrText
  if (page.embeddedText && page.embeddedText.trim()) return page.embeddedText
  return page.ocrText ?? ''
}

/**
 * Detect statements and extract line items across all pages. Pure and reusable:
 * the OCR flow re-runs this on pages augmented with OCR text.
 */
export function analyzeFinancialPages(pages: PdfPageExtraction[]): AnalyzeResult {
  const statements: FinancialStatement[] = []
  const extractedRows: FinancialLineItem[] = []
  const docPeriods: string[] = []
  const warnings = new Set<string>()
  let current: FinancialStatement | null = null
  let docUnit: string | undefined
  let docCurrency: string | undefined
  let raggedSeen = false
  let headerlessValues = false

  const ensureCurrent = (page: number): FinancialStatement => {
    if (!current) {
      current = newStatement('unknown', 'Unassigned figures', page)
      statements.push(current)
    }
    return current
  }

  for (const page of pages) {
    const text = pageText(page)
    if (!text.trim()) continue

    for (const rawLine of text.split('\n')) {
      const line = rawLine.replace(/\s+$/g, '')
      if (!line.trim()) continue

      // 1) Unit / currency caption (applies to subsequent rows document-wide).
      const uc = detectUnitCurrency(line)
      if (uc.unit || uc.currency) {
        if (!docUnit && uc.unit) docUnit = uc.unit
        if (!docCurrency && uc.currency) docCurrency = uc.currency
      }

      // 2) Statement heading.
      const heading = matchHeading(line)
      if (heading) {
        current = newStatement(heading.kind, cleanTitle(line, heading.title), page.pageNumber)
        statements.push(current)
        continue
      }

      // 3) Period / column header.
      if (looksLikePeriodHeader(line)) {
        const periods = detectPeriods(line)
        const target = ensureCurrent(page.pageNumber)
        if (periods.length > 0) {
          target.periods = periods
          for (const period of periods) {
            if (!docPeriods.includes(period)) docPeriods.push(period)
          }
        }
        continue
      }

      // 4) Data row.
      const parsed = parseFinancialLine(line)
      if (!parsed) continue
      const target = ensureCurrent(page.pageNumber)
      const { map, ragged } = buildValues(parsed.values, target.periods)
      if (ragged) raggedSeen = true
      if (target.periods.length === 0) headerlessValues = true

      const item: FinancialLineItem = {
        label: parsed.label,
        values: map,
        unit: docUnit,
        currency: docCurrency,
        sourcePage: page.pageNumber,
        rawText: line.trim(),
        confidence: rowConfidence(parsed.values, target.periods),
      }
      target.rows.push(item)
      extractedRows.push(item)
    }
  }

  // Finalize: drop empty sections, score the rest, collect period union.
  const kept = statements.filter((statement) => statement.rows.length > 0)
  for (const statement of kept) {
    statement.confidence = scoreStatement(statement)
    for (const period of statement.periods) {
      if (!docPeriods.includes(period)) docPeriods.push(period)
    }
  }

  if (headerlessValues) {
    warnings.add('Numeric values were detected, but year/period headers were unclear.')
  }
  if (raggedSeen) {
    warnings.add('Some rows held a different number of figures than the detected period columns.')
  }
  if (kept.some((statement) => statement.kind === 'unknown')) {
    warnings.add('Some line items could not be confidently assigned to a financial statement.')
  }
  if (kept.every((statement) => statement.kind === 'unknown') && extractedRows.length > 0) {
    warnings.add('No labelled financial statement heading was confidently detected.')
  }

  return {
    statements: kept,
    extractedRows,
    periods: docPeriods,
    unit: docUnit,
    currency: docCurrency,
    warnings: [...warnings],
  }
}
