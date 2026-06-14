/**
 * Client-side spreadsheet parsing built on SheetJS (the `xlsx` package).
 *
 * Workbooks are treated as workbooks, not single-sheet CSV substitutes:
 * every non-empty sheet is inspected. When the workbook looks like financial
 * statements or accounting notes, the sheets are normalized into analyzable
 * financial facts. Otherwise every sheet is merged into one generic table with
 * source-sheet metadata.
 */
import type { Dataset, ParseIssue, WorkbookSheetMeta } from '../types'
import { buildDataset, FileParseError, type RawTable } from './dataset'
import { buildFinancialAnalysis, FINANCIAL_FIELDS } from './financialAnalysis'
import { parseNumber } from './inferTypes'

type SheetRows = unknown[][]

interface ExtractedSheet {
  meta: WorkbookSheetMeta
  fields: string[]
  records: Record<string, unknown>[]
}

interface PeriodColumn {
  index: number
  period: string
}

/**
 * Parse a spreadsheet File into a fully profiled Dataset. Multi-sheet files are
 * fully scanned; financial-statement workbooks are converted into a normalized
 * fact table for professional finance analytics.
 */
export async function parseSpreadsheetFile(file: File): Promise<Dataset> {
  let XLSX: typeof import('xlsx')
  try {
    XLSX = await import('xlsx')
  } catch {
    throw new FileParseError('Could not load the spreadsheet reader. Check your connection and retry.')
  }

  let workbook: import('xlsx').WorkBook
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch {
    throw new FileParseError(
      'That spreadsheet could not be read. It may be password-protected or corrupted.',
    )
  }

  const table = extractWorkbook(XLSX, workbook)
  return buildDataset({ fileName: file.name, fileSize: file.size }, table)
}

function extractWorkbook(XLSX: typeof import('xlsx'), workbook: import('xlsx').WorkBook): RawTable {
  const sheetNames = workbook.SheetNames ?? []
  if (sheetNames.length === 0) {
    throw new FileParseError('The spreadsheet has no sheets.')
  }

  const sheetMetas: WorkbookSheetMeta[] = []
  const genericSheets: ExtractedSheet[] = []
  const financialRecords: Record<string, unknown>[] = []

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name]
    const rows = sheet ? readSheetRows(XLSX, sheet) : []
    const rowCount = rows.length
    const columnCount = countColumns(rows)

    if (rowCount === 0 || columnCount === 0) {
      sheetMetas.push({ name, rowCount, columnCount, importedRows: 0, kind: 'empty' })
      continue
    }

    const financial = extractFinancialSheet(name, rows, rowCount, columnCount)
    if (financial.records.length > 0) {
      financialRecords.push(...financial.records)
      sheetMetas.push(financial.meta)
      continue
    }

    const generic = extractGenericSheet(name, rows, rowCount, columnCount)
    genericSheets.push(generic)
    sheetMetas.push(generic.meta)
  }

  const workbookMeta = {
    sheetCount: sheetNames.length,
    importedSheetCount: sheetMetas.filter((sheet) => sheet.kind !== 'empty').length,
    sheets: sheetMetas,
  }

  const financialAnalysis = buildFinancialAnalysis(financialRecords, sheetMetas)
  if (financialAnalysis && financialAnalysis.confidence >= 0.55) {
    const financialSheetCount = sheetMetas.filter((sheet) => sheet.kind === 'financial-table').length
    return {
      fields: FINANCIAL_FIELDS,
      records: financialRecords,
      issues: workbookIssues(sheetNames.length, [
        `Detected a financial-statement workbook and normalized ${financialRecords.length.toLocaleString()} facts from ${financialSheetCount.toLocaleString()} sheet${financialSheetCount === 1 ? '' : 's'}.`,
      ]),
      workbook: workbookMeta,
      financialAnalysis,
    }
  }

  const generic = mergeGenericSheets(genericSheets)
  return {
    ...generic,
    issues: workbookIssues(sheetNames.length, generic.issues),
    workbook: workbookMeta,
  }
}

function readSheetRows(
  XLSX: typeof import('xlsx'),
  sheet: import('xlsx').WorkSheet,
): SheetRows {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  }).map((row) => (Array.isArray(row) ? row : []))
}

function workbookIssues(sheetCount: number, extra: Array<string | ParseIssue>): ParseIssue[] {
  const issues = extra.map((issue) => (typeof issue === 'string' ? { message: issue } : issue))
  if (sheetCount > 1) {
    issues.unshift({ message: `Processed all ${sheetCount.toLocaleString()} sheets in this workbook.` })
  }
  return issues
}

function countColumns(rows: SheetRows): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0)
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === ''
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return String(value.getFullYear())
  return String(value).trim()
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return null
  return parseNumber(cellText(value))
}

function periodLabel(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2200) {
    return `FY ${value}`
  }
  const text = cellText(value)
  const direct = text.match(/^(?:FY\s*)?((?:19|20)\d{2})$/i)
  if (direct) return `FY ${direct[1]}`
  const dated = text.match(/\b((?:19|20)\d{2})\b/)
  if (dated && /year|period|ended|december|quarter|fy/i.test(text)) return `FY ${dated[1]}`
  return null
}

function yearFromText(value: string): string | null {
  const match = value.match(/\b((?:19|20)\d{2})\b/)
  return match ? `FY ${match[1]}` : null
}

function detectUnit(rows: SheetRows): string | undefined {
  for (const row of rows.slice(0, 4)) {
    for (const cell of row.slice(0, 3)) {
      const text = cellText(cell)
      const match = text.match(/amounts?\s+in\s+([^.;]+)/i)
      if (!match) continue
      return match[1].replace(/\s*\(.*$/, '').replace(/\s+except.*$/i, '').trim()
    }
  }
  return undefined
}

function statementTypeFor(sheetName: string, rows: SheetRows): string | null {
  const sample = `${sheetName} ${rows.slice(0, 8).flat().map(cellText).join(' ')}`.toLowerCase()
  if (/cash\s*flow|cash provided|cash used/.test(sample)) return 'Cash flow statement'
  if (/balance sheet|total assets|liabilities and equity/.test(sample)) return 'Balance sheet'
  if (/income statement|net income|profit\s*\(loss\)|revenue and income/.test(sample)) return 'Income statement'
  if (/comprehensive income/.test(sample)) return 'Comprehensive income statement'
  if (/changes? in equity|share capital|treasury shares/.test(sample)) return 'Equity statement'
  if (/revenue from contracts|external revenue|customer location/.test(sample)) return 'Revenue note'
  if (/ebit|ebitda|depreciation|amortization|impairment/.test(sample)) return 'Performance note'
  if (/tax|deferred tax/.test(sample)) return 'Tax note'
  if (/debt|liabilit|cash flows from financing|financial income|derivative|hedge/.test(sample)) return 'Financing note'
  if (/inventor|receivable|payable|provision|lease|goodwill|assets/.test(sample)) return 'Balance sheet note'
  if (/pension|employee benefit|remuneration|dividend|subsidiar/.test(sample)) return 'Financial note'
  return null
}

function findPeriodHeader(rows: SheetRows): number {
  return rows.findIndex((row) => rowLooksLikePeriodHeader(row))
}

function periodColumns(row: unknown[]): PeriodColumn[] {
  return row
    .map((cell, index) => {
      const period = periodLabel(cell)
      return period ? { index, period } : null
    })
    .filter((col): col is PeriodColumn => col !== null)
}

function rowLooksLikePeriodHeader(row: unknown[]): boolean {
  const periods = periodColumns(row)
  if (periods.length === 0 || row.filter((cell) => !isBlank(cell)).length < 2) return false

  const firstNonEmpty = row.findIndex((cell) => !isBlank(cell))
  if (firstNonEmpty >= 0 && periods.some((period) => period.index === firstNonEmpty)) {
    return false
  }

  const periodIndexes = new Set(periods.map((period) => period.index))
  const numericNonPeriods = row.filter(
    (cell, index) => !periodIndexes.has(index) && numericValue(cell) !== null,
  ).length
  return numericNonPeriods <= 1
}

function noteColumn(header: unknown[]): number {
  return header.findIndex((cell) => /^notes?$/i.test(cellText(cell)))
}

function labelColumn(rows: SheetRows, headerIndex: number, maxExclusive: number): number {
  let best = 0
  let bestScore = -Infinity
  const limit = Math.max(1, Math.min(maxExclusive, 6))
  for (let col = 0; col < limit; col++) {
    let score = 0
    for (const row of rows.slice(headerIndex + 1, headerIndex + 20)) {
      const text = cellText(row[col])
      if (!text) continue
      score += Math.min(20, text.length)
      if (numericValue(row[col]) !== null) score -= 12
    }
    if (score > bestScore) {
      best = col
      bestScore = score
    }
  }
  return best
}

function extractFinancialSheet(
  sheetName: string,
  rows: SheetRows,
  rowCount: number,
  columnCount: number,
): ExtractedSheet {
  const statementType = statementTypeFor(sheetName, rows)
  const unit = detectUnit(rows)
  if (!statementType) {
    return {
      fields: FINANCIAL_FIELDS,
      records: [],
      meta: { name: sheetName, rowCount, columnCount, importedRows: 0, kind: 'table' },
    }
  }

  const headerIndex = findPeriodHeader(rows)
  const records = headerIndex >= 0
    ? extractPeriodFinancialRows(sheetName, rows, headerIndex, statementType, unit)
    : extractMetricFinancialRows(sheetName, rows, statementType, unit)

  return {
    fields: FINANCIAL_FIELDS,
    records,
    meta: {
      name: sheetName,
      rowCount,
      columnCount,
      importedRows: records.length,
      kind: records.length > 0 ? 'financial-table' : 'table',
      statementType,
      unit,
    },
  }
}

function extractPeriodFinancialRows(
  sheetName: string,
  rows: SheetRows,
  headerIndex: number,
  statementType: string,
  unit: string | undefined,
): Record<string, unknown>[] {
  const header = rows[headerIndex]
  const periods = periodColumns(header)
  if (periods.length === 0) return []

  const firstPeriodCol = Math.min(...periods.map((col) => col.index))
  const labelCol = labelColumn(rows, headerIndex, firstPeriodCol)
  const notesCol = noteColumn(header)
  const records: Record<string, unknown>[] = []
  let section = ''

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const lineItem = cellText(row[labelCol])
    if (!lineItem) continue

    const values = periods
      .map((col) => ({ ...col, amount: numericValue(row[col.index]) }))
      .filter((value) => value.amount !== null)

    if (values.length === 0) {
      section = lineItem
      continue
    }

    for (const value of values) {
      records.push({
        Sheet: sheetName,
        Statement: statementType,
        Section: section,
        'Line Item': lineItem,
        Metric: 'Amount',
        Period: value.period,
        Amount: value.amount,
        Unit: unit ?? '',
        Note: notesCol >= 0 ? cellText(row[notesCol]) : '',
        'Source Row': `Row ${rowIndex + 1}`,
      })
    }
  }

  return records
}

function metricHeaderIndex(rows: SheetRows): number {
  return rows.findIndex((row, index) => {
    const nonEmpty = row.filter((cell) => !isBlank(cell)).length
    if (nonEmpty < 3) return false
    const nextRows = rows.slice(index + 1, index + 8)
    const numericCells = nextRows.reduce(
      (acc, next) => acc + next.filter((cell) => numericValue(cell) !== null).length,
      0,
    )
    return numericCells >= 3
  })
}

function extractMetricFinancialRows(
  sheetName: string,
  rows: SheetRows,
  statementType: string,
  unit: string | undefined,
): Record<string, unknown>[] {
  const headerIndex = metricHeaderIndex(rows)
  if (headerIndex < 0) return []

  const header = rows[headerIndex]
  const notesCol = noteColumn(header)
  const labelCol = labelColumn(rows, headerIndex, header.length)
  const metricCols = header
    .map((cell, index) => ({ index, label: cellText(cell) || `Column ${index + 1}` }))
    .filter((col) => col.index !== labelCol && col.index !== notesCol)
    .filter((col) => rows.slice(headerIndex + 1).some((row) => numericValue(row[col.index]) !== null))

  const records: Record<string, unknown>[] = []
  let section = ''
  let sectionPeriod: string | null = null

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const lineItem = cellText(row[labelCol])
    if (!lineItem) continue

    const values = metricCols
      .map((col) => ({ ...col, amount: numericValue(row[col.index]) }))
      .filter((value) => value.amount !== null)

    if (values.length === 0) {
      section = lineItem
      sectionPeriod = yearFromText(lineItem) ?? sectionPeriod
      continue
    }

    for (const value of values) {
      records.push({
        Sheet: sheetName,
        Statement: statementType,
        Section: section,
        'Line Item': lineItem,
        Metric: value.label,
        Period: yearFromText(lineItem) ?? sectionPeriod ?? 'Unspecified period',
        Amount: value.amount,
        Unit: unit ?? '',
        Note: notesCol >= 0 ? cellText(row[notesCol]) : '',
        'Source Row': `Row ${rowIndex + 1}`,
      })
    }
  }

  return records
}

function uniqueHeaders(fields: string[]): string[] {
  const seen = new Map<string, number>()
  return fields.map((field, index) => {
    const base = field || `Column ${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
}

function genericHeaderIndex(rows: SheetRows): number {
  let best = 0
  let bestScore = -Infinity
  rows.slice(0, 12).forEach((row, index) => {
    const texts = row.map(cellText).filter(Boolean)
    if (texts.length === 0) return
    const next = rows.slice(index + 1, index + 6)
    const nextDensity = next.reduce((acc, r) => acc + r.filter((cell) => !isBlank(cell)).length, 0)
    const textScore = texts.reduce((acc, value) => acc + (parseNumber(value) === null ? 2 : 0), 0)
    const score = texts.length * 3 + textScore + nextDensity
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

function extractGenericSheet(
  sheetName: string,
  rows: SheetRows,
  rowCount: number,
  columnCount: number,
): ExtractedSheet {
  const headerIndex = genericHeaderIndex(rows)
  const headers = uniqueHeaders(rows[headerIndex].map(cellText))
  const records: Record<string, unknown>[] = []

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    if (row.every(isBlank)) continue
    const record: Record<string, unknown> = { Sheet: sheetName, 'Source Row': `Row ${rowIndex + 1}` }
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null
    })
    records.push(record)
  }

  return {
    fields: ['Sheet', 'Source Row', ...headers],
    records,
    meta: {
      name: sheetName,
      rowCount,
      columnCount,
      importedRows: records.length,
      kind: records.length > 0 ? 'table' : 'empty',
    },
  }
}

function mergeGenericSheets(sheets: ExtractedSheet[]): RawTable {
  const fields = ['Sheet', 'Source Row']
  const seen = new Set(fields)
  for (const sheet of sheets) {
    for (const field of sheet.fields) {
      if (seen.has(field)) continue
      seen.add(field)
      fields.push(field)
    }
  }

  const records = sheets.flatMap((sheet) => sheet.records)
  if (records.length === 0) {
    throw new FileParseError('The spreadsheet has sheets, but no usable table rows were detected.')
  }

  return {
    fields,
    records,
    issues: [`Merged ${sheets.length.toLocaleString()} non-empty sheet${sheets.length === 1 ? '' : 's'} into one dataset.`]
      .map((message) => ({ message })),
  }
}
