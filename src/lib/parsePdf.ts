import type { Dataset, ParseIssue, PdfOcrProgress } from '../types'
import { buildDataset, FileParseError, type RawTable } from './dataset'
import { extractPdf } from './pdfExtract'
import { buildFinancialDocumentFromText, financialRowsAsDatasetRows } from './financialStatementParser'

export interface ParsePdfOptions {
  forceOcr?: boolean
  onOcrProgress?: (progress: PdfOcrProgress) => void
}

const PDF_FIELDS = ['Page', 'Mode', 'Statement', 'Parsed', 'Confidence', 'Text']

export async function parsePdfFile(file: File, options: ParsePdfOptions = {}): Promise<Dataset> {
  let extraction
  try {
    extraction = await extractPdf(file, options)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The PDF could not be opened.'
    throw new FileParseError(`That PDF could not be read. ${message}`)
  }

  const document = buildFinancialDocumentFromText({
    sourceFile: file.name,
    sourceType: 'pdf',
    extractionMode: extraction.extractionMode,
    pages: extraction.pages,
    ocrAvailable: extraction.ocrAvailable,
    ocrReason: extraction.ocrReason,
  })
  document.pageCount = extraction.pageCount
  document.ocrAvailable = extraction.ocrAvailable
  document.ocrReason = extraction.ocrReason

  const records = financialRowsAsDatasetRows(document)
  if (records.length === 0) {
    records.push({
      Page: '',
      Mode: extraction.extractionMode,
      Statement: 'Unclassified / Review Needed',
      Parsed: 'no',
      Confidence: '0',
      Text: 'No extractable PDF text was found.',
    })
  }

  const issues: ParseIssue[] = [
    { message: `Processed ${extraction.pageCount.toLocaleString()} PDF page${extraction.pageCount === 1 ? '' : 's'} using ${extraction.extractionMode.replace('_', ' ')}.` },
    ...document.warnings.map((item) => ({ message: item.message, row: item.sourcePage })),
  ]
  if (extraction.ocrAvailable && !options.forceOcr) {
    issues.push({ message: extraction.ocrReason ?? 'OCR may improve this PDF extraction.' })
  }

  const table: RawTable = {
    fields: PDF_FIELDS,
    records,
    issues,
    financialDocument: document,
  }

  return buildDataset({ fileName: file.name, fileSize: file.size }, table)
}

