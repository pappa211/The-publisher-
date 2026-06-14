import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { FinancialExtractionMode, FinancialPageExtraction, FinancialWarning, PdfOcrProgress } from '../types'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PdfExtractionResult {
  pages: FinancialPageExtraction[]
  pageCount: number
  extractionMode: FinancialExtractionMode
  ocrAvailable: boolean
  ocrReason?: string
}

export interface PdfExtractionOptions {
  forceOcr?: boolean
  maxOcrPages?: number
  onOcrProgress?: (progress: PdfOcrProgress) => void
}

const DEFAULT_MAX_OCR_PAGES = 8

function warn(message: string, sourcePage?: number): FinancialWarning {
  return { message, severity: 'warning', sourcePage }
}

function itemText(item: unknown): string {
  if (item && typeof item === 'object' && 'str' in item) {
    return String((item as { str: unknown }).str ?? '')
  }
  return ''
}

function itemTransform(item: unknown): { x: number; y: number } {
  if (item && typeof item === 'object' && 'transform' in item) {
    const transform = (item as { transform?: unknown }).transform
    if (Array.isArray(transform) && transform.length >= 6) {
      return { x: Number(transform[4]) || 0, y: Number(transform[5]) || 0 }
    }
  }
  return { x: 0, y: 0 }
}

function textItemsToLines(items: unknown[]): string[] {
  const grouped = new Map<number, { x: number; text: string }[]>()
  for (const item of items) {
    const text = itemText(item).trim()
    if (!text) continue
    const { x, y } = itemTransform(item)
    const key = Math.round(y / 3) * 3
    const line = grouped.get(key) ?? []
    line.push({ x, text })
    grouped.set(key, line)
  }

  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, line]) => line.sort((a, b) => a.x - b.x).map((part) => part.text).join(' '))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function scorePageText(text: string): number {
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length
  const numberLines = text.split(/\r?\n/).filter((line) => /\d[\d\s.,()-]*\s+\d/.test(line)).length
  const statementSignals = /(income statement|statement of financial position|balance sheet|cash flow|revenue|total assets|profit before tax|kontantstrøm|balanse|resultatregnskap)/i.test(text)
  const densityScore = Math.min(0.35, text.length / 2500)
  const lineScore = Math.min(0.25, lineCount / 70)
  const tableScore = Math.min(0.25, numberLines / 18)
  return Math.min(0.96, densityScore + lineScore + tableScore + (statementSignals ? 0.15 : 0))
}

function shouldSuggestOcr(pages: FinancialPageExtraction[]): string | undefined {
  const totalText = pages.map((page) => page.text).join('\n')
  const averageQuality = pages.length
    ? pages.reduce((sum, page) => sum + page.quality, 0) / pages.length
    : 0
  if (totalText.trim().length < 250) return 'Embedded PDF text is very sparse.'
  if (averageQuality < 0.32) return 'Embedded PDF text quality appears weak.'
  if (!/\d[\d\s.,()-]*\s+\d/.test(totalText)) return 'No table-like financial lines were detected in embedded text.'
  return undefined
}

async function embeddedTextPages(pdf: pdfjs.PDFDocumentProxy): Promise<FinancialPageExtraction[]> {
  const pages: FinancialPageExtraction[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const lines = textItemsToLines(content.items as unknown[])
    const text = lines.join('\n')
    pages.push({
      pageNumber,
      extractionMode: 'embedded_text',
      text,
      lineCount: lines.length,
      quality: scorePageText(text),
      warnings: text.trim() ? [] : [warn('No embedded text was found on this page.', pageNumber)],
    })
  }
  return pages
}

async function renderPageCanvas(page: pdfjs.PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 1.6 })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not available in this browser.')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvasContext: context, viewport }).promise
  return canvas
}

async function ocrPages(
  pdf: pdfjs.PDFDocumentProxy,
  embeddedPages: FinancialPageExtraction[],
  options: PdfExtractionOptions,
): Promise<FinancialPageExtraction[]> {
  const maxPages = Math.max(1, options.maxOcrPages ?? DEFAULT_MAX_OCR_PAGES)
  const pageNumbers = embeddedPages
    .slice(0, maxPages)
    .map((page) => page.pageNumber)

  if (pageNumbers.length === 0) return embeddedPages

  const { createWorker } = await import('tesseract.js')
  options.onOcrProgress?.({
    currentPage: 0,
    totalPages: pageNumbers.length,
    status: 'preparing',
    message: 'Preparing local OCR worker',
  })

  const worker = await createWorker('eng')
  const byPage = new Map(embeddedPages.map((page) => [page.pageNumber, page]))

  try {
    for (const [index, pageNumber] of pageNumbers.entries()) {
      options.onOcrProgress?.({
        currentPage: index + 1,
        totalPages: pageNumbers.length,
        status: 'recognizing',
        message: `Running OCR on page ${pageNumber}`,
      })
      const page = await pdf.getPage(pageNumber)
      const canvas = await renderPageCanvas(page)
      const result = await worker.recognize(canvas)
      const text = (result.data.text ?? '').trim()
      const quality = Math.max(scorePageText(text), Math.min(0.9, (result.data.confidence ?? 0) / 100))
      const embedded = byPage.get(pageNumber)
      const mergedText = text || embedded?.text || ''
      byPage.set(pageNumber, {
        pageNumber,
        extractionMode: text ? 'ocr' : 'embedded_text',
        text: mergedText,
        lineCount: mergedText.split(/\r?\n/).filter((line) => line.trim()).length,
        quality,
        warnings: text ? [warn('Page was parsed with local OCR; review extracted numbers.', pageNumber)] : [
          warn('OCR produced no text; embedded text was retained.', pageNumber),
        ],
      })
    }
    options.onOcrProgress?.({
      currentPage: pageNumbers.length,
      totalPages: pageNumbers.length,
      status: 'complete',
      message: 'OCR complete',
    })
  } finally {
    await worker.terminate()
  }

  return [...byPage.values()].sort((a, b) => a.pageNumber - b.pageNumber)
}

export async function extractPdf(file: File, options: PdfExtractionOptions = {}): Promise<PdfExtractionResult> {
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const embedded = await embeddedTextPages(pdf)
  const ocrReason = shouldSuggestOcr(embedded)

  if (!options.forceOcr) {
    return {
      pages: embedded,
      pageCount: pdf.numPages,
      extractionMode: 'embedded_text',
      ocrAvailable: Boolean(ocrReason),
      ocrReason,
    }
  }

  try {
    const pages = await ocrPages(pdf, embedded, options)
    const usedOcr = pages.some((page) => page.extractionMode === 'ocr')
    return {
      pages,
      pageCount: pdf.numPages,
      extractionMode: usedOcr && embedded.some((page) => page.text.trim()) ? 'mixed' : usedOcr ? 'ocr' : 'embedded_text',
      ocrAvailable: Boolean(ocrReason),
      ocrReason,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR failed.'
    return {
      pages: embedded.map((page) => ({
        ...page,
        warnings: [...page.warnings, warn(`OCR failed gracefully: ${message}`, page.pageNumber)],
      })),
      pageCount: pdf.numPages,
      extractionMode: 'embedded_text',
      ocrAvailable: Boolean(ocrReason),
      ocrReason: `OCR failed gracefully: ${message}`,
    }
  }
}
