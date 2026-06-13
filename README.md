# The Publisher

**Turn any spreadsheet into a domain-agnostic, interactive living report — entirely in your browser.**

The Publisher is a lightweight, client-side prototype of a "living document" tool. Drop in a
spreadsheet — **CSV, Excel (`.xlsx`/`.xlsm`/`.xlsb`/`.xls`), Apple Numbers (`.numbers`) or
OpenDocument (`.ods`)** — and the page profiles it, **infers the generic structure of the data**,
**plans a set of useful views**, and renders them as an interactive report. There is **no backend, no
database, no upload, and no API keys** — your file is read and analysed locally and never leaves your
device.

> Live demo (once deployed): **https://pappa211.github.io/The-publisher-/**

---

## v0.2 — Domain-Agnostic Report Planner

v0.1 was a static dashboard of metadata boxes. v0.2 turns that metadata into an interactive report
by reasoning about the **generic grammar** of the data rather than any specific business domain. The
pipeline is:

```text
CSV · Excel · Numbers · ODS
  ↓  parse            (PapaParse for CSV/TSV, SheetJS for workbooks — all client-side)
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
- Plain CSS with design tokens, and **hand-built CSS/SVG charts** — no charting dependency was added,
  keeping the main bundle small (~70 kB gzipped JS).

### Project structure

Logic is kept out of the UI: profiling, role inference, planning and aggregation are pure functions
in `src/lib/`; components in `src/components/` only render.

```text
src/
├── lib/
│   ├── parseFile.ts       # entry point: sniff file type & dispatch (+ sample registry)
│   ├── parseCsv.ts        # PapaParse wrapper (CSV/TSV)
│   ├── parseSpreadsheet.ts# SheetJS wrapper (xlsx/xls/xlsb/ods/numbers), lazy-loaded
│   ├── dataset.ts         # shared: header normalization, cell coercion -> Dataset
│   ├── inferTypes.ts      # value parsing + column type inference
│   ├── profile.ts         # per-column profiling & stats
│   ├── roles.ts           # NEW: generic semantic role inference
│   ├── reportPlanner.ts   # NEW: profiled dataset + roles -> ReportPlan
│   ├── aggregate.ts       # NEW: filter-aware grouping / time-bucketing / pivots
│   └── format.ts          # display formatting helpers
├── components/
│   ├── Report.tsx         # NEW: narrative + filters + suggested views
│   ├── FilterBar.tsx      # NEW: active-filter chips
│   ├── RoleBadge.tsx      # NEW: generic-role pill
│   ├── views/             # NEW: KeyMeasures, TimeTrend, CategoryBreakdown,
│   │                      #      Distribution, CrossTab, CompletenessMap, …
│   ├── Workspace.tsx      # tabs: Report · Column diagnostics · Data table
│   ├── DataTable.tsx, ColumnProfileCard.tsx, SummaryCards.tsx, …
│   └── UploadZone.tsx, Header.tsx
├── types/index.ts         # shared types (Dataset, ColumnRole, ReportPlan, …)
└── App.tsx, main.tsx
public/sample-data/        # bundled sample CSVs (see below)
scripts/verify-planner.ts  # dev-only: prints roles + plan per sample
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

## Test it with three different data shapes

The app ships with deliberately diverse samples so you can confirm it is **not** a trade-ledger
viewer. On the upload screen, pick any sample chip (or drop your own CSV / Excel / Numbers file):

| Sample | File | The planner naturally surfaces |
| --- | --- | --- |
| **Trade ledger** | `public/sample-data/trade-ledger-sample.csv` | `event_time` as the time axis; `symbol`/`side`/`event_type`/`strategy` dimensions; `price`/`quantity`/`pnl` measures (negatives detected); `event_id` as an identifier; event counts and drill-down. |
| **Trial balance** | `public/sample-data/trial-balance-sample.csv` | `account_no`/`account_name`/`account_class`/`entity` dimensions; `debit`/`credit`/`balance` measures; largest balances via the breakdown; completeness gaps; table exploration. `account_no` is treated as a key, **not** summed. |
| **Football results** | `public/sample-data/football-results-sample.csv` | `date` time axis; `league`/`season`/`home_team`/`away_team`/`venue` dimensions; `home_goals`/`away_goals` measures; matches over time; category and cross-tab breakdowns. |

A fourth sample, `world-cities.csv`, exercises a reference-data shape (mixed types, a free-text label,
a boolean flag).

Things to try on any sample:

- Switch the **Group by** / **Measure** / **Aggregate** selectors on a view to explore.
- **Click a category bar** (or a cross-tab cell) to add a filter — watch the chips appear and every
  chart, the key measures and the data table recompute. Remove chips or **Clear all** to reset.
- Open **Column diagnostics** to see each column's inferred **generic role** and why.
- Open the **Data table** for search, type-aware sort, and pagination.

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

- **Heuristic roles.** Role inference is structural and conservative; it can be fooled (e.g. an
  integer "year" is treated as a numeric measure, a near-unique code without an id-like name may read
  as text). This is deliberate — guessing business meaning is exactly what the project avoids.
- **Generic, not optimal, combinations.** The planner picks a reasonable primary measure/dimension; it
  does not understand that, say, home and away goals could be summed into a single "total goals"
  metric. Derived fields are intentionally not fabricated.
- **In-memory & non-virtualized.** Type inference samples the first 5,000 rows; stats use all rows.
  Very large files (hundreds of MB) will be slow. The table is paginated but not virtualized.
- **Spreadsheets import the first sheet with data**; additional sheets are skipped (with a notice).
  Cell values are read at their underlying value (e.g. a `50%`-formatted cell reads as `0.5`).
- **Single file at a time**, and **no persistence/sharing** — reloading clears the report.
- **Charts are simple by design** (CSS/SVG) to keep the dependency footprint tiny.
- **Filters are equality-only** (one value per column) and apply to the report and data table; the
  column-diagnostics cards still describe the full file.

---

## Suggested next iterations

- **Richer filters**: multi-select and numeric/date range filters (e.g. click a histogram bar or
  brush the trend line to filter a range).
- **Smarter planning**: rank suggested views by usefulness; offer optional derived fields (ratios,
  row sums) the user can opt into; detect correlations between measures.
- **Export & share**: download a standalone HTML/PDF report, or encode the filter/view state in the URL.
- **More inputs**: JSON, multi-sheet selection for workbooks, and paste-to-analyse. (CSV/TSV, Excel,
  Numbers and ODS are already supported.)
- **Performance**: parse in a Web Worker and virtualize the table for very large files.
- **Editable cells & annotations** to push further toward a true "living document".

---

## Privacy

The Publisher is fully static. Your file is parsed in the browser using standard web APIs and is
**never uploaded** to any server. There is no analytics, no tracking, and no third-party data
collection.
