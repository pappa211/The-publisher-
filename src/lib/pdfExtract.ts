/**
 * Client-side PDF text extraction.
 *
 * This module is the only place that talks to `pdfjs-dist`. It loads a PDF in
 * the browser, pulls embedded text out of each page in a layout-aware way, and
 * can rasterize a page to a canvas for OCR. The file is never uploaded.
 */
import type { PdfPageExtraction } from '../types'

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>
  getViewport(opts: { scale: number }): { width: number; height: number }
  render(opts: {
    canvas?: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: unknown
  }): {
    promise: Promise<void>
  }
  cleanup?(): void
}

interface PdfDocument {
  numPages: number
  getPage(n: number): Promise<PdfPage>
  destroy(): Promise<void>
}

export const MIN_PAGE_TEXT_CHARS = 80

export interface PdfExtractResult {
  pageCount: number
  pages: PdfPageExtraction[]
  warnings: string[]
}

let workerReady = false

async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerReady) {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    workerReady = true
  }
  return pdfjs
}

export async function loadPdfDocument(file: File): Promise<PdfDocument> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  const proxy = (await task.promise) as unknown as {
    numPages: number
    getPage(n: number): Promise<PdfPage>
  }
  return {
    numPages: proxy.numPages,
    getPage: (n: number) => proxy.getPage(n),
    destroy: () => task.destroy(),
  }
}

function itemsToLines(items: PdfTextItem[]): string {
  const frags = items
    .filter((it) => typeof it.str === 'string')
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))
    .filter((f) => f.str.trim() !== '' || f.w > 0)

  if (frags.length === 0) return ''

  const sorted = [...frags].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; frags: typeof frags }[] = []
  const yTolerance = 3
  for (const frag of sorted) {
    const line = lines.find((l) => Math.abs(l.y - frag.y) <= yTolerance)
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

export async function extractPageText(page: PdfPage): Promise<string> {
  const content = await page.getTextContent()
  const text = itemsToLines(content.items as PdfTextItem[])
  page.cleanup?.()
  return text
}

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
          : ['Little or no embedded text on this page; it may be scanned or image-based.'],
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

  try {
    await doc.destroy()
  } catch {
    /* ignore */
  }
  return { pageCount, pages, warnings }
}

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
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup?.()
  return canvas
}
