# The Publisher

**Turn a static CSV file into an interactive, explorable web document — entirely in your browser.**

The Publisher is a lightweight, client-side prototype of a "living document" tool. Drop in a
CSV export and the page instantly profiles it, charts it, and turns it into a readable interactive
report. There is **no backend, no database, no upload, and no API keys** — your file is read and
analysed locally and never leaves your device.

> Live demo (once deployed): **https://pappa211.github.io/The-publisher-/**

---

## What it does

1. **Drag & drop or browse** for a `.csv` file (or load the bundled sample dataset).
2. **Parses the CSV safely on the client** using [PapaParse](https://www.papaparse.com/).
3. **Infers a type for every column** — integer, number, date, boolean or text — using
   conservative, order-aware heuristics (e.g. a bare `2020` stays a number, not a date).
4. **Profiles each column**: completeness, missing-value counts, unique values, numeric summary
   statistics (min / max / mean / median), histograms, and most-frequent categories.
5. **Presents an automatic overview**: headline summary cards (rows, columns, data completeness,
   file size, column-type breakdown) plus a "report card" for every column.
6. **Lets you explore the raw data** in a searchable, sortable, paginated table with type-aware
   sorting and missing-value highlighting.

The result is meant to feel like a small interactive report, not a raw table dump.

---

## Tech stack

- [Vite](https://vitejs.dev/) — build tool & dev server
- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [PapaParse](https://www.papaparse.com/) — robust client-side CSV parsing
- Plain CSS with design tokens, and hand-built CSS charts (no heavy charting dependency)

### Project structure

```text
.
├── .github/workflows/deploy.yml      # GitHub Pages CI/CD
├── public/
│   ├── favicon.svg
│   └── sample-data/world-cities.csv  # bundled demo dataset
├── src/
│   ├── components/                   # UI components (presentational)
│   │   ├── CategoryBars.tsx
│   │   ├── ColumnProfileCard.tsx
│   │   ├── DataTable.tsx
│   │   ├── Header.tsx
│   │   ├── Histogram.tsx
│   │   ├── SummaryCards.tsx
│   │   ├── TypeBadge.tsx
│   │   ├── UploadZone.tsx
│   │   └── Workspace.tsx
│   ├── lib/                          # pure logic, no UI
│   │   ├── format.ts                 # display formatting helpers
│   │   ├── inferTypes.ts             # value parsing + column type inference
│   │   ├── parseCsv.ts               # PapaParse wrapper -> Dataset
│   │   └── profile.ts                # per-column profiling & stats
│   ├── types/index.ts                # shared TypeScript domain types
│   ├── App.tsx                       # app state machine (idle/parsing/ready/error)
│   └── main.tsx                      # entry point
├── index.html
└── vite.config.ts                    # sets base: '/The-publisher-/'
```

CSV parsing, type inference, and profiling live in `src/lib/` and are kept separate from the React
components, so the logic is easy to test and reuse.

---

## Run it locally

Requires Node.js 18+ (developed on Node 22).

```bash
npm install
npm run dev
```

Then open the URL Vite prints (it includes the base path):

```text
http://localhost:5173/The-publisher-/
```

### Production build

```bash
npm run build     # type-checks with tsc, then builds to dist/
npm run preview   # serves the production build locally to verify it
```

Other scripts:

```bash
npm run typecheck # tsc --noEmit only
```

---

## Test it manually

1. Run `npm run dev` and open the app.
2. Click **“Load a sample dataset”** — the bundled `world-cities.csv` loads and you should see:
   - summary cards (32 rows × 10 columns, data completeness, file size, type breakdown);
   - a **Column overview** tab with a profile card per column, including a histogram for
     `population` / `area_km2` and category bars for `region` / `is_capital`;
   - column types correctly inferred (e.g. `population` → Integer, `area_km2` → Number,
     `last_updated` → Date, `is_capital` → Boolean).
3. Switch to the **Data table** tab and try:
   - **searching** (e.g. type `japan`) — the row count updates;
   - **sorting** by clicking a column header (numeric columns sort numerically, dates
     chronologically, missing values fall to the bottom);
   - **paging** with the rows-per-page selector and pager controls.
4. Click **“New file”** in the header, then drag-and-drop your own `.csv` onto the drop zone.
5. Try an invalid file (e.g. an image or an empty file) to see the friendly error state.

### Make your own sample CSV

Any comma-separated file with a header row works. For example, save this as `demo.csv`:

```csv
name,team,score,joined,active
Ada,Blue,42,2023-01-15,yes
Grace,Red,37,2023-03-02,no
Alan,Blue,,2022-11-30,yes
Edsger,Green,51,2024-02-20,no
```

The Publisher will detect `score` as a number (with a missing value), `joined` as a date,
`active` as a boolean, and `name`/`team` as text.

---

## Deploy to GitHub Pages

The repo includes a workflow at **`.github/workflows/deploy.yml`** that builds the app and
publishes `dist/` to GitHub Pages on every push to `main`.

**One-time setup** in the GitHub repository (`pappa211/The-publisher-`):

1. Push this project to the `main` branch of the public repo.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or re-run the workflow from the **Actions** tab). The workflow will:
   - `npm ci`
   - `npm run build`
   - upload `dist/` and deploy it to Pages.
5. The site goes live at **https://pappa211.github.io/The-publisher-/**.

> **Why the `base` setting?** Project sites are served from a subpath
> (`/The-publisher-/`), so `vite.config.ts` sets `base: '/The-publisher-/'`. All asset URLs and
> the sample-data fetch use this base automatically. If you fork this under a different repo name,
> update `base` to match `/<your-repo-name>/`.

---

## Current limitations / tradeoffs

- **CSV only.** No TSV/Excel/JSON ingestion yet (PapaParse will still auto-detect common
  delimiters, but the UI is framed around CSV).
- **Everything is in memory.** Very large files (hundreds of MB / millions of rows) will be slow
  or may exhaust browser memory. Type inference samples the first 5,000 rows for speed; stats and
  completeness use all rows. The table itself is paginated but not virtualized.
- **Heuristic type inference.** Detection is intentionally conservative and may not match every
  locale (e.g. comma decimal separators, exotic date formats). A column needs ~95% of its values
  to match a type, otherwise it is treated as text.
- **No persistence or sharing.** Reloading the page clears the report; there is no save/export.
- **Single file at a time.** No multi-file or multi-sheet support.
- **Charts are simple by design** (CSS histograms and category bars) to keep the dependency
  footprint tiny.

---

## Suggested next iterations

- **Export the report**: download as a standalone HTML file or PDF; copy a shareable link that
  encodes the view state.
- **Richer charts**: scatter / line / time-series for date columns; correlation heatmap.
- **More inputs**: TSV, JSON, Excel (`.xlsx`), and pasting data directly.
- **Per-column drill-down**: click a column to filter the table; click a histogram bar to filter
  to that range.
- **Performance**: move parsing to a Web Worker and virtualize the table for very large files.
- **Data quality rules**: flag outliers, duplicate rows, and inconsistent formatting.
- **Light/dark theme** toggle and saved user preferences.
- **Editable cells** to nudge toward the true "living document" vision.

---

## Privacy

The Publisher is fully static. Your CSV is parsed in the browser using standard web APIs and is
**never uploaded** to any server. There is no analytics, no tracking, and no third-party data
collection.
