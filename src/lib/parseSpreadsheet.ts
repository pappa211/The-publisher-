/**
 * Client-side spreadsheet parsing built on SheetJS (the `xlsx` package).
 *
 * Handles Excel (.xlsx/.xlsm/.xlsb/.xls), OpenDocument (.ods) and Apple
 * Numbers (.numbers) workbooks. Like the CSV path, the file is read entirely in
 * the browser and never uploaded. SheetJS is a relatively heavy dependency, so
 * it is loaded with a dynamic import — only users who actually open a
 * spreadsheet pay the download cost, and the CSV path keeps the bundle small.
 */
import type { Dataset, ParseIssue } from '../types'
import { buildDataset, FileParseError, type RawTable } from './dataset'

/**
 * Parse a spreadsheet File into a fully profiled Dataset, reading the first
 * sheet that contains data. Rejects with a `FileParseError` on failure.
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

  const table = extractFirstSheet(XLSX, workbook)
  return buildDataset({ fileName: file.name, fileSize: file.size }, table)
}

/** Pull the first non-empty sheet out of a workbook into a format-neutral table. */
function extractFirstSheet(XLSX: typeof import('xlsx'), workbook: import('xlsx').WorkBook): RawTable {
  const sheetNames = workbook.SheetNames ?? []
  if (sheetNames.length === 0) {
    throw new FileParseError('The spreadsheet has no sheets.')
  }

  // Prefer the first sheet that actually has rows; fall back to the first sheet.
  let chosenName = sheetNames[0]
  let aoa: unknown[][] = []
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      blankrows: false,
      defval: null,
    })
    if (rows.length > 0) {
      chosenName = name
      aoa = rows
      break
    }
  }

  const headerRow = aoa[0] ?? []
  const fields = headerRow.map((cell) => (cell == null ? '' : String(cell).trim()))
  const records = aoa.slice(1).map((row) => {
    const record: Record<string, unknown> = {}
    fields.forEach((field, i) => {
      record[field] = row[i] ?? null
    })
    return record
  })

  const issues: ParseIssue[] = []
  if (sheetNames.length > 1) {
    issues.push({
      message: `This workbook has ${sheetNames.length} sheets; only the first with data ("${chosenName}") was imported.`,
    })
  }

  return { fields, records, issues }
}
