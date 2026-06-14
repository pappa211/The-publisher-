/**
 * Client-side CSV / TSV parsing built on PapaParse.
 *
 * The file is read with the FileReader the browser already gives PapaParse — it
 * is never uploaded anywhere. The parsed rows are handed to the shared
 * `buildDataset` so CSV and spreadsheet inputs profile through identical logic.
 */
import Papa from 'papaparse'
import type { Dataset, ParseIssue } from '../types'
import { buildDataset, FileParseError } from './dataset'
import { detectWideFinancialTable } from './financialCsv'

/**
 * Parse a CSV/TSV File (or Blob) into a fully profiled Dataset.
 * Rejects with a `FileParseError` when the file has no usable structure.
 */
export function parseCsvFile(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      worker: false,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        try {
          const issues: ParseIssue[] = results.errors.map((e) => ({
            message: e.message,
            row: typeof e.row === 'number' ? e.row : undefined,
          }))
          const fields = results.meta.fields ?? []
          // If the CSV is a wide financial statement, route it through the
          // finance-aware path; otherwise keep the original generic table.
          const financial = detectWideFinancialTable(fields, results.data)
          const table = financial
            ? { ...financial, issues: [...issues, ...financial.issues] }
            : { fields, records: results.data, issues }
          resolve(buildDataset({ fileName: file.name, fileSize: file.size }, table))
        } catch (err) {
          reject(err)
        }
      },
      error: (err) => reject(new FileParseError(err.message || 'Could not read the file.')),
    })
  })
}
