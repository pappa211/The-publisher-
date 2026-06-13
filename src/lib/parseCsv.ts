/**
 * Client-side CSV parsing built on PapaParse.
 *
 * Everything happens in the browser: the file is read with the FileReader the
 * browser already gives PapaParse — it is never uploaded anywhere.
 */
import Papa from 'papaparse'
import type { CsvRow, Dataset, ParseIssue } from '../types'
import { profileColumns } from './profile'

const MAX_REPORTED_ISSUES = 25

/** Thrown when a file cannot be turned into a usable table. */
export class CsvParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvParseError'
  }
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

/**
 * Parse a CSV File (or Blob) into a fully profiled Dataset.
 * Rejects with a `CsvParseError` when the file has no usable structure.
 */
export function parseCsvFile(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      worker: false,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        try {
          resolve(buildDataset(file, results))
        } catch (err) {
          reject(err)
        }
      },
      error: (err) => reject(new CsvParseError(err.message || 'Could not read the file.')),
    })
  })
}

function buildDataset(
  file: File,
  results: Papa.ParseResult<Record<string, string>>,
): Dataset {
  const rawFields = results.meta.fields ?? []
  if (rawFields.length === 0) {
    throw new CsvParseError(
      'No columns were detected. Make sure the file is a comma-separated CSV with a header row.',
    )
  }

  const columns = normalizeHeaders(rawFields)
  const renameMap = new Map(rawFields.map((field, i) => [field, columns[i]]))

  // Re-key each row onto the normalized header names, coercing every cell to a
  // trimmed string and guaranteeing all columns are present.
  const rows: CsvRow[] = results.data.map((raw) => {
    const row: CsvRow = {}
    for (const [original, normalized] of renameMap) {
      const value = raw[original]
      row[normalized] = value == null ? '' : String(value)
    }
    return row
  })

  if (rows.length === 0) {
    throw new CsvParseError('The file has a header but no data rows.')
  }

  const issues: ParseIssue[] = results.errors.slice(0, MAX_REPORTED_ISSUES).map((e) => ({
    message: e.message,
    row: typeof e.row === 'number' ? e.row : undefined,
  }))

  const profiles = profileColumns(columns, rows)

  return {
    fileName: file.name,
    fileSize: file.size,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    profiles,
    issues,
    parsedAt: Date.now(),
  }
}

/** A bundled sample dataset, used to demonstrate different data *shapes*. */
export interface SampleDataset {
  id: string
  label: string
  file: string
  description: string
}

/**
 * Deliberately diverse samples so the report planner can be tested against very
 * different structures — never tuned for any single one of them.
 */
export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'trade-ledger',
    label: 'Trade ledger',
    file: 'trade-ledger-sample.csv',
    description: 'Time-stamped trading events with P&L',
  },
  {
    id: 'trial-balance',
    label: 'Trial balance',
    file: 'trial-balance-sample.csv',
    description: 'Accounting balances by entity & period',
  },
  {
    id: 'football-results',
    label: 'Football results',
    file: 'football-results-sample.csv',
    description: 'Match results across leagues & seasons',
  },
  {
    id: 'world-cities',
    label: 'World cities',
    file: 'world-cities.csv',
    description: 'Reference data with mixed column types',
  },
]

/** Fetch a bundled sample CSV by file name and parse it through the pipeline. */
export async function loadSampleDataset(file = SAMPLE_DATASETS[0].file): Promise<Dataset> {
  const url = `${import.meta.env.BASE_URL}sample-data/${file}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new CsvParseError('Could not load the sample dataset.')
  }
  const text = await response.text()
  const blob = new File([text], file, { type: 'text/csv' })
  return parseCsvFile(blob)
}
