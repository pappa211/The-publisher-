import type { FinancialPeriod, FinancialScale } from '../types'

export interface FinancialNumberToken {
  raw: string
  value: number | null
  index: number
  end: number
}

export interface CurrencyScaleDetection {
  currency?: string
  scale: FinancialScale
  confidence: number
}

const NUMBER_RE = /[-−–]?\(?\d[\d\s.,'\u00a0]*\)?/g
const YEAR_RE = /\b(?:FY\s*)?((?:19|20)\d{2})\b/gi

export function periodId(year: number): string {
  return `FY ${year}`
}

export function detectPeriods(text: string): FinancialPeriod[] {
  const years = new Set<number>()
  for (const match of text.matchAll(YEAR_RE)) {
    const year = Number(match[1])
    if (year >= 1900 && year <= 2200) years.add(year)
  }

  return [...years]
    .sort((a, b) => b - a)
    .map((year) => ({ id: periodId(year), label: periodId(year), year }))
}

export function periodFromValue(value: string): FinancialPeriod | null {
  const match = value.match(/(?:FY\s*)?((?:19|20)\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  return { id: periodId(year), label: periodId(year), year }
}

export function detectCurrencyAndScale(text: string): CurrencyScaleDetection {
  const currencyMatch = text.match(/\b(NOK|EUR|USD|GBP|SEK|DKK)\b|[$€£]/i)
  const symbol = currencyMatch?.[0]
  const currency = symbol === '$'
    ? 'USD'
    : symbol === '€'
      ? 'EUR'
      : symbol === '£'
        ? 'GBP'
        : symbol?.toUpperCase()

  const lower = text.toLowerCase()
  let scale: FinancialScale = 'unknown'
  if (/\b(amounts?\s+in|in)\b.{0,40}\b(million|millions|mn|m)\b/.test(lower)) {
    scale = 'millions'
  } else if (/\b(amounts?\s+in|in)\b.{0,40}\b(thousand|thousands|000|tusen)\b/.test(lower)) {
    scale = 'thousands'
  } else if (/\b(?:nok|eur|usd|gbp|sek|dkk)\s*(?:'|’)?000\b/i.test(text)) {
    scale = 'thousands'
  } else if (/\b(?:nok|eur|usd|gbp|sek|dkk)\s*(?:m|mn|million)\b/i.test(text)) {
    scale = 'millions'
  }

  return {
    currency,
    scale,
    confidence: (currency ? 0.45 : 0) + (scale !== 'unknown' ? 0.45 : 0),
  }
}

export function parseFinancialNumber(raw: string): number | null {
  let value = raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/[−–]/g, '-')
    .replace(/[A-Za-z$€£]/g, '')
    .trim()

  if (!value || /^[-–—]+$/.test(value)) return null

  let negative = false
  const parenthesized = value.match(/^\((.*)\)$/)
  if (parenthesized) {
    negative = true
    value = parenthesized[1].trim()
  }
  if (value.startsWith('-')) {
    negative = true
    value = value.slice(1).trim()
  }

  value = value.replace(/['\s]/g, '')
  if (!/\d/.test(value)) return null

  const comma = value.lastIndexOf(',')
  const dot = value.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    value = comma > dot
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '')
  } else if (comma >= 0) {
    value = /,\d{1,2}$/.test(value) ? value.replace(',', '.') : value.replace(/,/g, '')
  } else if ((value.match(/\./g) ?? []).length > 1) {
    value = value.replace(/\./g, '')
  } else if (/\.\d{3}$/.test(value)) {
    value = value.replace(/\./g, '')
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}

export function extractFinancialNumbers(line: string): FinancialNumberToken[] {
  const tokens: FinancialNumberToken[] = []
  for (const match of line.matchAll(NUMBER_RE)) {
    if (match.index == null) continue
    const raw = match[0]
    const value = parseFinancialNumber(raw)
    tokens.push({
      raw,
      value,
      index: match.index,
      end: match.index + raw.length,
    })
  }
  return tokens
}

export function looksLikeYearToken(token: FinancialNumberToken, periods: FinancialPeriod[]): boolean {
  const raw = token.raw.replace(/[^\d]/g, '')
  if (!/^(?:19|20)\d{2}$/.test(raw)) return false
  return periods.some((period) => period.year === Number(raw))
}

