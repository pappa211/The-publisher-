/**
 * Type inference and value parsing helpers.
 *
 * These are intentionally conservative: we only classify a column as a richer
 * type (number/date/boolean) when the overwhelming majority of its non-missing
 * values match, otherwise we fall back to `string`. Order matters — numbers are
 * checked before dates so that bare years like "2020" are not read as dates.
 */
import type { InferredType } from '../types'

/** Tokens (case-insensitive) that we treat as a missing / empty value. */
const MISSING_TOKENS = new Set(['', 'na', 'n/a', 'null', 'nil', 'nan', '-', '--'])

/** Tokens that count as booleans. 0/1 are deliberately excluded so numeric
 * flag columns keep their useful numeric statistics. */
const BOOLEAN_TRUE = new Set(['true', 'yes'])
const BOOLEAN_FALSE = new Set(['false', 'no'])

/** Matches plain, comma-grouped, decimal, signed and scientific numbers. */
const NUMBER_RE = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][-+]?\d+)?$/
/** Currency symbols we are willing to strip before numeric parsing. */
const CURRENCY_SYMBOL_RE = /[$€£¥]/g
/** Accounting statements often render negatives as `(1,234)`. */
const ACCOUNTING_NEGATIVE_RE = /^\((.*)\)$/

/** Common, unambiguous date shapes. We require one of these before trusting
 * `Date.parse`, which is otherwise far too lenient. */
const DATE_RES: RegExp[] = [
  /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/, // ISO 8601
  /^\d{4}[-/](0?[1-9]|1[0-2])$/, // year-month period, e.g. 2024-01 or 2024/1
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // 1/2/2020 or 01/02/20
  /^\d{1,2}-\d{1,2}-\d{2,4}$/, // 1-2-2020
]

/** Is this raw cell value considered missing? */
export function isMissing(value: string | null | undefined): boolean {
  if (value == null) return true
  return MISSING_TOKENS.has(value.trim().toLowerCase())
}

/** Parse a numeric cell, or return null if it is not a clean number. */
export function parseNumber(raw: string): number | null {
  let trimmed = raw.trim().replace(/\u00a0/g, ' ')
  if (trimmed === '') return null

  let negative = false
  const accounting = trimmed.match(ACCOUNTING_NEGATIVE_RE)
  if (accounting) {
    negative = true
    trimmed = accounting[1].trim()
  }

  if (trimmed.startsWith('-')) {
    negative = true
    trimmed = trimmed.slice(1).trim()
  } else if (trimmed.startsWith('+')) {
    trimmed = trimmed.slice(1).trim()
  }

  trimmed = trimmed.replace(CURRENCY_SYMBOL_RE, '').replace(/\s+/g, '')
  if (trimmed === '' || !NUMBER_RE.test(trimmed)) return null
  const n = Number(trimmed.replace(/,/g, ''))
  const signed = negative ? -n : n
  return Number.isFinite(signed) ? signed : null
}

/** Parse a boolean cell, or return null. */
export function parseBoolean(raw: string): boolean | null {
  const t = raw.trim().toLowerCase()
  if (BOOLEAN_TRUE.has(t)) return true
  if (BOOLEAN_FALSE.has(t)) return false
  return null
}

/** Parse a date cell into a timestamp (ms), or return null. */
export function parseDate(raw: string): number | null {
  const t = raw.trim()
  if (!DATE_RES.some((re) => re.test(t))) return null
  const ts = Date.parse(t)
  return Number.isNaN(ts) ? null : ts
}

/**
 * Infer the type of a column from its raw string values.
 *
 * A column is `boolean` only if every non-missing value is a boolean token.
 * Numeric / date classification uses a 95% match threshold so a few stray
 * values don't demote an otherwise clean column to text.
 */
export function inferColumnType(values: readonly string[]): InferredType {
  const filled = values.filter((v) => !isMissing(v))
  if (filled.length === 0) return 'string'

  let boolCount = 0
  let numCount = 0
  let intCount = 0
  let dateCount = 0

  for (const value of filled) {
    if (parseBoolean(value) !== null) boolCount++

    const num = parseNumber(value)
    if (num !== null) {
      numCount++
      if (Number.isInteger(num)) intCount++
    } else if (parseDate(value) !== null) {
      dateCount++
    }
  }

  const total = filled.length
  if (boolCount === total) return 'boolean'
  if (numCount / total >= 0.95) return intCount === numCount ? 'integer' : 'number'
  if (dateCount / total >= 0.95) return 'date'
  return 'string'
}

/** Whether a type should be treated as numeric for stats / alignment. */
export function isNumericType(type: InferredType): boolean {
  return type === 'integer' || type === 'number'
}
