import type {
  Dataset,
  FinancialExtractionMode,
  FinancialPageExtraction,
  ParseIssue,
  PdfOcrProgress,
  PdfPageExtraction,
} from '../types'
import { buildDataset, FileParseError, type RawTable } from './dataset'
import { extractPdf } from './pdfExtract'
import { applyOcrResults, DEFAULT_OCR_PAGE_LIMIT, OcrCancelledError, runPdfOcr } from './pdfOcr'
import { buildFinancialDocumentFromText, financialRowsAsDatasetRows } from './financialStatementParser'

export interface ParsePdfOptions {
  forceOcr?: boolean
  onOcrProgress?: (progress: PdfOcrProgress) => void
}

const PDF_FIELDS = ['Page', 'Mode', 'Statement', 'Parsed', 'Confidence', 'Text']

function textForPage(page: PdfPageExtraction): string {
  if (page.extractionMode === 'ocr' && page.ocrText) return page.ocrText
  return page.embeddedText ?? page.ocrText ?? ''
}

function scoreText(text: string, confidence?: number): number {
  if (confidence != null) return Math.max(0.05, Math.min(0.96, confidence))
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length
  const financialSignals = /(income statement|statement of financial position|balance sheet|cash flow|revenue|total assets|profit before tax|kontantstrøm|balanse|resultatregnskap)/i.test(text)
  return Math.min(0.96, Math.min(0.5, text.length / 3000) + Math.min(0.3, lines / 80) + (financialSignals ? 0.16 : 0))
}

function toFinancialExtraction(page: PdfPageExtraction): FinancialPageExtraction {
  const text = textForPage(page)
  return {
    pageNumber: page.pageNumber,
    extractionMode: page.extractionMode === 'none' ? 'none' : page.extractionMode,
    text,
    lineCount: text.split(/\r?\n/).filter((line) => line.trim()).length,
    quality: scoreText(text, page.confidence),
    embeddedText: page.embeddedText,
    ocrText: page.ocrText,
    textLength: page.textLength,
    confidence: page.confidence,
    warnings: page.warnings.map((message) => ({ message, severity: 'warning' })),
  }
}

function documentMode(pages: FinancialPageExtraction[]): FinancialExtractionMode {
  const embedded = pages.some((page) => page.extractionMode === 'embedded_text')
  const ocr = pages.some((page) => page.extractionMode === 'ocr')
  if (embedded && ocr) return 'mixed'
  if (ocr) return 'ocr'
  if (embedded) return 'embedded_text'
  return 'none'
}

async function maybeRunOcr(
  file: File,
  pages: PdfPageExtraction[],
  options: ParsePdfOptions,
): Promise<{ pages: PdfPageExtraction[]; warnings: string[] }> {
  if (!options.forceOcr) return { pages, warnings: [] }

  const warnings: string[] = []
  try {
    const results = await runPdfOcr(file, {
      maxPages: DEFAULT_OCR_PAGE_LIMIT,
      onProgress: (event) => {
        options.onOcrProgress?.({
          currentPage: event.page,
          totalPages: event.totalPages,
          status: event.phase === 'page-done' && event.overall >= 1 ? 'complete' : 'recognizing',
          message: event.page > 0
            ? `Running OCR on page ${event.page}`
            : 'Preparing local OCR worker',
        })
      },
    })
    options.onOcrProgress?.({
      currentPage: results.length,
      totalPages: results.length,
      status: 'complete',
      message: 'OCR complete',
    })
    return { pages: applyOcrResults(pages, results), warnings }
  } catch (err) {
    if (err instanceof OcrCancelledError) {
      warnings.push('OCR was cancelled; embedded text was retained.')
    } else {
      const message = err instanceof Error ? err.message : 'OCR failed.'
      warnings.push(`OCR failed gracefully: ${message}`)
    }
    options.onOcrProgress?.({
      currentPage: 0,
      totalPages: 0,
      status: 'error',
      message: warnings[warnings.length - 1],
    })
    return { pages, warnings }
  }
}

export async function parsePdfFile(file: File, options: ParsePdfOptions = {}): Promise<Dataset> {
  let extraction
  try {
    extraction = await extractPdf(file)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The PDF could not be opened.'
    throw new FileParseError(`That PDF could not be read. ${message}`)
  }

  const ocrResult = await maybeRunOcr(file, extraction.pages, options)
  const pages = ocrResult.pages.map(toFinancialExtraction)
  const pageCount = extraction.pageCount
  const ocrReason = extraction.pages.some((page) => page.extractionMode === 'none')
    ? 'Some pages have little embedded text; local OCR may improve extraction.'
    : undefined

  const document = buildFinancialDocumentFromText({
    sourceFile: file.name,
    sourceType: 'pdf',
    extractionMode: documentMode(pages),
    pages,
    ocrAvailable: true,
    ocrReason: options.forceOcr ? ocrResult.warnings[0] : ocrReason,
  })
  document.pageCount = pageCount
  document.ocrAvailable = true
  document.ocrReason = options.forceOcr ? ocrResult.warnings[0] : ocrReason

  for (const message of [...extraction.warnings, ...ocrResult.warnings]) {
    document.warnings.push({ message, severity: 'warning' })
  }

  const records = financialRowsAsDatasetRows(document)
  if (records.length === 0) {
    records.push({
      Page: '',
      Mode: document.extractionMode,
      Statement: 'Unclassified / Review Needed',
      Parsed: 'no',
      Confidence: '0',
      Text: 'No extractable PDF text was found.',
    })
  }

  const issues: ParseIssue[] = [
    { message: `Processed ${pageCount.toLocaleString()} PDF page${pageCount === 1 ? '' : 's'} using ${document.extractionMode.replace('_', ' ')}.` },
    ...document.warnings.map((item) => ({ message: item.message, row: item.sourcePage })),
  ]
  if (ocrReason && !options.forceOcr) {
    issues.push({ message: ocrReason })
  }

  const table: RawTable = {
    fields: PDF_FIELDS,
    records,
    issues,
    financialDocument: document,
  }

  return buildDataset({ fileName: file.name, fileSize: file.size }, table)
}
