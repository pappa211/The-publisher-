/**
 * Shared domain types for The Publisher.
 *
 * The data flow is: raw CSV text -> parsed string rows -> inferred column
 * types -> per-column profiles -> a single `Dataset` object that the UI reads.
 */

/** The data types we attempt to infer for each column. */
export type InferredType = 'integer' | 'number' | 'boolean' | 'date' | 'string'

/**
 * A single parsed row. Values are kept as raw strings and parsed on demand so
 * that the original file content is never lossily coerced. Missing cells are
 * represented as empty strings.
 */
export type CsvRow = Record<string, string>

/** Summary statistics for a numeric column. */
export interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  /** Population standard deviation. */
  stdDev: number
}

/** A value and how many times it occurs (used for categorical breakdowns). */
export interface CategoryCount {
  value: string
  count: number
}

/** A single bucket in a numeric histogram. */
export interface HistogramBin {
  start: number
  end: number
  count: number
  label: string
}

/** The full profile of one column: type, completeness, and distribution. */
export interface ColumnProfile {
  name: string
  index: number
  inferredType: InferredType
  /** Total number of rows in the dataset. */
  totalCount: number
  /** Cells that are empty / missing. */
  missingCount: number
  /** Cells that have a value. */
  filledCount: number
  /** Missing cells as a percentage (0-100). */
  missingPct: number
  /** Distinct non-missing values. */
  uniqueCount: number

  /** Present for `integer` / `number` columns. */
  numericStats?: NumericStats
  histogram?: HistogramBin[]

  /** Present for `string` / `boolean` / low-cardinality columns. */
  topValues?: CategoryCount[]

  /** Present for `date` columns (ISO-ish strings from the source). */
  dateRange?: { min: string; max: string }
}

/** A non-fatal issue encountered while parsing. */
export interface ParseIssue {
  message: string
  row?: number
}

/** The fully parsed + profiled dataset that drives the workspace UI. */
export interface Dataset {
  fileName: string
  fileSize: number
  rowCount: number
  columnCount: number
  columns: string[]
  rows: CsvRow[]
  profiles: ColumnProfile[]
  issues: ParseIssue[]
  parsedAt: number
}

/** Top-level application state machine. */
export type AppStatus = 'idle' | 'parsing' | 'ready' | 'error'
