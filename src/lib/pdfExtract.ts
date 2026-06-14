/**
 * Experimental client-side PDF text extraction (the embedded-text layer).
 *
 * This module is the *only* place that talks to `pdfjs-dist`. It loads a PDF in
 * the browser, pulls the embedded text out of each page in a layout-aware way
 * (grouping text fragments into visual lines so that table rows survive), and
 * can rasterize a page to a canvas for the experimental OCR fallback.
 *
 * Everything runs locally in the browser — the file is never uploaded. pdf.js
 * is loaded lazily (dynamic `import`) so it ships as its own chunk and only
 * downloads when a PDF is actually opened.
 */
import type { PdfPageExtraction } from '../types'

/** Minimal shapes we rely on from pdf.js — kept local so we are not coupled to
 * a specific version's deep type paths. */
interface PdfTextItem {
  str: string
  /** [a, b, c, d, e, f] transform; e = x, f = y in PDF user space. */
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}
interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>
  getViewport(opts: { scale: number }): { width: number; height: number }
  render(opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): {
    promise: Promise<void>
  }
  cleanup?(): void
}
interface PdfDocument {
  numPages: number
  getPage(n: number): Promise<PdfPage>
  destroy(): Promise<void>
}

/** A page whose text length falls at/below this is treated as "no usable text". */
export const MIN_PAGE_TEXT_CHARS = 80

/** The whole-document extraction result handed to the financial detector. */
export interface PdfExtractResult {
  pageCount: number
  pages: PdfPageExtraction[]
  warnings: string[]
}

let workerReady = false

/** Lazily import pdf.js and point it at its bundled worker (Vite-fingerprinted). */
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerReady) {
    // `?url` yields a hashed, base-path-aware URL so this keeps working under
    // the GitHub Pages sub-path. The worker keeps PDF parsing off the main thread.
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    workerReady = true
  }
  return pdfjs
}

/** Open a PDF File as a pdf.js document. Throws a plain Error on failure. */
export async function loadPdfDocument(file: File): Promise<PdfDocument> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  return (await task.promise) as unknown as PdfDocument
}

/**
 * Reconstruct visual lines from pdf.js text items.
 *
 * pdf.js returns positioned fragments, not lines. We bucket fragments by their
 * baseline Y (top-to-bottom), order each bucket left-to-right by X, and join
 * with spacing that widens when there is a real horizontal gap — so a label and
 * its figures stay on one line and remain separable by the financial parser.
 */
function itemsToLines(items: PdfTextItem[]): string {
  const frags = items
    .filter((it) => typeof it.str === 'string')
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))
    .filter((f) => f.str.trim() !== '' || f.w > 0)

  if (frags.length === 0) return ''

  // Bucket into lines: a fragment joins the current line if its baseline is
  // within a small tolerance of the line's running baseline.
  const sorted = [...frags].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; frags: typeof frags }[] = []
  const Y_TOLERANCE = 3
  for (const frag of sorted) {
    const line = lines.find((l) => Math.abs(l.y - frag.y) <= Y_TOLERANCE)
    if (line) line.frags.push(frag)
    else lines.push({ y: frag.y, frags: [frag] })
  }

  return lines
    .map((line) => {
      const ordered = line.frags.sort((a, b) => a.x - b.x)
      let out = ''
      let prevEnd: number | null = null
      for (const frag of ordered) {
        if (prevEnd !== null) {
          const gap = frag.x - prevEnd
          // A wide gap denotes a column break; a small one a normal word space.
          out += gap > 6 ? '   ' : out.endsWith(' ') || frag.str.startsWith(' ') ? '' : ' '
        }
        out += frag.str
        prevEnd = frag.x + frag.w
      }
      return out.replace(/\s+$/g, '')
    })
    .filter((line) => line.trim() !== '')
    .join('\n')
}

/** Extract the embedded text layer from one already-loaded page. */
export async function extractPageText(page: PdfPage): Promise<string> {
  const content = await page.getTextContent()
  const text = itemsToLines(content.items as PdfTextItem[])
  page.cleanup?.()
  return text
}

/**
 * Extract embedded text from every page of a PDF File.
 *
 * Each page is graded: pages above {@link MIN_PAGE_TEXT_CHARS} are marked
 * `embedded_text`; thinner pages are marked `none` (candidates for OCR). The
 * function never throws for an image-only PDF — it returns empty pages so the
 * caller can offer the OCR fallback.
 */
export async function extractPdf(file: File): Promise<PdfExtractResult> {
  let doc: PdfDocument
  try {
    doc = await loadPdfDocument(file)
  } catch (err) {
    throw new Error(
      err instanceof Error && /password/i.test(err.message)
        ? 'That PDF is password-protected, so its text could not be read.'
        : 'That PDF could not be opened. It may be corrupted or an unsupported format.',
    )
  }

  const pageCount = doc.numPages
  const pages: PdfPageExtraction[] = []
  const warnings: string[] = []

  for (let n = 1; n <= pageCount; n++) {
    try {
      const page = await doc.getPage(n)
      const text = await extractPageText(page)
      const trimmedLen = text.replace(/\s/g, '').length
      const hasText = trimmedLen > MIN_PAGE_TEXT_CHARS
      pages.push({
        pageNumber: n,
        embeddedText: text,
        extractionMode: hasText ? 'embedded_text' : 'none',
        textLength: text.length,
        warnings: hasText
          ? []
          : ['Little or no embedded text on this page — it may be scanned or image-based.'],
      })
    } catch {
      pages.push({
        pageNumber: n,
        extractionMode: 'none',
        textLength: 0,
        warnings: ['This page could not be read for text.'],
      })
      warnings.push(`Page ${n} could not be read for embedded text.`)
    }
  }

  await doc.destroy().catch(() => {})
  return { pageCount, pages, warnings }
}

/**
 * Render a single page of a PDF File to a canvas, for OCR. Scale > 1 upsamples
 * the page so OCR has more pixels to work with. Kept here because page
 * rendering is a pdf.js concern; the OCR engine itself lives in `pdfOcr.ts`.
 */
export async function renderPdfPageToCanvas(
  doc: PdfDocument,
  pageNumber: number,
  scale = 2,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context for PDF rendering.')
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup?.()
  return canvas
}
