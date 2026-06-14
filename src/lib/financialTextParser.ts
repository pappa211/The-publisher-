/**
 * Heuristic, transparent text → financial-line-item parsing.
 *
 * This module knows nothing about pages, statements or PDFs. It takes a single
 * line of text (from embedded PDF text *or* OCR) and tries to split it into a
 * label and the numeric value(s) that trail it, plus helpers for spotting the
 * period/column header rows and the "amounts in thousands of EUR"-style unit
 * captions. It is deliberately conservative and never claims to be exact —
 * callers keep the raw text and attach a confidence to everything it returns.
 */
import { parseNumber } from './inferTypes'

/** The result of parsing one line: a label and its trailing numeric values. */
export interface ParsedLine {
  label: string
  /** One entry per detected value column; `null` marks an explicit blank (—). */
  values: (number | null)[]
  /** The raw numeric tokens, kept for inspection. */
  rawNumbers: string[]
}

/** Detected unit / currency hints from a caption line. */
export interface UnitCurrency {
  unit?: string
  currency?: string
}

const MISSING_CELL_RE = /^[-–—]$/
const NUMERIC_CELL_RE = /\d/
/** A label that is really just a number/year (filtered out as noise). */
const NUMERIC_LABEL_RE = /^[\s\d.,()%+–—$€£¥-]+$/

/** Split a line into columns. Embedded-text lines carry wide gaps between a
 * label and its figures; we treat a run of 2+ spaces as a column break. */
function splitCells(line: string): string[] {
  return line
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean)
}

/** Parse a whole cell as a number, joining any internal spaces first so that
 * space-grouped thousands ("12 450") survive. Returns null for non-numbers. */
function cellToNumber(cell: string): number | null {
  if (!NUMERIC_CELL_RE.test(cell)) return null
  return parseNumber(cell.replace(/\s+/g, ''))
}

/** True when a single value looks like a bare year rather than an amount. */
function isBareYear(value: number | null, raw: string): boolean {
  return (
    value !== null &&
    Number.isInteger(value) &&
    value >= 1900 &&
    value <= 2100 &&
    /^[12]\d{3}$/.test(raw.trim())
  )
}

/** Column-aware parse: peel numeric cells off the right, keep the rest as label. */
function parseByCells(line: string): ParsedLine | null {
  const cells = splitCells(line)
  if (cells.length < 2) return null

  const values: (number | null)[] = []
  const raw: string[] = []
  let i = cells.length - 1
  while (i >= 1) {
    const cell = cells[i]
    const missing = MISSING_CELL_RE.test(cell)
    const n = missing ? null : cellToNumber(cell)
    if (n === null && !missing) break
    values.unshift(n)
    raw.unshift(cell)
    i--
  }

  if (values.length === 0) return null
  const label = cells.slice(0, i + 1).join('  ').trim()
  if (!label || NUMERIC_LABEL_RE.test(label)) return null
  return { label, values, rawNumbers: raw }
}

/** Whitespace-token parse: the fallback for OCR / single-spaced lines. */
function parseByTokens(line: string): ParsedLine | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens.length < 2) return null

  const values: (number | null)[] = []
  const raw: string[] = []
  let i = tokens.length - 1
  while (i >= 1) {
    const tok = tokens[i]
    const missing = MISSING_CELL_RE.test(tok)
    const n = missing ? null : parseNumber(tok)
    if (n === null && !missing) break
    values.unshift(n)
    raw.unshift(tok)
    i--
  }

  if (values.length === 0) return null
  const label = tokens.slice(0, i + 1).join(' ').trim()
  if (!label || NUMERIC_LABEL_RE.test(label)) return null
  return { label, values, rawNumbers: raw }
}

/**
 * Parse one line into a labelled set of numeric values, or null if it is not a
 * "label … figures" row. A line whose only value is a bare year is rejected so
 * captions like "Annual Report 2023" do not masquerade as data.
 */
export function parseFinancialLine(line: string): ParsedLine | null {
  const parsed = parseByCells(line) ?? parseByTokens(line)
  if (!parsed) return null
  if (
    parsed.values.length === 1 &&
    isBareYear(parsed.values[0], parsed.rawNumbers[0] ?? '')
  ) {
    return null
  }
  return parsed
}

const MONTHS =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const QUARTER_RE = /\bQ([1-4])[\s/'-]*((?:19|20)\d{2})\b/gi
const YEAR_TOKEN_RE = /\b(?:FY[\s'-]*)?((?:19|20)\d{2})\b/gi

/** Normalize a detected period into a stable display label, e.g. "FY 2023". */
function periodLabel(year: string): string {
  return `FY ${year}`
}

/**
 * Pull the period/column labels out of a line, in left-to-right order. Handles
 * bare years (2023), FY-prefixed years, and quarters (Q1 2023). Returns the
 * de-duplicated labels; an empty array means no period was found.
 */
export function detectPeriods(line: string): string[] {
  const labels: string[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  const quarter = new RegExp(QUARTER_RE)
  while ((m = quarter.exec(line)) !== null) {
    const label = `Q${m[1]} ${m[2]}`
    if (!seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }

  const years = new RegExp(YEAR_TOKEN_RE)
  while ((m = years.exec(line)) !== null) {
    const label = periodLabel(m[1])
    // Skip a year already swallowed by a quarter label.
    if (labels.some((l) => l.endsWith(m![1]))) continue
    if (!seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }

  return labels
}

const HEADER_CONNECTIVE_RE = new RegExp(
  `\\b(?:fy|q[1-4]|year|years|ended|ending|end|as|at|of|the|for|period|periods|months?|note|notes|column|${MONTHS})\\b`,
  'gi',
)

/**
 * Whether a line is a period/column *header* (e.g. "2023   2022" or "for the
 * years ended 31 December 2023 and 2022") rather than a data row. True when it
 * carries at least one period and almost no other prose once period tokens and
 * connective words are removed.
 */
export function looksLikePeriodHeader(line: string): boolean {
  const periods = detectPeriods(line)
  if (periods.length === 0) return false
  const residual = line
    .replace(QUARTER_RE, ' ')
    .replace(YEAR_TOKEN_RE, ' ')
    .replace(HEADER_CONNECTIVE_RE, ' ')
    .replace(/[^A-Za-z]+/g, '')
  // A genuine header has little leftover alphabetic prose.
  return residual.length <= 6
}

const SCALE_RE = /\b(thousand|thousands|million|millions|billion|billions|hundreds?)\b/i
const CURRENCY_WORD_RE =
  /\b(EUR|USD|GBP|SEK|NOK|DKK|JPY|CHF|CAD|AUD|euros?|dollars?|pounds?|kroner|krona|kronor)\b/i
const CURRENCY_SYMBOL: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' }
const CURRENCY_CODE_000_RE = /\b([A-Z]{3})\s*['’]?\s*0{3}\b/

function normalizeCurrency(token: string): string {
  const upper = token.toUpperCase()
  if (/^EUR|EURO/.test(upper)) return 'EUR'
  if (/^USD|DOLLAR/.test(upper)) return 'USD'
  if (/^GBP|POUND/.test(upper)) return 'GBP'
  if (/^(SEK|NOK|DKK|KRON|KRONOR|KRONA|KRONER)/.test(upper)) return upper.slice(0, 3)
  return upper.slice(0, 3)
}

function normalizeScale(token: string): string {
  const lower = token.toLowerCase()
  if (lower.startsWith('thousand')) return 'thousands'
  if (lower.startsWith('million')) return 'millions'
  if (lower.startsWith('billion')) return 'billions'
  return 'units'
}

/**
 * Detect a unit/currency caption such as "(in thousands of EUR)", "EUR'000" or
 * "Amounts in USD millions". Returns whatever could be found; either field may
 * be absent.
 */
export function detectUnitCurrency(line: string): UnitCurrency {
  const result: UnitCurrency = {}

  const code000 = line.match(CURRENCY_CODE_000_RE)
  if (code000) {
    result.currency = normalizeCurrency(code000[1])
    result.unit = `${result.currency} thousands`
    return result
  }

  let scale: string | undefined
  const scaleMatch = line.match(SCALE_RE)
  if (scaleMatch) scale = normalizeScale(scaleMatch[1])

  let currency: string | undefined
  const word = line.match(CURRENCY_WORD_RE)
  if (word) currency = normalizeCurrency(word[1])
  if (!currency) {
    const symbol = Object.keys(CURRENCY_SYMBOL).find((sym) => line.includes(sym))
    if (symbol) currency = CURRENCY_SYMBOL[symbol]
  }

  if (currency) result.currency = currency
  if (scale && currency) result.unit = `${currency} ${scale}`
  else if (scale) result.unit = scale
  else if (currency) result.unit = currency
  return result
}
