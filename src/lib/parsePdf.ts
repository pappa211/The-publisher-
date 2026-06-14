/**
 * The PDF entry point: orchestrates the v0.3 financial-document pipeline.
 *
 *   PDF file
 *     → embedded text extraction (pdfExtract / pdf.js)
 *     → financial-statement detection + line-item parsing (detector + parser)
 *     → a transparent FinancialDocument (pages, statements, rows, warnings)
 *     → normalized into the shared FINANCIAL_FIELDS records so the existing
 *       financial analysis + report + table all work unchanged.
 *
 * If embedded text is too thin (scanned/image PDF), the document is still
 * returned — flagged for the experimental OCR fallback, which the workspace runs
 * on demand and feeds back through {@link buildFinancialDocument}.
 */
import type {
  Dataset,
  ExtractionMode,
  FinancialDocument,
  ParseIssue,
  PdfPageExtraction,
  WorkbookSheetMeta,
} from '../types'
import { buildDataset, FileParseError, type RawTable } from './dataset'
import { buildFinancialAnalysis, FINANCIAL_FIELDS } from './financialAnalysis'
import { analyzeFinancialPages, STATEMENT_KIND_LABEL } from './financialStatementDetector'
import { extractPdf } from './pdfExtract'

/** Fields used for the raw page-text fallback when nothing structured is found. */
const PAGE_TEXT_FIELDS = ['Page', 'Extraction', 'Characters', 'Text']

/** Decide the document-level extraction mode from per-page outcomes. */
function documentMode(pages: PdfPageExtraction[]): ExtractionMode {
  const embedded = pages.some((p) => p.extractionMode === 'embedded_text')
  const ocr = pages.some((p) => p.extractionMode === 'ocr')
  if (embedded && ocr) return 'mixed'
  if (ocr) return 'ocr'
  if (embedded) return 'embedded_text'
  return 'none'
}

/**
 * Assemble a {@link FinancialDocument} from already-extracted pages. Pure and
 * reusable: the OCR flow calls this again with OCR-augmented pages.
 */
export function buildFinancialDocument(
  sourceFile: string,
  pages: PdfPageExtraction[],
  baseWarnings: string[] = [],
): FinancialDocument {
  const analysis = analyzeFinancialPages(pages)
  const pagesWithText = pages.filter((p) => p.extractionMode === 'embedded_text').length
  const pagesOcr = pages.filter((p) => p.extractionMode === 'ocr').length
  const pagesNeedingOcr = pages.filter((p) => p.extractionMode === 'none').length

  const warnings = new Set<string>([...baseWarnings, ...analysis.warnings])
  if (analysis.extractedRows.length > 0) {
    warnings.add('PDF text extraction may not preserve table layout; figures are matched to columns heuristically.')
  } else {
    warnings.add('No structured financial line items could be extracted from this document.')
  }
  if (pagesOcr > 0) {
    warnings.add('OCR is experimental and may misread numbers — verify figures against the source.')
  }
  if (pagesNeedingOcr > 0) {
    warnings.add('This PDF has little embedded text on some pages; an OCR fallback may be needed.')
  }

  return {
    sourceFile,
    sourceType: 'pdf',
    extractionMode: documentMode(pages),
    pageCount: pages.length,
    pages,
    statements: analysis.statements,
    extractedRows: analysis.extractedRows,
    periods: analysis.periods,
    currency: analysis.currency,
    unit: analysis.unit,
    warnings: [...warnings],
    pagesWithText,
    pagesNeedingOcr,
    ocrRecommended: pagesNeedingOcr > 0,
    ocrAvailable: true,
  }
}

/** Flatten the detected statements into shared FINANCIAL_FIELDS records. */
function toFinancialRecords(doc: FinancialDocument): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  for (const statement of doc.statements) {
    const statementLabel = STATEMENT_KIND_LABEL[statement.kind]
    for (const row of statement.rows) {
      for (const [period, value] of Object.entries(row.values)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue
        records.push({
          Sheet: statement.title,
          Statement: statementLabel,
          Section: '',
          'Line Item': row.label,
          Metric: 'Amount',
          Period: period,
          Amount: value,
          Unit: row.unit ?? doc.unit ?? '',
          Note: '',
          'Source Row': row.sourcePage ? `Page ${row.sourcePage}` : '',
        })
      }
    }
  }
  return records
}

/** The raw fallback table: one row per page so extracted text is always visible. */
function toPageTextRecords(doc: FinancialDocument): Record<string, unknown>[] {
  return doc.pages.map((page) => {
    const text = (page.extractionMode === 'ocr' ? page.ocrText : page.embeddedText) ?? ''
    return {
      Page: page.pageNumber,
      Extraction: page.extractionMode,
      Characters: text.length,
      Text: text.replace(/\s+/g, ' ').trim().slice(0, 2000),
    }
  })
}

/** Synthetic per-statement sheet metadata so the finance analysis can count sources. */
function statementSheets(doc: FinancialDocument): WorkbookSheetMeta[] {
  return doc.statements
    .filter((statement) => statement.kind !== 'unknown')
    .map((statement) => ({
      name: statement.title,
      rowCount: statement.rows.length,
      columnCount: statement.periods.length + 1,
      importedRows: statement.rows.length,
      kind: 'financial-table' as const,
      statementType: STATEMENT_KIND_LABEL[statement.kind],
      unit: doc.unit,
    }))
}

function summaryIssues(doc: FinancialDocument): ParseIssue[] {
  const issues: ParseIssue[] = []
  const statementCount = doc.statements.filter((s) => s.kind !== 'unknown').length
  if (doc.extractedRows.length > 0) {
    issues.push({
      message: `Extracted ${doc.extractedRows.length.toLocaleString()} financial line item${
        doc.extractedRows.length === 1 ? '' : 's'
      } from ${doc.pageCount.toLocaleString()} PDF page${doc.pageCount === 1 ? '' : 's'}${
        statementCount > 0 ? ` across ${statementCount} detected statement${statementCount === 1 ? '' : 's'}` : ''
      }.`,
    })
  } else if (doc.ocrRecommended) {
    issues.push({
      message: 'This PDF appears to be scanned or image-based. Run the experimental OCR fallback from the Financial document tab to attempt extraction.',
    })
  } else {
    issues.push({ message: 'No structured financial data was detected; showing the raw extracted page text.' })
  }
  return issues
}

/** Parse a PDF File into a Dataset carrying its rich FinancialDocument. */
export async function parsePdfFile(file: File): Promise<Dataset> {
  const extraction = await extractPdf(file).catch((err) => {
    throw new FileParseError(err instanceof Error ? err.message : 'That PDF could not be read.')
  })

  if (extraction.pageCount === 0) {
    throw new FileParseError('This PDF has no pages to read.')
  }

  const doc = buildFinancialDocument(file.name, extraction.pages, extraction.warnings)

  const financialRecords = toFinancialRecords(doc)
  const usesFinancial = financialRecords.length > 0

  const table: RawTable = usesFinancial
    ? {
        fields: FINANCIAL_FIELDS,
        records: financialRecords,
        issues: summaryIssues(doc),
        financialAnalysis: buildFinancialAnalysis(financialRecords, statementSheets(doc)),
        financialDocument: doc,
      }
    : {
        fields: PAGE_TEXT_FIELDS,
        records: toPageTextRecords(doc),
        issues: summaryIssues(doc),
        financialDocument: doc,
      }

  return buildDataset({ fileName: file.name, fileSize: file.size }, table)
}
