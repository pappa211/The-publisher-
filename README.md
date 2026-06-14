# The Publisher

**Browser-only financial statement reconstruction prototype.**

The Publisher v0.4 reads annual accounts and financial statement files locally in the browser,
extracts the financial content, reconstructs primary statements, and presents the result as an
interactive analyst-style page.

Live demo:

https://pappa211.github.io/The-publisher-/

## Product Focus

The app is no longer primarily a generic "CSV to dashboard" experiment. The core domain is now:

```text
Many possible source formats
Many possible financial statement layouts
One target domain: annual accounts and financial statements
```

The main post-upload experience is built around:

- Document overview and extraction confidence
- Detected periods, currency, and scale
- Income statement, balance sheet, and cash flow reconstruction
- Key figures such as revenue, EBIT, net income, assets, equity, liabilities, cash, and cash flow
- Accounting checks such as the balance sheet equation
- Source traceability back to pages, sheets, raw lines, and extraction mode
- Diagnostics and the original generic report as fallback views

## Supported Inputs

- PDF annual reports and financial statements
- CSV and TSV files
- Excel workbooks (`.xlsx`, `.xlsm`, `.xlsb`, `.xls`)
- Apple Numbers (`.numbers`)
- OpenDocument spreadsheets (`.ods`)
- XML, XBRL, and Inline XBRL files

All processing happens in the browser. There is no backend, no database, no cloud OCR, no file
upload, and no API keys.

## Financial Reconstruction Pipeline

```text
File upload
  -> file router
  -> PDF text extraction, OCR fallback, spreadsheet/XML/CSV parsing
  -> financial statement segmentation
  -> period and currency/scale detection
  -> financial line-item extraction
  -> canonical concept classification
  -> accounting checks and warnings
  -> analyst-style financial workspace
```

The current implementation is deterministic and conservative. It preserves original labels and adds
canonical classifications separately. When it is uncertain, it emits warnings rather than pretending
the extraction is exact.

## PDF and OCR Status

PDFs are handled in layers:

1. Extract embedded text with `pdfjs-dist`.
2. Score page-level extraction quality.
3. Build page traces and financial raw lines.
4. Suggest OCR when embedded text is weak.
5. Let the user run OCR with browser-side `tesseract.js`.
6. Keep embedded text if OCR fails or is unavailable.

OCR is experimental and intentionally local-only. It runs page by page, reports progress, and is
bounded so large documents do not freeze the app.

## Statement Coverage

v0.4 focuses on primary statements:

- Income statement / statement of profit or loss
- Balance sheet / statement of financial position
- Cash flow statement / statement of cash flows

Notes are identified as deferred or unclassified content in this iteration. They are not yet
structured into note-level disclosures.

## Samples

Bundled sample files are available from the upload screen:

| Sample | File | Purpose |
| --- | --- | --- |
| Income statement | `public/sample-data/income-statement-sample.csv` | Period columns, revenue, EBIT, tax, net income |
| Balance sheet | `public/sample-data/balance-sheet-sample.csv` | Assets, equity, liabilities, balance equation |
| Cash flow | `public/sample-data/cash-flow-sample.csv` | Operating, investing, financing cash flows |
| Trial balance | `public/sample-data/trial-balance-sample.csv` | Spreadsheet-style finance data |
| Annual accounts PDF | `public/sample-data/annual-accounts-sample.pdf` | Text-based PDF extraction |
| Football results | `public/sample-data/football-results-sample.csv` | Non-financial fallback behavior |

## Run Locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the URL Vite prints. For this GitHub Pages project it normally uses:

```text
http://localhost:5173/The-publisher-/
```

## Build

```bash
npm run build
```

The GitHub Pages project path is preserved in `vite.config.ts`:

```ts
base: '/The-publisher-/'
```

## Deployment

The repo includes `.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to
GitHub Pages when changes are merged to `main`.

One-time repository setup:

1. Open GitHub repository settings.
2. Go to Pages.
3. Set Source to GitHub Actions.
4. Merge to `main` or rerun the workflow from Actions.

## Tech Stack

- Vite
- React 18
- TypeScript
- PapaParse for CSV/TSV
- SheetJS (`xlsx`) for spreadsheets
- `pdfjs-dist` for embedded PDF text extraction
- `tesseract.js` for local browser OCR fallback
- Browser `DOMParser` for XML/XBRL
- Plain CSS and React components

## Key Modules

```text
src/lib/parseFile.ts
src/lib/parsePdf.ts
src/lib/pdfExtract.ts
src/lib/financialNumberParser.ts
src/lib/financialConcepts.ts
src/lib/financialStatementParser.ts
src/lib/financialChecks.ts
src/components/FinancialWorkspace.tsx
src/components/FinancialDocumentOverview.tsx
src/components/FinancialKeyFigures.tsx
src/components/FinancialStatementTabs.tsx
src/components/FinancialStatementTable.tsx
src/components/FinancialChecksPanel.tsx
src/components/ExtractionTracePanel.tsx
src/components/PdfOcrProgress.tsx
```

## Current Limitations

- This is a heuristic reconstruction engine, not a full IFRS parser.
- OCR quality depends on browser performance, PDF image quality, and Tesseract language data.
- Complex multi-column annual-report layouts may still need manual review.
- Notes are not yet structurally extracted.
- Subtotal checks are basic and mostly limited to obvious concepts.
- Very large PDFs can be slow because processing is local and browser-bound.
- The `xlsx` dependency currently has known upstream audit advisories with no direct patched
  replacement available in this dependency line.

## Suggested Next Iterations

- Add stronger table reconstruction for multi-column PDF layouts.
- Add note detection and note-to-line-item cross references.
- Add user-assisted correction for uncertain periods, signs, and statement classification.
- Add derived ratios and common analyst metrics.
- Move heavy PDF/OCR processing into a Web Worker.
- Add export of reconstructed statements to CSV/XLSX.

## Privacy

Files are read locally in your browser. They are not uploaded by the app.
