/**
 * Small, dependency-free formatting helpers shared across the UI.
 */
import type { InferredType } from '../types'

/** Human-readable file size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[exponent]}`
}

/** Compact integer formatting, e.g. 1234567 -> "1,234,567". */
export function formatInt(value: number): string {
  return Math.round(value).toLocaleString()
}

/** Short numeric formatting for stats, trimming noisy decimals. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return value.toLocaleString()
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 4
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** Percentage with a single decimal, e.g. 12.34 -> "12.3%". */
export function formatPercent(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

/** Truncate long strings for display in table cells. */
export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** Human-friendly label for an inferred type. */
export function typeLabel(type: InferredType): string {
  switch (type) {
    case 'integer':
      return 'Integer'
    case 'number':
      return 'Number'
    case 'boolean':
      return 'Boolean'
    case 'date':
      return 'Date'
    default:
      return 'Text'
  }
}

/** A short emoji-free glyph used in the type badge. */
export function typeGlyph(type: InferredType): string {
  switch (type) {
    case 'integer':
    case 'number':
      return '#'
    case 'boolean':
      return '◧'
    case 'date':
      return '⌚'
    default:
      return 'A'
  }
}
