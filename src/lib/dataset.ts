/**
 * Format-agnostic dataset assembly.
 *
 * Both the CSV reader (PapaParse) and the spreadsheet reader (SheetJS) funnel
 * their parsed output through `buildDataset`, so column normalization, cell
 * coercion and profiling live in exactly one place regardless of input format.
 *
 * Everything still happens in the browser — no file is ever uploaded.
 */
import type { CsvRow, Dataset, ParseIssue } from '../types'
import { profileColumns } from './profile'

const MAX_REPORTED_ISSUES = 25

/** Thrown when a file cannot be turned into a usable table. */
export class FileParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileParseError'
  }
}

/**
 * The minimal, format-neutral shape every reader produces: the original header
 * names in column order, one record per data row (keyed by those names, with
 * values of any JS type), and any non-fatal issues encountered.
 */
export interface RawTable {
  fields: string[]
  records: Record<string, unknown>[]
  issues: ParseIssue[]
}

/** Identifying metadata about the source file. */
export interface SourceMeta {
  fileName: string
  fileSize: number
}

/** De-duplicate / fill in blank header names so every column is addressable. */
function normalizeHeaders(fields: string[]): string[] {
  const seen = new Map<string, number>()
  return fields.map((field, i) => {
    let name = field?.trim() || `Column ${i + 1}`
    if (seen.has(name)) {
      const next = (seen.get(name) ?? 0) + 1
      seen.set(name, next)
      name = `${name} (${next})`
    } else {
      seen.set(name, 0)
    }
    return name
  })
}

/** Render a spreadsheet date cell as an ISO-ish string the type inferrer trusts.
 * Uses the Date's *local* fields, because SheetJS builds date cells so that the
 * local components reflect the stored wall-clock value — reading them in UTC
 * could shift the day across a timezone boundary. */
function formatDateCell(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const h = d.getHours()
  const m = d.getMinutes()
  const s = d.getSeconds()
  return h || m || s ? `${ymd}T${p(h)}:${p(m)}:${p(s)}` : ymd
}

/**
 * Coerce any cell value to the canonical trimmed-ish string the rest of the
 * pipeline reasons over. Strings pass through untouched; richer types coming
 * from spreadsheets (numbers, booleans, dates) are rendered in the plain
 * formats `inferTypes` understands so a column keeps its real type.
 */
function coerceCell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return formatDateCell(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return String(value)
}

/**
 * Turn a reader's raw table into a fully profiled `Dataset`.
 * Throws a `FileParseError` when the table has no usable structure.
 */
export function buildDataset(meta: SourceMeta, table: RawTable): Dataset {
  const rawFields = table.fields
  if (rawFields.length === 0) {
    throw new FileParseError(
      'No columns were detected. Make sure the file has a header row at the top.',
    )
  }

  const columns = normalizeHeaders(rawFields)
  const renameMap = new Map(rawFields.map((field, i) => [field, columns[i]]))

  // Re-key each row onto the normalized header names, coercing every cell to a
  // string and guaranteeing all columns are present.
  const rows: CsvRow[] = table.records.map((raw) => {
    const row: CsvRow = {}
    for (const [original, normalized] of renameMap) {
      row[normalized] = coerceCell(raw[original])
    }
    return row
  })

  if (rows.length === 0) {
    throw new FileParseError('The file has a header but no data rows.')
  }

  const issues = table.issues.slice(0, MAX_REPORTED_ISSUES)
  const profiles = profileColumns(columns, rows)

  return {
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    profiles,
    issues,
    parsedAt: Date.now(),
  }
}
