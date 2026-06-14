/**
 * Generate a tiny, text-based sample PDF (annual-accounts-sample.pdf) with no
 * third-party dependencies. The output is committed to public/sample-data/ so
 * the app ships with a safe, self-authored financial PDF to demonstrate the
 * embedded-text extraction path.
 *
 *   node scripts/make-sample-pdf.mjs
 *
 * It writes a 2-page PDF: an income statement and a balance sheet, laid out in
 * label + two period columns (2023 / 2022) so the financial parser has real
 * table structure to recover.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LABEL_X = 70
const COL1_X = 330
const COL2_X = 430
const TOP_Y = 760
const ROW_GAP = 20

/** A row with a label and its two period figures. */
const row = (label, a, b) => ({
  segs: [
    { x: LABEL_X, text: label },
    { x: COL1_X, text: a },
    { x: COL2_X, text: b },
  ],
})
const title = (text, size = 15) => ({ segs: [{ x: LABEL_X, text }], size })
const caption = (text) => ({ segs: [{ x: LABEL_X, text }], size: 10 })
const header = () => ({ segs: [{ x: COL1_X, text: '2023' }, { x: COL2_X, text: '2022' }] })
const blank = () => ({ segs: [] })

const incomeStatement = [
  title('ACME Holdings PLC'),
  caption('Annual report and consolidated financial statements 2023'),
  blank(),
  title('Income statement', 13),
  caption('For the year ended 31 December 2023'),
  caption('(in thousands of EUR)'),
  blank(),
  header(),
  row('Revenue', '12,450', '10,980'),
  row('Cost of sales', '(7,230)', '(6,540)'),
  row('Gross profit', '5,220', '4,440'),
  row('Operating expenses', '(2,980)', '(2,610)'),
  row('Operating profit', '2,240', '1,830'),
  row('Net finance costs', '(180)', '(210)'),
  row('Profit before tax', '2,060', '1,620'),
  row('Tax expense', '(515)', '(405)'),
  row('Net profit for the year', '1,545', '1,215'),
]

const balanceSheet = [
  title('ACME Holdings PLC', 13),
  title('Balance sheet', 13),
  caption('As at 31 December 2023'),
  caption('(in thousands of EUR)'),
  blank(),
  header(),
  row('Non-current assets', '8,900', '8,100'),
  row('Current assets', '4,240', '4,070'),
  row('Cash and cash equivalents', '2,100', '1,650'),
  row('Total assets', '15,240', '13,820'),
  row('Share capital', '3,000', '3,000'),
  row('Retained earnings', '6,120', '4,980'),
  row('Total equity', '9,120', '7,980'),
  row('Non-current liabilities', '3,800', '3,500'),
  row('Current liabilities', '2,320', '2,340'),
  row('Total liabilities', '6,120', '5,840'),
  row('Total liabilities and equity', '15,240', '13,820'),
]

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function contentStream(lines) {
  let s = 'BT\n'
  let y = TOP_Y
  for (const line of lines) {
    const size = line.size ?? 10.5
    for (const seg of line.segs) {
      s += `/F1 ${size} Tf\n`
      s += `1 0 0 1 ${seg.x} ${y} Tm (${escapePdfText(seg.text)}) Tj\n`
    }
    y -= ROW_GAP
  }
  s += 'ET'
  return s
}

// Objects: 1 Catalog, 2 Pages, 3 Page1, 4 Contents1, 5 Font, 6 Page2, 7 Contents2.
const stream1 = contentStream(incomeStatement)
const stream2 = contentStream(balanceSheet)

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream1)} >>\nstream\n${stream1}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  `<< /Length ${Buffer.byteLength(stream2)} >>\nstream\n${stream2}\nendstream`,
]

let pdf = '%PDF-1.4\n'
const offsets = []
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
})

const xrefStart = Buffer.byteLength(pdf)
const count = objects.length + 1
let xref = `xref\n0 ${count}\n0000000000 65535 f\r\n`
for (const offset of offsets) {
  xref += `${String(offset).padStart(10, '0')} 00000 n\r\n`
}
pdf += xref
pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

const out = join(process.cwd(), 'public', 'sample-data', 'annual-accounts-sample.pdf')
writeFileSync(out, pdf, 'latin1')
console.log(`Wrote ${out} (${Buffer.byteLength(pdf)} bytes)`)
