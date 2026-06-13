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
          resolve(
            buildDataset(
              { fileName: file.name, fileSize: file.size },
              { fields: results.meta.fields ?? [], records: results.data, issues },
            ),
          )
        } catch (err) {
          reject(err)
        }
      },
      error: (err) => reject(new FileParseError(err.message || 'Could not read the file.')),
    })
  })
}
