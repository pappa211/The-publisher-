import type {
  CsvRow,
  Dataset,
  FinancialDocument,
  FinancialExtractionMode,
  FinancialKeyFigure,
  FinancialLineItem,
  FinancialPageExtraction,
  FinancialPeriod,
  FinancialRawLine,
  FinancialScale,
  FinancialSourceType,
  FinancialStatement,
  FinancialStatementKind,
  FinancialWarning,
} from '../types'
import { parseNumber } from './inferTypes'
import {
  canonicalLabel,
  classifyConcept,
  statementKindFromHeading,
  statementKindFromLabel,
  statementTitle,
} from './financialConcepts'
import {
  detectCurrencyAndScale,
  detectPeriods,
  extractFinancialNumbers,
  looksLikeYearToken,
  periodFromValue,
} from './financialNumberParser'
import { buildFinancialChecks } from './financialChecks'

interface BuildTextDocumentOptions {
  sourceFile: string
  sourceType: FinancialSourceType
  extractionMode: FinancialExtractionMode
  pages: FinancialPageExtraction[]
  ocrAvailable?: boolean
  ocrReason?: string
}

interface BuildStructuredOptions {
  sourceFile: string
  sourceType: FinancialSourceType
  extractionMode: FinancialExtractionMode
  rows: FinancialLineItem[]
  rawLines: FinancialRawLine[]
  pages?: FinancialPageExtraction[]
  currency?: string
  scale?: FinancialScale
  keepDocument?: boolean
}

const TABLE_LABEL_RE = /(line item|account|description|name|label|metric|post|konto)/i
const TABLE_PERIOD_RE = /(period|year|date|fy|month)/i
const TABLE_VALUE_RE = /(amount|balance|value|closing|debit|credit|actual|202\d|201\d)/i

function warning(message: string, severity: FinancialWarning['severity'] = 'warning', sourcePage?: number): FinancialWarning {
  return { message, severity, sourcePage }
}

function cleanLabel(label: string): string {
  return label
    .replace(/\bnote\s+\d+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.\-:;,\s]+$/g, '')
    .trim()
}

function lineId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`
}

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function pageText(page: FinancialPageExtraction): string {
  return page.text || ''
}

function choosePeriods(text: string, rows: FinancialLineItem[] = []): FinancialPeriod[] {
  const periods = detectPeriods(text)
  const fromRows = new Map(periods.map((period) => [period.id, period]))
  for (const row of rows) {
    for (const periodId of Object.keys(row.values)) {
      if (fromRows.has(periodId)) continue
      const period = periodFromValue(periodId)
      fromRows.set(periodId, period ?? { id: periodId, label: periodId })
    }
  }
  return [...fromRows.values()].sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function statementConfidence(rows: FinancialLineItem[]): number {
  if (rows.length === 0) return 0
  return Math.min(0.96, average(rows.map((row) => row.confidence)) + Math.min(0.12, rows.length / 100))
}

function normalizeValueForStatement(value: number, label: string, kind: FinancialStatementKind): number {
  if (kind !== 'balance_sheet') return value
  if (/liabilit|equity|payable|borrowings?|debt|gjeld|egenkapital/i.test(label)) {
    return Math.abs(value)
  }
  return value
}

function extractionQuality(pages: FinancialPageExtraction[], rowCount: number, periodCount: number): number {
  const pageQuality = pages.length ? average(pages.map((page) => page.quality)) : 0.45
  return Math.min(0.96, pageQuality * 0.45 + Math.min(0.3, rowCount / 80) + Math.min(0.25, periodCount * 0.08))
}

function buildStatements(rows: FinancialLineItem[], periods: FinancialPeriod[]): FinancialStatement[] {
  const kinds: FinancialStatementKind[] = ['income_statement', 'balance_sheet', 'cash_flow', 'unknown']
  return kinds.map((kind) => {
    const statementRows = rows.filter((row) => {
      if (kind === 'unknown') return !['income_statement', 'balance_sheet', 'cash_flow'].includes(statementKindFromLabel(row.label))
      return statementKindFromLabel(row.label) === kind || row.id.startsWith(`${kind}:`)
    })
    const sourcePages = [...new Set(statementRows.map((row) => row.sourcePage).filter((page): page is number => page != null))].sort((a, b) => a - b)
    return {
      kind,
      title: statementTitle(kind),
      sourcePages,
      periods: periods.filter((period) => statementRows.some((row) => row.values[period.id] != null)),
      rows: statementRows,
      confidence: statementConfidence(statementRows),
      warnings: statementRows.length === 0 ? [warning('No rows were confidently assigned to this statement.', 'info')] : [],
    }
  }).filter((statement) => statement.rows.length > 0 || statement.kind !== 'unknown')
}

function keyFigures(rows: FinancialLineItem[], periods: FinancialPeriod[]): FinancialKeyFigure[] {
  const byConcept = new Map<string, FinancialLineItem[]>()
  for (const row of rows) {
    if (!row.canonicalConcept) continue
    const list = byConcept.get(row.canonicalConcept) ?? []
    list.push(row)
    byConcept.set(row.canonicalConcept, list)
  }

  return [...byConcept.entries()]
    .map(([concept, conceptRows]) => {
      const best = [...conceptRows].sort((a, b) => b.confidence - a.confidence)[0]
      const values: Record<string, number | null> = {}
      for (const period of periods) {
        values[period.id] = best.values[period.id] ?? null
      }
      return {
        label: canonicalLabel(concept),
        canonicalConcept: concept,
        values,
        statementKind: statementKindFromLabel(best.label),
        sourcePage: best.sourcePage,
        confidence: best.confidence,
        warning: best.warnings[0]?.message,
      }
    })
    .sort((a, b) => {
      const order = [
        'revenue',
        'gross_profit',
        'operating_profit',
        'profit_before_tax',
        'net_income',
        'total_assets',
        'total_equity',
        'total_liabilities',
        'cash_and_cash_equivalents',
        'operating_cash_flow',
      ]
      const ai = order.includes(a.canonicalConcept) ? order.indexOf(a.canonicalConcept) : order.length
      const bi = order.includes(b.canonicalConcept) ? order.indexOf(b.canonicalConcept) : order.length
      return ai - bi
    })
}

function buildDocumentFromStructured(options: BuildStructuredOptions): FinancialDocument | undefined {
  const text = [
    ...options.rawLines.map((line) => line.text),
    ...options.rows.flatMap((row) => [row.label, row.rawText]),
  ].join('\n')
  const periods = choosePeriods(text, options.rows)
  const currencyScale = detectCurrencyAndScale(text)
  const currency = options.currency ?? currencyScale.currency
  const scale = options.scale ?? currencyScale.scale
  const rows = options.rows.map((row) => ({
    ...row,
    currency: row.currency ?? currency,
    scale: row.scale ?? scale,
  }))
  const statements = buildStatements(rows, periods)
  const figures = keyFigures(rows, periods)
  const confidence = extractionQuality(options.pages ?? [], rows.length, periods.length)
  const checks = buildFinancialChecks(statements, periods, figures, confidence)
  const warnings: FinancialWarning[] = []

  if (!currency) warnings.push(warning('Currency was not confidently detected.', 'info'))
  if (scale === 'unknown') warnings.push(warning('Scale was not confidently detected.', 'info'))
  if (rows.length > 0 && periods.length === 0) warnings.push(warning('No reporting period header was confidently detected.'))

  const shouldKeep = options.keepDocument || rows.length >= 4 || figures.length >= 2
  if (!shouldKeep) return undefined

  return {
    sourceFile: options.sourceFile,
    sourceType: options.sourceType,
    extractionMode: options.extractionMode,
    confidence,
    pages: options.pages ?? [],
    detectedPeriods: periods,
    currency,
    scale,
    statements,
    keyFigures: figures,
    checks,
    warnings,
    unparsedLines: options.rawLines.filter((line) => !line.parsed),
    rawLines: options.rawLines,
    pageCount: options.pages?.length,
  }
}

function parseFinancialTextLine(
  line: string,
  index: number,
  pageNumber: number | undefined,
  extractionMode: FinancialExtractionMode,
  currentKind: FinancialStatementKind,
  periods: FinancialPeriod[],
): { item?: FinancialLineItem; raw: FinancialRawLine } {
  const rawBase = {
    id: lineId('line', index),
    text: line,
    sourcePage: pageNumber,
    extractionMode,
    statementKind: currentKind,
    parsed: false,
    confidence: 0.25,
  }

  const numberTokens = extractFinancialNumbers(line)
  const valueTokens = numberTokens.filter((token) => token.value !== null && !looksLikeYearToken(token, periods))
  if (valueTokens.length === 0) return { raw: rawBase }

  let usableTokens = valueTokens
  if (periods.length > 0 && valueTokens.length === periods.length + 1) {
    const first = valueTokens[0].value
    if (first != null && Number.isInteger(first) && Math.abs(first) <= 99) usableTokens = valueTokens.slice(1)
  }

  const firstValue = usableTokens[0]
  const label = cleanLabel(line.slice(0, firstValue.index))
  if (label.length < 3 || /^\d+$/.test(label)) return { raw: rawBase }

  const inferredKind = currentKind !== 'unknown' && currentKind !== 'notes'
    ? currentKind
    : statementKindFromLabel(label)
  if (inferredKind === 'notes') return { raw: rawBase }

  const concept = classifyConcept(label)
  const values: Record<string, number | null> = {}
  const targetPeriods = periods.length > 0 ? periods : [{ id: 'Current period', label: 'Current period' }]
  usableTokens.slice(0, targetPeriods.length).forEach((token, tokenIndex) => {
    const period = targetPeriods[tokenIndex]
    values[period.id] = token.value == null
      ? null
      : normalizeValueForStatement(token.value, label, inferredKind)
  })

  const confidence = Math.min(
    0.94,
    0.38 +
      (currentKind !== 'unknown' ? 0.16 : 0) +
      (concept ? 0.2 : 0) +
      Math.min(0.14, usableTokens.length * 0.05) +
      (pageNumber ? 0.04 : 0),
  )

  const item: FinancialLineItem = {
    id: `${inferredKind}:${index}`,
    label,
    canonicalConcept: concept?.concept,
    values,
    sourcePage: pageNumber,
    extractionMode,
    rawText: line,
    confidence,
    warnings: extractionMode === 'ocr'
      ? [warning('Parsed from OCR text; numbers may need review.', 'info', pageNumber)]
      : [],
  }

  return {
    item,
    raw: {
      ...rawBase,
      statementKind: inferredKind,
      parsed: true,
      confidence,
    },
  }
}

export function buildFinancialDocumentFromText(options: BuildTextDocumentOptions): FinancialDocument {
  const fullText = options.pages.map(pageText).join('\n')
  const periods = detectPeriods(fullText)
  const rows: FinancialLineItem[] = []
  const rawLines: FinancialRawLine[] = []
  let currentKind: FinancialStatementKind = 'unknown'
  let lineIndex = 0

  for (const page of options.pages) {
    for (const line of nonEmptyLines(page.text)) {
      const headingKind = statementKindFromHeading(line)
      if (headingKind !== 'unknown') {
        currentKind = headingKind
        rawLines.push({
          id: lineId('heading', lineIndex++),
          text: line,
          sourcePage: page.pageNumber,
          extractionMode: page.extractionMode,
          statementKind: headingKind,
          parsed: false,
          confidence: 0.75,
        })
        continue
      }

      const parsed = parseFinancialTextLine(
        line,
        lineIndex++,
        page.pageNumber,
        page.extractionMode,
        currentKind,
        periods,
      )
      rawLines.push(parsed.raw)
      if (parsed.item) rows.push(parsed.item)
    }
  }

  return buildDocumentFromStructured({
    sourceFile: options.sourceFile,
    sourceType: options.sourceType,
    extractionMode: options.extractionMode,
    rows,
    rawLines,
    pages: options.pages,
    keepDocument: true,
  }) ?? {
    sourceFile: options.sourceFile,
    sourceType: options.sourceType,
    extractionMode: options.extractionMode,
    confidence: 0,
    pages: options.pages,
    detectedPeriods: periods,
    scale: 'unknown',
    statements: [],
    keyFigures: [],
    checks: [],
    warnings: [warning('No financial statement rows could be reconstructed.', 'warning')],
    unparsedLines: rawLines,
    rawLines,
    pageCount: options.pages.length,
    ocrAvailable: options.ocrAvailable,
    ocrReason: options.ocrReason,
  }
}

function normalizeHeader(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function firstMatchingColumn(columns: string[], pattern: RegExp): string | undefined {
  return columns.find((column) => pattern.test(normalizeHeader(column)))
}

function datasetRawLines(dataset: Dataset, extractionMode: FinancialExtractionMode): FinancialRawLine[] {
  return dataset.rows.slice(0, 2000).map((row, index) => ({
    id: lineId('row', index),
    text: dataset.columns.map((column) => row[column]).filter(Boolean).join(' | '),
    extractionMode,
    statementKind: 'unknown',
    parsed: false,
    confidence: 0.35,
  }))
}

function fromNormalizedFinancialRows(
  dataset: Dataset,
  sourceType: FinancialSourceType,
  extractionMode: FinancialExtractionMode,
): FinancialDocument | undefined {
  if (!dataset.columns.includes('Line Item') || !dataset.columns.includes('Period') || !dataset.columns.includes('Amount')) {
    return undefined
  }

  const grouped = new Map<string, FinancialLineItem>()
  dataset.rows.forEach((row) => {
    const label = row['Line Item']?.trim()
    const period = row.Period?.trim()
    const amount = parseNumber(row.Amount ?? '')
    if (!label || !period || amount === null) return
    const statementLabel = row.Statement ?? ''
    const kind = statementKindFromLabel(`${statementLabel} ${label}`)
    const concept = classifyConcept(label)
    const key = `${kind}:${label}:${concept?.concept ?? ''}:${row.Sheet ?? ''}`
    const existing = grouped.get(key)
    const item = existing ?? {
      id: key,
      label,
      canonicalConcept: concept?.concept,
      values: {},
      unit: row.Unit,
      currency: row.Unit,
      scale: 'unknown' as FinancialScale,
      extractionMode,
      rawText: '',
      confidence: 0.82,
      warnings: [],
    }
    item.values[period] = normalizeValueForStatement(amount, label, kind)
    item.rawText = [item.rawText, row.Note, row['Source Row']].filter(Boolean).join(' | ')
    grouped.set(key, item)
  })

  return buildDocumentFromStructured({
    sourceFile: dataset.fileName,
    sourceType,
    extractionMode,
    rows: [...grouped.values()],
    rawLines: datasetRawLines(dataset, extractionMode),
    keepDocument: grouped.size >= 4,
  })
}

function fromPeriodColumns(
  dataset: Dataset,
  sourceType: FinancialSourceType,
  extractionMode: FinancialExtractionMode,
): FinancialDocument | undefined {
  const labelColumn = firstMatchingColumn(dataset.columns, TABLE_LABEL_RE)
  if (!labelColumn) return undefined

  const periodColumns = dataset.columns
    .map((column) => ({ column, period: periodFromValue(column) }))
    .filter((entry): entry is { column: string; period: FinancialPeriod } => entry.period !== null)
  if (periodColumns.length === 0) return undefined

  const rows: FinancialLineItem[] = []
  dataset.rows.forEach((row, index) => {
    const label = row[labelColumn]?.trim()
    if (!label) return
    const values: Record<string, number | null> = {}
    for (const periodColumn of periodColumns) {
      const value = parseNumber(row[periodColumn.column] ?? '')
      values[periodColumn.period.id] = value
    }
    if (Object.values(values).every((value) => value === null)) return
    const kind = statementKindFromLabel(label)
    const concept = classifyConcept(label)
    rows.push({
      id: `table:${index}`,
      label,
      canonicalConcept: concept?.concept,
      values,
      extractionMode,
      rawText: dataset.columns.map((column) => row[column]).filter(Boolean).join(' | '),
      confidence: Math.min(0.92, 0.5 + (kind !== 'unknown' ? 0.18 : 0) + (concept ? 0.16 : 0)),
      warnings: [],
    })
  })

  return buildDocumentFromStructured({
    sourceFile: dataset.fileName,
    sourceType,
    extractionMode,
    rows,
    rawLines: datasetRawLines(dataset, extractionMode),
  })
}

function fromLongFinancialTable(
  dataset: Dataset,
  sourceType: FinancialSourceType,
  extractionMode: FinancialExtractionMode,
): FinancialDocument | undefined {
  const labelColumn = firstMatchingColumn(dataset.columns, TABLE_LABEL_RE)
  const periodColumn = firstMatchingColumn(dataset.columns, TABLE_PERIOD_RE)
  const valueColumn = firstMatchingColumn(dataset.columns, /(balance|amount|value|closing)/i)
    ?? firstMatchingColumn(dataset.columns, TABLE_VALUE_RE)
  if (!labelColumn || !periodColumn || !valueColumn) return undefined

  const grouped = new Map<string, FinancialLineItem>()
  const rawLines = datasetRawLines(dataset, extractionMode)
  dataset.rows.forEach((row, index) => {
    const label = row[labelColumn]?.trim()
    const period = periodFromValue(row[periodColumn] ?? '')
    const amount = parseNumber(row[valueColumn] ?? '')
    if (!label || !period || amount === null) return
    const classText = row[firstMatchingColumn(dataset.columns, /class|type|category/i) ?? ''] ?? ''
    const kind = statementKindFromLabel(`${classText} ${label}`)
    const concept = classifyConcept(label)
    const key = `${kind}:${label}`
    const existing = grouped.get(key)
    const item = existing ?? {
      id: `long:${grouped.size}`,
      label,
      canonicalConcept: concept?.concept,
      values: {},
      extractionMode,
      rawText: '',
      confidence: Math.min(0.9, 0.48 + (kind !== 'unknown' ? 0.18 : 0) + (concept ? 0.16 : 0)),
      warnings: [],
    }
    item.values[period.id] = normalizeValueForStatement(amount, label, kind)
    item.rawText = item.rawText || dataset.columns.map((column) => row[column]).filter(Boolean).join(' | ')
    grouped.set(key, item)
    const rawLine = rawLines[index]
    if (rawLine) rawLine.parsed = true
  })

  return buildDocumentFromStructured({
    sourceFile: dataset.fileName,
    sourceType,
    extractionMode,
    rows: [...grouped.values()],
    rawLines,
  })
}

export function buildFinancialDocumentFromDataset(
  dataset: Dataset,
  sourceType: FinancialSourceType,
  extractionMode: FinancialExtractionMode = 'structured_table',
): FinancialDocument | undefined {
  return (
    fromNormalizedFinancialRows(dataset, sourceType, extractionMode) ??
    fromPeriodColumns(dataset, sourceType, extractionMode) ??
    fromLongFinancialTable(dataset, sourceType, extractionMode)
  )
}

export function financialRowsAsDatasetRows(document: FinancialDocument): CsvRow[] {
  return document.rawLines.map((line) => ({
    Page: line.sourcePage == null ? '' : String(line.sourcePage),
    Mode: line.extractionMode,
    Statement: statementTitle(line.statementKind),
    Parsed: line.parsed ? 'yes' : 'no',
    Confidence: String(Math.round(line.confidence * 100)),
    Text: line.text,
  }))
}
