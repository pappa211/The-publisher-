/**
 * The single entry point for turning an uploaded file into a `Dataset`.
 *
 * It sniffs the file's extension / MIME type and dispatches to the right
 * reader: PapaParse for delimited text (CSV/TSV), SheetJS for spreadsheet
 * workbooks (Excel, OpenDocument, Apple Numbers), and a browser-native XML
 * reader for XML/XBRL financial reports. Everything runs in the browser;
 * nothing is uploaded.
 */
import type { Dataset } from '../types'
import { FileParseError } from './dataset'
import { parseCsvFile } from './parseCsv'
import { parseSpreadsheetFile } from './parseSpreadsheet'
import { parseXmlFile } from './parseXml'

export { FileParseError }

/** Spreadsheet file extensions handled by the SheetJS reader. */
const SPREADSHEET_EXTENSIONS = new Set([
  'xlsx', // Excel (2007+)
  'xlsm', // Excel macro-enabled
  'xlsb', // Excel binary
  'xls', // Excel (97–2003)
  'ods', // OpenDocument / LibreOffice / Google Sheets export
  'fods', // Flat OpenDocument
  'numbers', // Apple Numbers
])

/** MIME types some browsers report for spreadsheet files (when an extension is absent). */
const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.apple.numbers',
  'application/x-iwork-numbers-sffnumbers',
])

/** XML / XBRL extensions handled by the DOMParser-backed reader. */
const XML_EXTENSIONS = new Set([
  'xml',
  'xbrl',
  'xhtml',
])

/** MIME types browsers commonly report for XML, XBRL and Inline XBRL files. */
const XML_MIME_TYPES = new Set([
  'application/xml',
  'text/xml',
  'application/xbrl+xml',
  'application/xhtml+xml',
])

/**
 * The `accept` value for the file input. Lists both extensions and MIME types
 * so the OS file picker pre-filters helpfully without being overly strict.
 */
export const FILE_INPUT_ACCEPT = [
  '.csv',
  'text/csv',
  '.tsv',
  'text/tab-separated-values',
  '.txt',
  'text/plain',
  '.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm',
  '.xlsb',
  '.xls',
  'application/vnd.ms-excel',
  '.ods',
  'application/vnd.oasis.opendocument.spreadsheet',
  '.numbers',
  '.xml',
  'application/xml',
  'text/xml',
  '.xbrl',
  'application/xbrl+xml',
  '.xhtml',
  'application/xhtml+xml',
].join(',')

/** Short, human-readable list of the formats we accept (for UI copy). */
export const SUPPORTED_FORMATS_LABEL = 'CSV, Excel, Numbers, ODS, XML & XBRL'

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/** Whether a file should be read by the spreadsheet (SheetJS) path. */
export function isSpreadsheetFile(file: File): boolean {
  const ext = extensionOf(file.name)
  if (ext) return SPREADSHEET_EXTENSIONS.has(ext)
  // No extension to go on — fall back to the MIME type the browser reported.
  return SPREADSHEET_MIME_TYPES.has(file.type)
}

/** Whether a file should be read by the XML / XBRL path. */
export function isXmlFile(file: File): boolean {
  const ext = extensionOf(file.name)
  if (ext) return XML_EXTENSIONS.has(ext)
  return XML_MIME_TYPES.has(file.type)
}

/**
 * Parse any supported file into a fully profiled Dataset, choosing the reader
 * from the file type. Rejects with a `FileParseError` on failure.
 */
export function parseFile(file: File): Promise<Dataset> {
  if (isSpreadsheetFile(file)) return parseSpreadsheetFile(file)
  if (isXmlFile(file)) return parseXmlFile(file)
  return parseCsvFile(file)
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

/** Fetch a bundled sample by file name and parse it through the pipeline. */
export async function loadSampleDataset(file = SAMPLE_DATASETS[0].file): Promise<Dataset> {
  const url = `${import.meta.env.BASE_URL}sample-data/${file}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new FileParseError('Could not load the sample dataset.')
  }
  const blob = new File([await response.blob()], file)
  return parseFile(blob)
}
