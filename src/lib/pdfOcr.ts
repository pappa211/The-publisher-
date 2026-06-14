/**
 * Experimental, client-side OCR fallback for scanned / image-based PDFs.
 *
 * When a PDF has little or no embedded text, each target page is rasterized to a
 * canvas (via `pdfExtract`) and handed to Tesseract.js, which runs a WebAssembly
 * OCR engine entirely in the browser. The user's document is never uploaded; the
 * only network fetch is Tesseract's own engine + English language model, loaded
 * on demand from a public CDN (analogous to loading a script), then cached.
 *
 * OCR is heavy, so it is opt-in, page-limited, sequential, progress-reporting and
 * cancellable. Tesseract.js is lazily imported so it never bloats the main bundle.
 */
import type { PdfPageExtraction } from '../types'
import { loadPdfDocument, renderPdfPageToCanvas } from './pdfExtract'

/** Default cap on pages OCR'd in one run, to keep the browser responsive. */
export const DEFAULT_OCR_PAGE_LIMIT = 8

/** Progress emitted as OCR works through the pages. */
export interface OcrProgress {
  phase: 'init' | 'render' | 'recognize' | 'page-done'
  /** 1-based page number currently being processed (0 during init). */
  page: number
  /** 0-based index of the current page among the targets. */
  pageIndex: number
  /** Total number of pages this run will OCR. */
  totalPages: number
  /** Overall completion across the run (0–1). */
  overall: number
}

export interface OcrOptions {
  /** Explicit page numbers to OCR; defaults to the first {@link DEFAULT_OCR_PAGE_LIMIT}. */
  pages?: number[]
  maxPages?: number
  onProgress?: (progress: OcrProgress) => void
  /** Cooperative cancellation — checked between pages. */
  signal?: AbortSignal
}

/** OCR text + confidence for one page. */
export interface OcrPageResult {
  pageNumber: number
  text: string
  /** Tesseract's mean confidence for the page, normalized to 0–1. */
  confidence: number
}

/** Thrown when a run is cancelled via its AbortSignal. */
export class OcrCancelledError extends Error {
  constructor() {
    super('OCR was cancelled.')
    this.name = 'OcrCancelledError'
  }
}

const RENDER_SCALE = 2

function firstNPages(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * OCR a PDF File page by page. Returns one result per processed page. Rejects
 * with {@link OcrCancelledError} if the signal aborts, and otherwise surfaces a
 * plain Error so the caller can show a message without breaking the app.
 */
export async function runPdfOcr(file: File, options: OcrOptions = {}): Promise<OcrPageResult[]> {
  const { onProgress, signal } = options
  const throwIfAborted = () => {
    if (signal?.aborted) throw new OcrCancelledError()
  }

  throwIfAborted()
  onProgress?.({ phase: 'init', page: 0, pageIndex: 0, totalPages: 0, overall: 0 })

  const tesseract = await import('tesseract.js')
  const doc = await loadPdfDocument(file)

  const limit = options.maxPages ?? DEFAULT_OCR_PAGE_LIMIT
  const targets = (options.pages ?? firstNPages(Math.min(limit, doc.numPages))).filter(
    (n) => n >= 1 && n <= doc.numPages,
  )

  let activeIndex = 0
  const worker = await tesseract.createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text' && targets.length > 0) {
        const overall = (activeIndex + clamp01(message.progress)) / targets.length
        onProgress?.({
          phase: 'recognize',
          page: targets[activeIndex],
          pageIndex: activeIndex,
          totalPages: targets.length,
          overall: clamp01(overall),
        })
      }
    },
  })

  const results: OcrPageResult[] = []
  try {
    for (let i = 0; i < targets.length; i++) {
      throwIfAborted()
      activeIndex = i
      const pageNumber = targets[i]

      onProgress?.({
        phase: 'render',
        page: pageNumber,
        pageIndex: i,
        totalPages: targets.length,
        overall: clamp01(i / targets.length),
      })
      const canvas = await renderPdfPageToCanvas(doc, pageNumber, RENDER_SCALE)

      throwIfAborted()
      const { data } = await worker.recognize(canvas)
      // Free the bitmap promptly — OCR'd pages can be large.
      canvas.width = 0
      canvas.height = 0

      results.push({
        pageNumber,
        text: data.text ?? '',
        confidence: clamp01((data.confidence ?? 0) / 100),
      })
      onProgress?.({
        phase: 'page-done',
        page: pageNumber,
        pageIndex: i,
        totalPages: targets.length,
        overall: clamp01((i + 1) / targets.length),
      })
    }
  } finally {
    // Teardown must never throw out of the OCR run.
    try {
      await worker.terminate()
    } catch {
      /* ignore */
    }
    try {
      await doc.destroy()
    } catch {
      /* ignore */
    }
  }

  return results
}

/**
 * Merge OCR results back into the page extraction list, marking OCR'd pages with
 * their text, confidence and `ocr` extraction mode.
 */
export function applyOcrResults(
  pages: PdfPageExtraction[],
  results: OcrPageResult[],
): PdfPageExtraction[] {
  const byPage = new Map(results.map((result) => [result.pageNumber, result]))
  return pages.map((page) => {
    const result = byPage.get(page.pageNumber)
    if (!result) return page
    const usefulOcr = result.text.replace(/\s/g, '').length > 0
    return {
      ...page,
      ocrText: result.text,
      confidence: result.confidence,
      extractionMode: usefulOcr ? 'ocr' : page.extractionMode,
      textLength: usefulOcr ? result.text.length : page.textLength,
      warnings: usefulOcr
        ? page.warnings.filter((w) => !/scanned or image-based/i.test(w))
        : [...page.warnings, 'OCR produced no readable text for this page.'],
    }
  })
}
