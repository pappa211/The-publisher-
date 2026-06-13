/**
 * Pure, filter-aware aggregation helpers shared by every interactive view.
 *
 * These work on the raw `CsvRow[]` so the report's charts and summaries can all
 * recompute against the *filtered* dataset, keeping the report plan coherently
 * applied as the user drills in. Nothing here knows anything about a business
 * domain — it only groups, sums, counts and buckets generic columns.
 */
import type { Aggregate, CsvRow, Filter } from '../types'
import { isMissing, parseDate, parseNumber } from './inferTypes'

/** Label used for missing values when they form their own group. */
export const EMPTY_LABEL = '(empty)'

/** Internal running accumulator for an aggregated group. */
interface Acc {
  sum: number
  measureCount: number
  count: number
}

function emptyAcc(): Acc {
  return { sum: 0, measureCount: 0, count: 0 }
}

function addToAcc(acc: Acc, row: CsvRow, measure: string | null): void {
  acc.count += 1
  if (measure) {
    const n = parseNumber(row[measure] ?? '')
    if (n !== null) {
      acc.sum += n
      acc.measureCount += 1
    }
  }
}

/** Resolve an accumulator down to a single display value for an aggregate. */
function display(acc: Acc, measure: string | null, agg: Aggregate): number {
  if (!measure || agg === 'count') return acc.count
  if (agg === 'sum') return acc.sum
  return acc.measureCount === 0 ? 0 : acc.sum / acc.measureCount
}

/** The category key for a row on a dimension (missing → EMPTY_LABEL). */
function dimKey(row: CsvRow, dim: string): string {
  const raw = row[dim]
  return isMissing(raw) ? EMPTY_LABEL : raw.trim()
}

/** Apply a set of equality filters to the rows (AND across filters). */
export function applyFilters(rows: CsvRow[], filters: Filter[]): CsvRow[] {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((f) => {
      const raw = row[f.column]
      const value = isMissing(raw) ? EMPTY_LABEL : raw.trim()
      return value === f.value
    }),
  )
}

export interface GroupResult {
  value: string
  /** The aggregated measure (or row count when no measure is selected). */
  total: number
  /** Raw row count in the group (always available). */
  count: number
}

/**
 * Group rows by a dimension and aggregate a measure (or count). Returns the
 * top `limit` groups by value, folding the remainder into a "+ N more" bucket.
 */
export function groupBreakdown(
  rows: CsvRow[],
  dimension: string,
  measure: string | null,
  agg: Aggregate,
  limit = 8,
): GroupResult[] {
  const groups = new Map<string, Acc>()
  for (const row of rows) {
    const key = dimKey(row, dimension)
    let acc = groups.get(key)
    if (!acc) {
      acc = emptyAcc()
      groups.set(key, acc)
    }
    addToAcc(acc, row, measure)
  }

  const entries = [...groups.entries()]
  entries.sort((a, b) => display(b[1], measure, agg) - display(a[1], measure, agg))

  if (entries.length <= limit) {
    return entries.map(([value, acc]) => ({ value, total: display(acc, measure, agg), count: acc.count }))
  }

  const head = entries.slice(0, limit)
  const tail = entries.slice(limit)
  const rest = tail.reduce<Acc>((acc, [, g]) => {
    acc.sum += g.sum
    acc.measureCount += g.measureCount
    acc.count += g.count
    return acc
  }, emptyAcc())

  const out: GroupResult[] = head.map(([value, acc]) => ({
    value,
    total: display(acc, measure, agg),
    count: acc.count,
  }))
  out.push({ value: `+ ${tail.length} more`, total: display(rest, measure, agg), count: rest.count })
  return out
}

export interface TimePoint {
  label: string
  ts: number
  value: number
}

type Granularity = 'day' | 'month' | 'year'

function chooseGranularity(spanMs: number): Granularity {
  const day = 86_400_000
  if (spanMs <= 60 * day) return 'day'
  if (spanMs <= 1100 * day) return 'month' // ~3 years
  return 'year'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function bucketKey(ts: number, gran: Granularity): { key: string; sortTs: number } {
  const d = new Date(ts)
  const y = d.getUTCFullYear()
  if (gran === 'year') return { key: String(y), sortTs: Date.UTC(y, 0, 1) }
  const m = d.getUTCMonth()
  if (gran === 'month') return { key: `${y}-${pad2(m + 1)}`, sortTs: Date.UTC(y, m, 1) }
  const day = d.getUTCDate()
  return { key: `${y}-${pad2(m + 1)}-${pad2(day)}`, sortTs: Date.UTC(y, m, day) }
}

/**
 * Bucket rows by a temporal column at an automatically chosen granularity and
 * aggregate a measure (or count) within each bucket.
 */
export function timeSeries(
  rows: CsvRow[],
  timeColumn: string,
  measure: string | null,
  agg: Aggregate,
): TimePoint[] {
  const parsed: { ts: number; row: CsvRow }[] = []
  for (const row of rows) {
    const ts = parseDate(row[timeColumn] ?? '')
    if (ts !== null) parsed.push({ ts, row })
  }
  if (parsed.length === 0) return []

  let min = Infinity
  let max = -Infinity
  for (const p of parsed) {
    if (p.ts < min) min = p.ts
    if (p.ts > max) max = p.ts
  }
  const gran = chooseGranularity(max - min)

  const buckets = new Map<string, Acc & { sortTs: number }>()
  for (const { ts, row } of parsed) {
    const { key, sortTs } = bucketKey(ts, gran)
    let acc = buckets.get(key)
    if (!acc) {
      acc = { ...emptyAcc(), sortTs }
      buckets.set(key, acc)
    }
    addToAcc(acc, row, measure)
  }

  return [...buckets.entries()]
    .map(([label, acc]) => ({ label, ts: acc.sortTs, value: display(acc, measure, agg) }))
    .sort((a, b) => a.ts - b.ts)
}

/** Extract the parsable numeric values of a column from the given rows. */
export function numericColumnValues(rows: CsvRow[], column: string): number[] {
  const out: number[] = []
  for (const row of rows) {
    const n = parseNumber(row[column] ?? '')
    if (n !== null) out.push(n)
  }
  return out
}

export interface MeasureSummary {
  count: number
  sum: number
  mean: number
  min: number
  max: number
}

/** Summary statistics for a measure over the given (filtered) rows. */
export function measureSummary(rows: CsvRow[], column: string): MeasureSummary {
  const values = numericColumnValues(rows, column)
  if (values.length === 0) return { count: 0, sum: 0, mean: 0, min: 0, max: 0 }
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  return { count: values.length, sum, mean: sum / values.length, min, max }
}

export interface CrossTab {
  rowKeys: string[]
  colKeys: string[]
  /** matrix[r][c] — aggregated value for that cell. */
  matrix: number[][]
  rowTotals: number[]
  colTotals: number[]
  max: number
  truncatedRows: number
  truncatedCols: number
}

function topKeys(rows: CsvRow[], dim: string, limit: number): { keys: string[]; truncated: number } {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = dimKey(row, dim)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return { keys: sorted.slice(0, limit).map((e) => e[0]), truncated: Math.max(0, sorted.length - limit) }
}

/**
 * Build a two-dimensional pivot of `rowDim` × `colDim`, aggregating a measure
 * (or count) per cell. Both axes are capped at `limit` most-frequent values.
 */
export function crossTabulate(
  rows: CsvRow[],
  rowDim: string,
  colDim: string,
  measure: string | null,
  agg: Aggregate,
  limit = 6,
): CrossTab {
  const { keys: rowKeys, truncated: truncatedRows } = topKeys(rows, rowDim, limit)
  const { keys: colKeys, truncated: truncatedCols } = topKeys(rows, colDim, limit)
  const rowIndex = new Map(rowKeys.map((k, i) => [k, i]))
  const colIndex = new Map(colKeys.map((k, i) => [k, i]))

  const cells: Acc[][] = rowKeys.map(() => colKeys.map(() => emptyAcc()))
  for (const row of rows) {
    const r = rowIndex.get(dimKey(row, rowDim))
    const c = colIndex.get(dimKey(row, colDim))
    if (r === undefined || c === undefined) continue
    addToAcc(cells[r][c], row, measure)
  }

  let max = 0
  const matrix = cells.map((rowCells) =>
    rowCells.map((acc) => {
      const v = display(acc, measure, agg)
      if (v > max) max = v
      return v
    }),
  )
  const rowTotals = matrix.map((r) => r.reduce((a, b) => a + b, 0))
  const colTotals = colKeys.map((_, c) => matrix.reduce((a, r) => a + r[c], 0))

  return { rowKeys, colKeys, matrix, rowTotals, colTotals, max, truncatedRows, truncatedCols }
}
