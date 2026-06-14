/**
 * Shared domain types for The Publisher.
 *
 * The data flow is: raw CSV text -> parsed string rows -> inferred column
 * types -> per-column profiles -> a single `Dataset` object that the UI reads.
 */

/** The data types we attempt to infer for each column. */
export type InferredType = 'integer' | 'number' | 'boolean' | 'date' | 'string'

/**
 * A single parsed row. Values are kept as raw strings and parsed on demand so
 * that the original file content is never lossily coerced. Missing cells are
 * represented as empty strings.
 */
export type CsvRow = Record<string, string>

/** Summary statistics for a numeric column. */
export interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  /** Population standard deviation. */
  stdDev: number
}

/** A value and how many times it occurs (used for categorical breakdowns). */
export interface CategoryCount {
  value: string
  count: number
}

/** A single bucket in a numeric histogram. */
export interface HistogramBin {
  start: number
  end: number
  count: number
  label: string
}

/** The full profile of one column: type, completeness, and distribution. */
export interface ColumnProfile {
  name: string
  index: number
  inferredType: InferredType
  /** Total number of rows in the dataset. */
  totalCount: number
  /** Cells that are empty / missing. */
  missingCount: number
  /** Cells that have a value. */
  filledCount: number
  /** Missing cells as a percentage (0-100). */
  missingPct: number
  /** Distinct non-missing values. */
  uniqueCount: number
  /** Mean character length of non-missing values (helps separate free text
   * from short categorical labels). */
  avgLength: number

  /** Present for `integer` / `number` columns. */
  numericStats?: NumericStats
  histogram?: HistogramBin[]

  /** Present for `string` / `boolean` / low-cardinality columns. */
  topValues?: CategoryCount[]

  /** Present for `date` columns (ISO-ish strings from the source). */
  dateRange?: { min: string; max: string }
}

/** A non-fatal issue encountered while parsing. */
export interface ParseIssue {
  message: string
  row?: number
}

export type WorkbookSheetKind = 'financial-table' | 'table' | 'empty'

export interface WorkbookSheetMeta {
  name: string
  rowCount: number
  columnCount: number
  importedRows: number
  kind: WorkbookSheetKind
  statementType?: string
  unit?: string
}

export interface WorkbookMeta {
  sheetCount: number
  importedSheetCount: number
  sheets: WorkbookSheetMeta[]
}

export interface FinancialHighlight {
  label: string
  currentPeriod: string
  currentValue: number
  priorPeriod?: string
  priorValue?: number
  change?: number
  changePct?: number
  statement: string
  sheet: string
  unit?: string
}

export interface FinancialCheck {
  label: string
  status: 'ok' | 'warning' | 'missing'
  detail: string
  period?: string
}

export interface FinancialAnalysis {
  confidence: number
  unit?: string
  periods: string[]
  sheetCount: number
  factCount: number
  statementTypes: string[]
  highlights: FinancialHighlight[]
  checks: FinancialCheck[]
  notes: string[]
}

/** The fully parsed + profiled dataset that drives the workspace UI. */
export interface Dataset {
  fileName: string
  fileSize: number
  rowCount: number
  columnCount: number
  columns: string[]
  rows: CsvRow[]
  profiles: ColumnProfile[]
  issues: ParseIssue[]
  parsedAt: number
  workbook?: WorkbookMeta
  financialAnalysis?: FinancialAnalysis
  /** Present when the source was a PDF processed by the v0.3 document pipeline. */
  financialDocument?: FinancialDocument
}

/* ===========================================================================
   v0.3 — Financial document mode (experimental PDF / OCR extraction)
   ---------------------------------------------------------------------------
   A PDF is turned into a `FinancialDocument`: a transparent record of what was
   pulled from each page (embedded text or experimental OCR), which financial
   statements were detected, the structured line items extracted, and every
   uncertainty encountered along the way. The pipeline never claims perfect
   extraction — warnings and per-item confidence are first-class.
   =========================================================================== */

/** Where a `FinancialDocument` came from. */
export type FinancialSourceType = 'pdf' | 'csv' | 'xlsx' | 'xml' | 'unknown'

/** How the text behind a document (or a single page) was obtained. */
export type ExtractionMode = 'embedded_text' | 'ocr' | 'mixed' | 'none'

/** The kinds of financial statement the detector tries to recognise. */
export type StatementKind =
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'equity'
  | 'notes'
  | 'unknown'

/** The raw extraction result for a single PDF page. */
export interface PdfPageExtraction {
  pageNumber: number
  /** Layout-aware text pulled from the PDF's embedded text layer, if any. */
  embeddedText?: string
  /** Text produced by experimental browser OCR, if it was run for this page. */
  ocrText?: string
  /** Which source the detector should trust for this page. */
  extractionMode: 'embedded_text' | 'ocr' | 'none'
  /** Character count of the text actually used (embedded or OCR). */
  textLength: number
  /** OCR confidence (0–1) when this page was OCR'd. */
  confidence?: number
  warnings: string[]
}

/** One normalized financial row: a label plus its value in each period/column. */
export interface FinancialLineItem {
  label: string
  /** Keyed by detected period/column label (e.g. "FY 2023") → numeric or raw. */
  values: Record<string, number | string | null>
  unit?: string
  currency?: string
  sourcePage?: number
  /** The original line of text the item was parsed from (for inspection). */
  rawText?: string
  /** Low-authority confidence in this row (0–1). */
  confidence: number
}

/** A detected financial statement and the line items assigned to it. */
export interface FinancialStatement {
  kind: StatementKind
  title: string
  sourcePage?: number
  /** Period/column headers detected for this statement, in column order. */
  periods: string[]
  rows: FinancialLineItem[]
  /** Low-authority confidence the section is the statement it claims to be. */
  confidence: number
}

/**
 * The structured, transparent result of running a PDF through the v0.3
 * pipeline. Keeps the raw page extraction, the OCR text, the detected
 * statements, the flat line items and every warning clearly separated.
 */
export interface FinancialDocument {
  sourceFile: string
  sourceType: FinancialSourceType
  extractionMode: ExtractionMode
  pageCount: number
  pages: PdfPageExtraction[]
  statements: FinancialStatement[]
  /** Every extracted line item, flattened across statements. */
  extractedRows: FinancialLineItem[]
  /** All period/column labels detected across the document, in display order. */
  periods: string[]
  currency?: string
  unit?: string
  warnings: string[]
  /** Pages whose embedded text cleared the quality bar. */
  pagesWithText: number
  /** Pages that look scanned / image-based and would need OCR. */
  pagesNeedingOcr: number
  /** True when embedded text is too thin and OCR is worth offering. */
  ocrRecommended: boolean
  /** True when an OCR fallback can be run for this document in the browser. */
  ocrAvailable: boolean
}

/** Top-level application state machine. */
export type AppStatus = 'idle' | 'parsing' | 'ready' | 'error'

/* ===========================================================================
   v0.2 — Generic semantic roles + report planning
   ---------------------------------------------------------------------------
   These describe the *structure* of a dataset (its data grammar), never a
   business domain. A trial balance, a football-results file and a trade ledger
   are all just combinations of the roles below.
   =========================================================================== */

/**
 * A generic, domain-agnostic role for a column, inferred from its structure
 * (type, cardinality, length, sign) — not from its name or business meaning.
 */
export type SemanticRole =
  | 'temporal' // date/time axis
  | 'measure' // numeric quantity worth aggregating
  | 'categorical' // low/medium-cardinality grouping dimension
  | 'boolean' // two-state flag (a special dimension)
  | 'identifier' // (near) unique key
  | 'text' // high-cardinality / free-form text

/** How many distinct values a column holds, relative to its row count. */
export type Cardinality = 'constant' | 'low' | 'medium' | 'high' | 'unique'

/** The inferred generic role of a single column. */
export interface ColumnRole {
  name: string
  index: number
  inferredType: InferredType
  role: SemanticRole
  /** Distinct non-missing values / filled values (0–1). */
  uniqueRatio: number
  cardinality: Cardinality
  /** Suitable as a grouping axis (category breakdown, pivot rows/cols). */
  groupable: boolean
  /** Numeric and meaningful to sum / average. */
  measureLike: boolean
  /** Date/time-like. */
  temporalLike: boolean
  /** For measures: whether any value is negative (sign grammar). */
  hasNegatives: boolean
  /** Low-authority confidence in this role assignment (0–1). */
  confidence: number
  /** Short, human-readable justifications (shown in diagnostics). */
  reasons: string[]
}

/** How a measure is aggregated within a group / time bucket. */
export type Aggregate = 'count' | 'sum' | 'mean'

/** A simple equality filter applied to the working dataset. */
export interface Filter {
  column: string
  /** Raw (trimmed) value to match; the literal `(empty)` matches missing. */
  value: string
}

/** A compact "key finding" surfaced as a chip near the report title. */
export interface Finding {
  tone: 'time' | 'dimension' | 'measure' | 'identifier' | 'text' | 'quality' | 'financial'
  label: string
  detail: string
}

/** A low-authority, purely structural guess at what kind of dataset this is. */
export interface DatasetKindGuess {
  label: string
  confidence: number
  rationale: string
}

/** The kinds of generic views the planner can suggest. */
export type ViewKind =
  | 'keyMeasures'
  | 'timeTrend'
  | 'categoryBreakdown'
  | 'distribution'
  | 'crossTab'
  | 'completeness'
  | 'detailTable'

interface ViewBase {
  id: string
  kind: ViewKind
  title: string
  description: string
}

export interface KeyMeasuresView extends ViewBase {
  kind: 'keyMeasures'
  measures: string[]
}
export interface TimeTrendView extends ViewBase {
  kind: 'timeTrend'
  timeColumn: string
  /** null → count of rows per bucket. */
  measure: string | null
  aggregate: Aggregate
}
export interface CategoryBreakdownView extends ViewBase {
  kind: 'categoryBreakdown'
  dimension: string
  /** null → count of rows per category. */
  measure: string | null
  aggregate: Aggregate
}
export interface DistributionView extends ViewBase {
  kind: 'distribution'
  measure: string
}
export interface CrossTabView extends ViewBase {
  kind: 'crossTab'
  rowDimension: string
  colDimension: string
  measure: string | null
  aggregate: Aggregate
}
export interface CompletenessView extends ViewBase {
  kind: 'completeness'
}
export interface DetailTableView extends ViewBase {
  kind: 'detailTable'
}

/** A view the planner thinks is worth rendering for this dataset. */
export type SuggestedView =
  | KeyMeasuresView
  | TimeTrendView
  | CategoryBreakdownView
  | DistributionView
  | CrossTabView
  | CompletenessView
  | DetailTableView

/**
 * The structured, generic plan that turns a profiled dataset into an
 * interactive report. Everything here is derived from structure, so the app
 * never depends on a correct domain classification to be useful.
 */
export interface ReportPlan {
  title: string
  subtitle: string
  /** Narrative, plain-language sentences describing the dataset. */
  summary: string[]
  /** Compact structural findings rendered as chips. */
  findings: Finding[]
  primaryTimeColumn?: string
  temporalColumns: string[]
  dimensions: string[]
  measures: string[]
  identifiers: string[]
  textFields: string[]
  qualityWarnings: string[]
  suggestedViews: SuggestedView[]
  /** Per-column role assignments (for diagnostics / transparency). */
  roles: ColumnRole[]
  /** Optional, explicitly low-authority structural guess. */
  datasetKindGuess?: DatasetKindGuess
}
