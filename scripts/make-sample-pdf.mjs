/**
 * Generate a tiny, text-based sample PDF (annual-accounts-sample.pdf) with no
 * third-party dependencies. The output is committed to public/sample-data/ so
 * the app ships with a safe, self-authored financial PDF to demonstrate the
 * embedded-text extraction path.
 *
 *   node scripts/make-sample-pdf.mjs
 *
 * It writes a 3-page PDF: an income statement, a balance sheet and a cash flow
 * statement, laid out in label + two period columns (2025 / 2024) so the
 * financial parser has real table structure to recover.
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
const header = () => ({ segs: [{ x: COL1_X, text: '2025' }, { x: COL2_X, text: '2024' }] })
const blank = () => ({ segs: [] })

const incomeStatement = [
  title('Example Holdings PLC'),
  caption('Annual report and consolidated financial statements 2025'),
  blank(),
  title('Consolidated income statement', 13),
  caption('For the year ended 31 December 2025'),
  caption('Amounts in NOK thousand'),
  blank(),
  header(),
  row('Revenue', '125,000', '111,500'),
  row('Cost of sales', '(73,500)', '(66,800)'),
  row('Gross profit', '51,500', '44,700'),
  row('Operating expenses', '(23,800)', '(21,400)'),
  row('EBITDA', '27,700', '23,300'),
  row('Depreciation and amortization', '(6,200)', '(5,900)'),
  row('Operating profit', '21,500', '17,400'),
  row('Finance costs', '(3,100)', '(2,800)'),
  row('Profit before tax', '19,300', '15,300'),
  row('Income tax expense', '(4,250)', '(3,370)'),
  row('Profit for the year', '15,050', '11,930'),
]

const balanceSheet = [
  title('Example Holdings PLC', 13),
  title('Consolidated statement of financial position', 13),
  caption('As at 31 December 2025'),
  caption('Amounts in NOK thousand'),
  blank(),
  header(),
  row('Non-current assets', '172,000', '160,000'),
  row('Inventories', '38,500', '34,200'),
  row('Trade receivables', '42,100', '39,800'),
  row('Cash and cash equivalents', '27,600', '22,100'),
  row('Current assets', '108,200', '96,100'),
  row('Total assets', '280,200', '256,100'),
  row('Share capital', '15,000', '15,000'),
  row('Retained earnings', '87,300', '72,250'),
  row('Total equity', '102,300', '87,250'),
  row('Non-current liabilities', '109,000', '105,000'),
  row('Current liabilities', '68,900', '63,850'),
  row('Total liabilities', '177,900', '168,850'),
  row('Total equity and liabilities', '280,200', '256,100'),
]

const cashFlow = [
  title('Example Holdings PLC', 13),
  title('Consolidated statement of cash flows', 13),
  caption('For the year ended 31 December 2025'),
  caption('Amounts in NOK thousand'),
  blank(),
  header(),
  row('Profit before tax', '19,300', '15,300'),
  row('Depreciation and amortization', '6,200', '5,900'),
  row('Change in working capital', '(2,700)', '(1,800)'),
  row('Income taxes paid', '(3,900)', '(3,100)'),
  row('Net cash from operating activities', '18,900', '16,300'),
  row('Purchase of property plant and equipment', '(16,400)', '(12,100)'),
  row('Net cash used in investing activities', '(16,400)', '(12,100)'),
  row('Proceeds from borrowings', '9,000', '6,500'),
  row('Repayment of borrowings', '(6,000)', '(5,200)'),
  row('Dividends paid', '(5,200)', '(4,300)'),
  row('Net cash used in financing activities', '(2,200)', '(3,000)'),
  row('Cash and cash equivalents at end of period', '22,400', '22,100'),
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

// Objects: 1 Catalog, 2 Pages, 3 Page1, 4 Contents1, 5 Font, 6 Page2,
// 7 Contents2, 8 Page3, 9 Contents3.
const stream1 = contentStream(incomeStatement)
const stream2 = contentStream(balanceSheet)
const stream3 = contentStream(cashFlow)

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream1)} >>\nstream\n${stream1}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  `<< /Length ${Buffer.byteLength(stream2)} >>\nstream\n${stream2}\nendstream`,
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 9 0 R >>',
  `<< /Length ${Buffer.byteLength(stream3)} >>\nstream\n${stream3}\nendstream`,
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
