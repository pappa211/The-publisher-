# The Publisher

**Turn financial documents — CSVs, spreadsheets, XML/XBRL and now PDFs — into an interactive
living report, entirely in your browser.**

The Publisher is a lightweight, client-side prototype of a financial "living document" tool. Drop in a
data or report file — **CSV, Excel (`.xlsx`/`.xlsm`/`.xlsb`/`.xls`), Apple Numbers (`.numbers`),
OpenDocument (`.ods`), XML (`.xml`), XBRL (`.xbrl`), Inline XBRL (`.xhtml`) or a financial
`.pdf`** — and the page reads it, **extracts the figures** (with an experimental OCR fallback for
scanned PDFs), **detects financial statements**, **profiles the structure**, **plans a set of useful
views**, and renders it as an interactive report. There is **no backend, no database, no upload, and
no API keys** — your file is read and analysed locally and never leaves your device.

> Live demo (once deployed): **https://pappa211.github.io/The-publisher-/**

---

## v0.3 — Financial document mode with experimental PDF / OCR extraction

v0.3 turns The Publisher toward **financial statements and annual accounts**, and adds a
**browser-only PDF pipeline**. Upload an annual report, trial balance, statement extract or
spreadsheet and the app tries to turn it into a structured, interactive financial report — making
its **uncertainty visible** rather than pretending extraction is perfect.

```text
PDF file
  ↓  embedded-text extraction        (pdfjs-dist, layout-aware, page by page)
  ↓  is the embedded text usable?
       ├─ yes → parse the text
       └─ no  → offer experimental OCR (tesseract.js, in-browser WASM, page-limited)
  ↓  financial-statement detection    (income statement · balance sheet · cash flow · equity · notes)
  ↓  normalization                    (line items → periods → amounts, with confidence + warnings)
  ↓  interactive financial report     (overview · statements · searchable items · raw text fallback)
```

The same detector/parser is reused for **embedded text and OCR text**, and the extracted figures are
normalized into the **same financial model** the spreadsheet and XBRL paths already use, so a PDF gets
the same statement-aware highlights, balance-sheet checks and exploration as any other input.

Everything still runs **only in the browser** — PDF parsing, OCR and all analysis are local. The one
network fetch the OCR path makes is Tesseract's own WebAssembly engine + English model (loaded from a
public CDN on first use, like loading a script); **your document is never uploaded**.

---

## v0.2 — Domain-Agnostic Report Planner

v0.1 was a static dashboard of metadata boxes. v0.2 turns that metadata into an interactive report
by reasoning about the **generic grammar** of the data rather than any specific business domain. The
pipeline is:

```text
CSV · Excel · Numbers · ODS · XML · XBRL
  ↓  parse            (PapaParse for CSV/TSV, SheetJS for workbooks, DOMParser for XML/XBRL — all client-side)
  ↓  column profiling  (types, completeness, cardinality, stats)
  ↓  generic roles     (temporal · measure · dimension · identifier · text · flag)
  ↓  report plan       (title, narrative, findings, suggested views, quality notes)
  ↓  interactive views (filters · charts · pivots · tables)
```

The key idea: **profile first, infer generic roles second, plan views third, render last.** A trial
balance, a football-results file and a trade ledger have completely different meanings, but
structurally they are all just combinations of dates, categorical dimensions, numeric measures,
identifiers and text — so the same code produces a sensible (but different) report for each.

### Why it does not overfit

- Roles are inferred from **structure only** — type, cardinality, value length and sign — never from
  business column names. A column called `pnl`, `balance` or `home_goals` is simply "a numeric
  measure"; `symbol`, `entity` or `home_team` is simply "a categorical dimension".
- The **only** place names are consulted is a small, cross-domain identifier convention
  (`id`, `code`, `no`, `uuid`, `key`, …), used purely to tell keys apart from measures/dimensions.
  For example `account_no` is recognised as a grouping key and is **not** summed like a real measure.
- An optional `datasetKindGuess` ("Time-stamped event log", "Balance-style summary", …) is included,
  but it is **explicitly low-authority** and never drives any logic. The app is fully useful even if
  that guess is wrong.

You can see this for yourself — a dev script prints the inferred roles and plan for every bundled
sample (see [Verify the planner](#verify-the-planner)).

### What you see after upload

1. A **report title** and a concise, plain-language **narrative summary**.
2. **Key structural findings** as chips (time axis, measures, dimensions, identifiers, completeness).
3. **Suggested views**, chosen from the detected structure:
   - **Key measures** — totals/averages per numeric field;
   - **Trend over time** — count or an aggregated measure over an auto-bucketed date axis (SVG line);
   - **Category breakdown** — bars by any dimension, by count or a measure; **click a bar to filter**;
   - **Distribution** — histogram of any measure;
   - **Cross-tab** — a two-dimension pivot heat-table; **click a cell to filter**;
   - **Completeness map** — per-column missingness for the current selection.
4. **Interactive filters** — active filters show as removable chips and apply across the report and
   the data table; charts and summaries recompute against the filtered rows.
5. **Deeper detail** — per-column **diagnostics** (now annotated with each column's generic role) and
   the original searchable / sortable / paginated **data table**.

The column cards and table still exist, but they no longer dominate the first impression.

---

## Tech stack

- [Vite](https://vitejs.dev/) — build tool & dev server
- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (strict)
- [PapaParse](https://www.papaparse.com/) — robust client-side CSV/TSV parsing
- [SheetJS](https://sheetjs.com/) (`xlsx`) — reads Excel, OpenDocument and Apple Numbers workbooks.
  It is **lazy-loaded on demand** (dynamic `import`), so it ships as a separate chunk and only
  downloads when you actually open a spreadsheet — the CSV path keeps the initial bundle small.
- Browser-native `DOMParser` — reads XML, XBRL linkbases and Inline XBRL fact files without adding
  another parsing dependency.
- [pdfjs-dist](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) — Mozilla's PDF.js, used to load PDFs,
  extract the embedded text layer page by page (layout-aware), and rasterize pages for OCR. **Lazy-loaded**
  and run in a **web worker**, so it ships as its own chunk and only downloads when you open a PDF.
- [Tesseract.js](https://github.com/naptha/tesseract.js) (`tesseract.js`) — a WebAssembly OCR engine for
  the **experimental** scanned-PDF fallback. Also **lazy-loaded**; the engine + English model are fetched
  on demand from a public CDN and run **entirely in the browser**.
- Plain CSS with design tokens, and **hand-built CSS/SVG charts** — no charting dependency was added.
  PDF.js and Tesseract.js are code-split, so the initial bundle stays small (~86 kB gzipped JS); the
  heavy readers download only when a spreadsheet or PDF is actually opened.

### Project structure

Logic is kept out of the UI: profiling, role inference, planning and aggregation are pure functions
in `src/lib/`; components in `src/components/` only render.

File-type routing is separate from the UI; embedded PDF text is separate from OCR; OCR is separate
from financial parsing; parsing is separate from rendering.

```text
src/
├── lib/
│   ├── parseFile.ts                # entry point: sniff file type & dispatch (+ sample registry)
│   ├── parseCsv.ts                 # PapaParse wrapper (CSV/TSV)
│   ├── parseSpreadsheet.ts         # SheetJS wrapper (xlsx/xls/xlsb/ods/numbers), lazy-loaded
│   ├── parseXml.ts                 # XML/XBRL facts, linkbases and generic XML flattening
│   ├── parsePdf.ts                 # v0.3: PDF orchestrator → FinancialDocument + shared records
│   ├── pdfExtract.ts               # v0.3: pdf.js embedded-text extraction & page rasterization
│   ├── pdfOcr.ts                   # v0.3: tesseract.js OCR (progress · cancel · page limit)
│   ├── financialTextParser.ts      # v0.3: line → label + values, period & unit detection
│   ├── financialStatementDetector.ts # v0.3: headings → statements → structured line items
│   ├── financialCsv.ts             # v0.3: wide financial CSV → finance-aware path
│   ├── financialAnalysis.ts        # shared finance model: facts, highlights, checks
│   ├── dataset.ts                  # shared: header normalization, cell coercion -> Dataset
│   ├── inferTypes.ts, profile.ts   # value parsing, type inference, per-column profiling
│   ├── roles.ts, reportPlanner.ts  # generic semantic roles + report planning
│   └── aggregate.ts, format.ts     # filter-aware aggregation + display formatting
├── components/
│   ├── FinancialWorkspace.tsx      # v0.3: PDF document reader; owns the OCR lifecycle
│   ├── PdfExtractionSummary.tsx    # v0.3: document overview (mode, pages, warnings)
│   ├── PdfOcrProgress.tsx          # v0.3: OCR call-to-action, progress bar, cancel
│   ├── FinancialStatementView.tsx  # v0.3: one statement as a period-over-period table
│   ├── ExtractedTableView.tsx      # v0.3: searchable/filterable extracted line items
│   ├── Confidence.tsx              # v0.3: shared confidence pill
│   ├── FinancialStatementAnalysis.tsx # shared finance highlights + checks panel
│   ├── Report.tsx, FilterBar.tsx, RoleBadge.tsx, views/ … # generic interactive report
│   ├── Workspace.tsx               # tabs: Financial document · Report · Diagnostics · Data
│   └── DataTable.tsx, UploadZone.tsx, Header.tsx, …
├── types/index.ts                  # shared types (Dataset, FinancialDocument, ReportPlan, …)
└── App.tsx, main.tsx
public/sample-data/                 # bundled sample CSVs + a generated text PDF (see below)
scripts/verify-planner.ts           # dev-only: prints roles + plan per sample CSV
scripts/make-sample-pdf.mjs         # dev-only: regenerates the sample annual-accounts PDF
```

---

## Run it locally

Requires Node.js 18+ (developed on Node 22).

```bash
npm install
npm run dev
```

Then open the URL Vite prints (it includes the GitHub Pages base path):

```text
http://localhost:5173/The-publisher-/
```

### Production build

```bash
npm run build     # type-checks with tsc, then builds to dist/
npm run preview   # serves the production build locally to verify it
```

---

## Test it with CSV, XLSX, PDF and OCR inputs

The app ships with deliberately diverse samples. On the upload screen, pick a sample chip (or drop
your own CSV / Excel / Numbers / ODS / XML / XBRL / PDF file):

| Sample | File | What it exercises |
| --- | --- | --- |
| **Annual accounts (PDF)** | `public/sample-data/annual-accounts-sample.pdf` | The **PDF path**: a 2-page text-based PDF (income statement + balance sheet). Extracts embedded text, detects both statements, normalizes line items to FY 2023 / FY 2022 columns, and ties the balance sheet. |
| **Income statement** | `public/sample-data/income-statement-sample.csv` | A **wide financial CSV** (`line_item, 2023, 2022, 2021`) routed through the finance-aware path: highlights, periods and statement detection. |
| **Balance sheet** | `public/sample-data/balance-sheet-sample.csv` | A wide balance-sheet CSV; the balance-sheet equation check ties assets to liabilities + equity. |
| **Trial balance** | `public/sample-data/trial-balance-sample.csv` | A long-format ledger — kept on the **generic** report path (`account_no` is treated as a key, **not** summed). |
| **Trade ledger** | `public/sample-data/trade-ledger-sample.csv` | Time-stamped events: `event_time` time axis, `price`/`quantity`/`pnl` measures (negatives), drill-down. |
| **Football results** | `public/sample-data/football-results-sample.csv` | A non-financial shape, to prove the app is not a finance-only viewer: trends, category and cross-tab breakdowns. |

### Testing the experimental PDF / OCR path

- **Text-based PDF:** open the **Annual accounts (PDF)** sample (or drop any text PDF). You land on the
  **Financial document** tab: a document overview (extraction mode, pages with text, statements found),
  the detected **income statement** and **balance sheet** as period-over-period tables with confidence
  indicators, a **searchable** extracted-items table, and a **raw extracted text by page** fallback.
- **Scanned / image-based PDF (OCR):** drop a scanned PDF (or "print to PDF" an image, or export a slide
  as PDF). When little embedded text is found, the document tab shows **"This PDF appears to be scanned or
  image-based"** with a **Run experimental OCR** button. OCR runs locally with a **progress bar** and a
  **Cancel** button, processes up to the first few pages, then re-parses. If OCR fails or is cancelled, the
  app shows a clear message and still presents whatever was extracted — it never breaks.
- **CSV / XLSX still work:** the generic and finance-aware report paths are unchanged; financial CSV/XLSX
  files land on the finance path, everything else on the generic report.

> Don't have a scanned PDF handy? Any image-only PDF works. The first OCR run downloads the Tesseract
> engine + English model from a CDN (a few MB) and caches it; subsequent runs are faster.

Things to try on any sample:

- Switch the **Group by** / **Measure** / **Aggregate** selectors on a view to explore.
- **Click a category bar** (or a cross-tab cell) to add a filter — chips appear and every chart, the key
  measures and the data table recompute. Remove chips or **Clear all** to reset.
- On a PDF, **click a statement row** to inspect the exact **raw text** the figure was parsed from.
- Open **Column diagnostics** for each column's inferred **generic role**, and the **Data table** for
  search, type-aware sort and pagination.

### Verify the planner

To see, in plain text, that the planner adapts to each shape without any domain code:

```bash
npx tsx scripts/verify-planner.ts
```

It prints the inferred role of every column, the chosen time axis / measures / dimensions, the
suggested views and the narrative for each bundled CSV. (Dev-only; not part of the app build.)

---

## Deploy to GitHub Pages

The repo includes a workflow at **`.github/workflows/deploy.yml`** that builds the app and publishes
`dist/` to GitHub Pages on every push to `main`.

**One-time setup** in the GitHub repository (`pappa211/The-publisher-`):

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or re-run the workflow from the **Actions** tab). The workflow runs `npm ci`,
   `npm run build`, then uploads and deploys `dist/`.
4. The site goes live at **https://pappa211.github.io/The-publisher-/**.

> **Why the `base` setting?** Project sites are served from a subpath (`/The-publisher-/`), so
> `vite.config.ts` sets `base: '/The-publisher-/'`. All asset URLs and the sample-data fetches use
> this base automatically. If you fork this under a different repo name, update `base` to match
> `/<your-repo-name>/`.

---

## Current limitations / tradeoffs

### PDF & OCR (experimental, v0.3)

- **Layout is reconstructed, not native.** PDFs have no real "table" structure; the extractor groups
  positioned text fragments into visual lines and matches trailing figures to detected period columns.
  Complex multi-column layouts, footnote markers, nested sub-totals or non-standard headers **can be
  misread**. Figures are heuristically aligned **left-to-right** to period columns.
- **OCR is genuinely experimental.** Tesseract.js can **misread numbers** (e.g. `1` vs `7`, lost
  parentheses/decimals). It is **opt-in**, processes only the **first few pages by default**, runs
  **sequentially** and is **cancellable**. It needs a one-time CDN download of the engine + English
  model, and currently recognises **English** only.
- **Failures are surfaced, not hidden.** Every statement and line item carries a **confidence**;
  warnings call out thin embedded text, OCR use, uncertain periods and unassigned items. If nothing
  structured can be extracted, the app still shows the **raw page text** and never crashes.
- **Statement detection is keyword-driven.** Headings, periods, units and currencies are matched with
  heuristics over a common annual-accounts vocabulary; an unusual report may produce an
  `Unrecognized section` or miss a statement.

### General

- **Heuristic roles.** Role inference is structural and conservative; it can be fooled (e.g. an
  integer "year" is treated as a numeric measure, a near-unique code without an id-like name may read
  as text). This is deliberate — guessing business meaning is exactly what the project avoids.
- **Generic, not optimal, combinations.** The planner picks a reasonable primary measure/dimension; it
  does not understand that, say, home and away goals could be summed into a single "total goals"
  metric. Derived fields are intentionally not fabricated.
- **In-memory & non-virtualized.** Type inference samples the first 5,000 rows; stats use all rows.
  Very large files (hundreds of MB) will be slow. The table is paginated but not virtualized.
- **Workbook sheets are all scanned.** When financial-statement sheets are detected, the app
  normalizes line items, periods, units and amounts into one finance-aware fact table. Other
  non-empty sheets are merged with source-sheet metadata. Cell values are read at their underlying
  value (e.g. a `50%`-formatted cell reads as `0.5`).
- **XML support is single-file.** XBRL instance and Inline XBRL files can produce finance-aware
  facts. XBRL linkbase files such as calculation, presentation, definition and label XML are parsed
  as taxonomy relationship tables because those files normally describe structure rather than
  reported amounts.
- **Single file at a time**, and **no persistence/sharing** — reloading clears the report.
- **Charts are simple by design** (CSS/SVG) to keep the dependency footprint tiny.
- **Filters are equality-only** (one value per column) and apply to the report and data table; the
  column-diagnostics cards still describe the full file.

---

## Suggested next iterations

- **Stronger PDF extraction**: use pdf.js text coordinates to reconstruct true column geometry (not just
  left-to-right order), handle multi-column page layouts, and detect note cross-references.
- **Better OCR**: bundle the Tesseract engine + language data locally (fully offline), add language
  selection, OCR only the pages likely to contain statements, and let the user pick which pages to OCR.
- **Smarter statement modelling**: link sub-totals to their components, validate income-statement
  arithmetic, derive ratios (margins, gearing), and reconcile across statements.
- **Richer filters**: multi-select and numeric/date range filters (e.g. click a histogram bar or
  brush the trend line to filter a range).
- **Export & share**: download a standalone HTML/PDF report, or encode the filter/view state in the URL.
- **More inputs**: JSON, zipped XBRL report packages, and paste-to-analyse.
- **Performance**: parse in a Web Worker and virtualize the table for very large files.
- **Editable cells & annotations** to push further toward a true "living document".

---

## Privacy

The Publisher is fully static. Your file is parsed in the browser using standard web APIs and is
**never uploaded** to any server. There is no analytics, no tracking, and no third-party data
collection.
