/**
 * The single entry point for turning an uploaded file into a `Dataset`.
 *
 * It sniffs the file's extension / MIME type and dispatches to the right
 * reader: PapaParse for delimited text (CSV/TSV), SheetJS for spreadsheet
 * workbooks (Excel, OpenDocument, Apple Numbers), DOMParser for XML/XBRL, and
 * pdf.js/Tesseract for browser-only PDF extraction and OCR. Nothing is
 * uploaded.
 */
import type { Dataset, FinancialExtractionMode, FinancialSourceType, PdfOcrProgress } from '../types'
import { FileParseError } from './dataset'
import { parseCsvFile } from './parseCsv'
import { parsePdfFile } from './parsePdf'
import { parseSpreadsheetFile } from './parseSpreadsheet'
import { parseXmlFile } from './parseXml'
import { buildFinancialDocumentFromDataset } from './financialStatementParser'

export { FileParseError }

const SPREADSHEET_EXTENSIONS = new Set([
  'xlsx',
  'xlsm',
  'xlsb',
  'xls',
  'ods',
  'fods',
  'numbers',
])

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.apple.numbers',
  'application/x-iwork-numbers-sffnumbers',
])

const XML_EXTENSIONS = new Set(['xml', 'xbrl', 'xhtml'])

const XML_MIME_TYPES = new Set([
  'application/xml',
  'text/xml',
  'application/xbrl+xml',
  'application/xhtml+xml',
])

const PDF_EXTENSIONS = new Set(['pdf'])

const PDF_MIME_TYPES = new Set(['application/pdf'])

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
  '.pdf',
  'application/pdf',
].join(',')

export const SUPPORTED_FORMATS_LABEL = 'PDF, CSV, Excel, Numbers, ODS, XML & XBRL'

export interface ParseFileOptions {
  forceOcr?: boolean
  onOcrProgress?: (progress: PdfOcrProgress) => void
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export function isSpreadsheetFile(file: File): boolean {
  const ext = extensionOf(file.name)
  if (ext) return SPREADSHEET_EXTENSIONS.has(ext)
  return SPREADSHEET_MIME_TYPES.has(file.type)
}

export function isXmlFile(file: File): boolean {
  const ext = extensionOf(file.name)
  if (ext) return XML_EXTENSIONS.has(ext)
  return XML_MIME_TYPES.has(file.type)
}

export function isPdfFile(file: File): boolean {
  const ext = extensionOf(file.name)
  if (ext) return PDF_EXTENSIONS.has(ext)
  return PDF_MIME_TYPES.has(file.type)
}

function attachFinancialDocument(
  dataset: Dataset,
  sourceType: FinancialSourceType,
  extractionMode: FinancialExtractionMode,
): Dataset {
  if (dataset.financialDocument) return dataset
  const financialDocument = buildFinancialDocumentFromDataset(dataset, sourceType, extractionMode)
  return financialDocument ? { ...dataset, financialDocument } : dataset
}

export async function parseFile(file: File, options: ParseFileOptions = {}): Promise<Dataset> {
  if (isPdfFile(file)) return parsePdfFile(file, options)
  if (isSpreadsheetFile(file)) {
    return attachFinancialDocument(await parseSpreadsheetFile(file), 'xlsx', 'structured_table')
  }
  if (isXmlFile(file)) {
    return attachFinancialDocument(await parseXmlFile(file), 'xml', 'xml')
  }
  return attachFinancialDocument(await parseCsvFile(file), 'csv', 'structured_table')
}

export interface SampleDataset {
  id: string
  label: string
  file: string
  description: string
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'annual-accounts-pdf',
    label: 'Annual accounts PDF',
    file: 'annual-accounts-sample.pdf',
    description: 'Text PDF with all three primary statements',
  },
  {
    id: 'income-statement',
    label: 'Income statement',
    file: 'income-statement-sample.csv',
    description: 'IFRS-style profit and loss with two periods',
  },
  {
    id: 'balance-sheet',
    label: 'Balance sheet',
    file: 'balance-sheet-sample.csv',
    description: 'Assets, equity and liabilities with a tie-out check',
  },
  {
    id: 'cash-flow',
    label: 'Cash flow',
    file: 'cash-flow-sample.csv',
    description: 'Operating, investing and financing cash flows',
  },
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

export async function loadSampleFile(file = SAMPLE_DATASETS[0].file): Promise<File> {
  const url = `${import.meta.env.BASE_URL}sample-data/${file}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new FileParseError('Could not load the sample dataset.')
  }
  return new File([await response.blob()], file)
}

export async function loadSampleDataset(file = SAMPLE_DATASETS[0].file): Promise<Dataset> {
  return parseFile(await loadSampleFile(file))
}
