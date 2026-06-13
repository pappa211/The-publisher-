/**
 * Data profiling: turn raw columns into `ColumnProfile` objects with
 * completeness, cardinality, summary stats, histograms and category counts.
 */
import type {
  CategoryCount,
  ColumnProfile,
  CsvRow,
  HistogramBin,
  InferredType,
  NumericStats,
} from '../types'
import { inferColumnType, isMissing, isNumericType, parseDate, parseNumber } from './inferTypes'

/** Max distinct categories to surface in a breakdown before bucketing. */
const MAX_TOP_VALUES = 8
/** Target number of histogram buckets. */
const HISTOGRAM_BINS = 12

function computeNumericStats(nums: number[]): NumericStats {
  const sorted = [...nums].sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((acc, x) => acc + x, 0)
  const mean = sum / n
  const variance = sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / n
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2]

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median,
    stdDev: Math.sqrt(variance),
  }
}

function buildHistogram(nums: number[], stats: NumericStats): HistogramBin[] {
  const { min, max } = stats
  // Degenerate range: a single bucket holding everything.
  if (min === max) {
    return [{ start: min, end: max, count: nums.length, label: formatBinLabel(min, max) }]
  }

  const binCount = Math.min(HISTOGRAM_BINS, Math.max(1, Math.ceil(Math.sqrt(nums.length))))
  const width = (max - min) / binCount
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * width
    const end = i === binCount - 1 ? max : start + width
    return { start, end, count: 0, label: formatBinLabel(start, end) }
  })

  for (const value of nums) {
    let idx = Math.floor((value - min) / width)
    if (idx >= binCount) idx = binCount - 1 // clamp the max value into the last bin
    if (idx < 0) idx = 0
    bins[idx].count++
  }
  return bins
}

function formatBinLabel(start: number, end: number): string {
  const fmt = (n: number) =>
    Math.abs(n) >= 1000 || Number.isInteger(n)
      ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${fmt(start)} – ${fmt(end)}`
}

function computeTopValues(values: string[]): CategoryCount[] {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const v = raw.trim()
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const sorted = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)

  if (sorted.length <= MAX_TOP_VALUES) return sorted

  const top = sorted.slice(0, MAX_TOP_VALUES)
  const otherCount = sorted.slice(MAX_TOP_VALUES).reduce((acc, c) => acc + c.count, 0)
  top.push({ value: `+ ${sorted.length - MAX_TOP_VALUES} more`, count: otherCount })
  return top
}

/** Build a profile for a single column from its raw values. */
export function profileColumn(
  name: string,
  index: number,
  values: string[],
  inferredType: InferredType,
): ColumnProfile {
  const totalCount = values.length
  const filledValues = values.filter((v) => !isMissing(v))
  const filledCount = filledValues.length
  const missingCount = totalCount - filledCount
  const uniqueCount = new Set(filledValues.map((v) => v.trim())).size

  const profile: ColumnProfile = {
    name,
    index,
    inferredType,
    totalCount,
    filledCount,
    missingCount,
    missingPct: totalCount === 0 ? 0 : (missingCount / totalCount) * 100,
    uniqueCount,
  }

  if (isNumericType(inferredType)) {
    const nums = filledValues
      .map(parseNumber)
      .filter((n): n is number => n !== null)
    if (nums.length > 0) {
      profile.numericStats = computeNumericStats(nums)
      profile.histogram = buildHistogram(nums, profile.numericStats)
    }
  } else if (inferredType === 'date') {
    const timestamps = filledValues
      .map(parseDate)
      .filter((t): t is number => t !== null)
    if (timestamps.length > 0) {
      profile.dateRange = {
        min: new Date(Math.min(...timestamps)).toISOString().slice(0, 10),
        max: new Date(Math.max(...timestamps)).toISOString().slice(0, 10),
      }
    }
    profile.topValues = computeTopValues(filledValues)
  } else {
    profile.topValues = computeTopValues(filledValues)
  }

  return profile
}

/**
 * Profile every column of a dataset. Inference samples up to `sampleLimit`
 * rows for speed on large files, but completeness/stats use all rows.
 */
export function profileColumns(
  columns: string[],
  rows: CsvRow[],
  sampleLimit = 5000,
): ColumnProfile[] {
  return columns.map((name, index) => {
    const values = rows.map((row) => row[name] ?? '')
    const sample = values.length > sampleLimit ? values.slice(0, sampleLimit) : values
    const inferredType = inferColumnType(sample)
    return profileColumn(name, index, values, inferredType)
  })
}
