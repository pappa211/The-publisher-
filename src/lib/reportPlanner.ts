/**
 * The report-planning layer.
 *
 * Flow:  profiled dataset + generic roles  ->  ReportPlan  ->  interactive views
 *
 * The planner reasons purely about generic data grammar: how many time axes,
 * dimensions, measures, identifiers and text fields exist, how complete they
 * are, and how they can be combined. It never branches on a business domain, so
 * a trial balance, a football-results file and a trade ledger each get a
 * sensible — but different — set of suggested views from the same code path.
 */
import type {
  ColumnProfile,
  ColumnRole,
  Dataset,
  DatasetKindGuess,
  Finding,
  ReportPlan,
  SuggestedView,
} from '../types'
import { formatInt, formatPercent } from './format'

/** Pretty a file name into a report title: "trade-ledger.csv" → "Trade Ledger". */
function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  if (!base) return 'Untitled report'
  return base
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toLowerCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

function byName(profiles: ColumnProfile[]): Map<string, ColumnProfile> {
  return new Map(profiles.map((p) => [p.name, p]))
}

/** Span of a date column in days, or -1 if unknown. */
function dateSpanDays(profile: ColumnProfile | undefined): number {
  if (!profile?.dateRange) return -1
  const min = Date.parse(profile.dateRange.min)
  const max = Date.parse(profile.dateRange.max)
  if (Number.isNaN(min) || Number.isNaN(max)) return -1
  return Math.round((max - min) / 86_400_000)
}

function describeSpan(days: number): string {
  if (days < 0) return ''
  if (days === 0) return 'a single point in time'
  if (days < 45) return `about ${days} days`
  if (days < 365 * 2) return `about ${Math.round(days / 30)} months`
  return `about ${(days / 365).toFixed(1)} years`
}

/** Choose the temporal column with the widest, best-populated span. */
function pickPrimaryTime(roles: ColumnRole[], profiles: Map<string, ColumnProfile>): string | undefined {
  const temporal = roles.filter((r) => r.role === 'temporal')
  if (temporal.length === 0) return undefined
  return [...temporal]
    .sort((a, b) => {
      const sa = dateSpanDays(profiles.get(a.name))
      const sb = dateSpanDays(profiles.get(b.name))
      if (sb !== sa) return sb - sa
      return (profiles.get(b.name)?.filledCount ?? 0) - (profiles.get(a.name)?.filledCount ?? 0)
    })[0].name
}

/** Rank measures so the "most interesting" (populated + varied) comes first. */
function rankMeasures(measures: ColumnRole[], profiles: Map<string, ColumnProfile>): string[] {
  return [...measures]
    .sort((a, b) => {
      const pa = profiles.get(a.name)
      const pb = profiles.get(b.name)
      const score = (p?: ColumnProfile) => (p ? p.filledCount * (0.5 + p.uniqueCount / Math.max(1, p.filledCount)) : 0)
      return score(pb) - score(pa)
    })
    .map((r) => r.name)
}

/** Rank dimensions so the most "groupable" (low cardinality, well filled) leads. */
function rankDimensions(dimensions: ColumnRole[], profiles: Map<string, ColumnProfile>): string[] {
  return [...dimensions]
    .sort((a, b) => {
      const rank = (r: ColumnRole) => (r.cardinality === 'low' ? 0 : r.cardinality === 'medium' ? 1 : 2)
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      return (profiles.get(b.name)?.filledCount ?? 0) - (profiles.get(a.name)?.filledCount ?? 0)
    })
    .map((r) => r.name)
}

function buildFindings(
  primaryTime: string | undefined,
  dimensions: string[],
  measures: string[],
  identifiers: string[],
  textFields: string[],
  completeness: number,
): Finding[] {
  const findings: Finding[] = []
  if (primaryTime) {
    findings.push({ tone: 'time', label: 'Time axis', detail: primaryTime })
  }
  if (measures.length) {
    findings.push({
      tone: 'measure',
      label: `${measures.length} measure${measures.length === 1 ? '' : 's'}`,
      detail: measures.slice(0, 4).join(', ') + (measures.length > 4 ? '…' : ''),
    })
  }
  if (dimensions.length) {
    findings.push({
      tone: 'dimension',
      label: `${dimensions.length} dimension${dimensions.length === 1 ? '' : 's'}`,
      detail: dimensions.slice(0, 4).join(', ') + (dimensions.length > 4 ? '…' : ''),
    })
  }
  if (identifiers.length) {
    findings.push({
      tone: 'identifier',
      label: `${identifiers.length} identifier${identifiers.length === 1 ? '' : 's'}`,
      detail: identifiers.slice(0, 3).join(', '),
    })
  }
  if (textFields.length) {
    findings.push({
      tone: 'text',
      label: `${textFields.length} text field${textFields.length === 1 ? '' : 's'}`,
      detail: textFields.slice(0, 3).join(', '),
    })
  }
  findings.push({ tone: 'quality', label: 'Completeness', detail: formatPercent(completeness) })
  return findings
}

function buildSummary(
  dataset: Dataset,
  primaryTime: string | undefined,
  primaryTimeProfile: ColumnProfile | undefined,
  dimensions: string[],
  measures: string[],
  identifiers: string[],
  anyNegative: boolean,
  completeness: number,
): string[] {
  const lines: string[] = []
  lines.push(
    `This report covers ${formatInt(dataset.rowCount)} record${dataset.rowCount === 1 ? '' : 's'} described by ${formatInt(dataset.columnCount)} field${dataset.columnCount === 1 ? '' : 's'}.`,
  )

  if (primaryTime && primaryTimeProfile?.dateRange) {
    const span = describeSpan(dateSpanDays(primaryTimeProfile))
    lines.push(
      `It is time-stamped by “${primaryTime}”, spanning ${primaryTimeProfile.dateRange.min} to ${primaryTimeProfile.dateRange.max}${span ? ` (${span})` : ''}.`,
    )
  }

  if (measures.length) {
    lines.push(
      `Numeric measures you can total or compare: ${measures.slice(0, 5).join(', ')}${measures.length > 5 ? `, +${measures.length - 5} more` : ''}${anyNegative ? ' — some include negative values.' : '.'}`,
    )
  }

  if (dimensions.length) {
    lines.push(
      `You can group and filter by ${dimensions.slice(0, 5).join(', ')}${dimensions.length > 5 ? `, +${dimensions.length - 5} more` : ''}.`,
    )
  }

  if (identifiers.length) {
    lines.push(`“${identifiers[0]}” looks like a per-record identifier.`)
  }

  lines.push(
    `Overall ${formatPercent(completeness)} of cells are populated${completeness < 95 ? ' — see the data-quality notes below.' : '.'}`,
  )
  return lines
}

function buildQualityWarnings(roles: ColumnRole[], profiles: ColumnProfile[]): string[] {
  const warnings: string[] = []
  for (const p of profiles) {
    if (p.missingPct >= 20) {
      warnings.push(`“${p.name}” is ${formatPercent(p.missingPct)} empty (${formatInt(p.missingCount)} of ${formatInt(p.totalCount)} rows).`)
    }
  }
  for (const r of roles) {
    if (r.cardinality === 'constant') {
      warnings.push(`“${r.name}” holds a single value for every row, so it adds little signal.`)
    }
  }
  if (!roles.some((r) => r.role === 'measure')) {
    warnings.push('No numeric measures were detected, so totals and distributions are limited.')
  }
  if (!roles.some((r) => r.role === 'temporal')) {
    warnings.push('No date/time column was detected, so trends over time are unavailable.')
  }
  return warnings
}

/**
 * A deliberately low-authority, purely structural guess at the dataset's
 * shape. It is never used to drive any logic — only shown, clearly hedged.
 */
function guessKind(
  hasTime: boolean,
  measureCount: number,
  dimCount: number,
  idCount: number,
  anyNegative: boolean,
): DatasetKindGuess {
  if (hasTime && idCount > 0 && measureCount > 0) {
    return { label: 'Time-stamped event log', confidence: 0.45, rationale: 'a time axis, per-record identifiers and numeric measures' }
  }
  if (hasTime && measureCount > 0) {
    return { label: 'Time series / periodic measurements', confidence: 0.4, rationale: 'a time axis with numeric measures' }
  }
  if (measureCount >= 2 && dimCount >= 1 && anyNegative) {
    return { label: 'Balance-style financial summary', confidence: 0.35, rationale: 'several signed numeric measures grouped by dimensions' }
  }
  if (dimCount >= 2 && measureCount >= 1) {
    return { label: 'Categorical results / breakdown table', confidence: 0.35, rationale: 'multiple grouping dimensions alongside numeric measures' }
  }
  if (measureCount >= 2) {
    return { label: 'Numeric measurement table', confidence: 0.3, rationale: 'mostly numeric measures with few dimensions' }
  }
  if (idCount > 0) {
    return { label: 'Record register / list', confidence: 0.3, rationale: 'identifier-led rows with little numeric content' }
  }
  return { label: 'General tabular report', confidence: 0.25, rationale: 'a mix of fields with no dominant structure' }
}

function buildViews(
  primaryTime: string | undefined,
  primaryMeasure: string | null,
  dimensions: string[],
  measures: string[],
  hasMissing: boolean,
): SuggestedView[] {
  const views: SuggestedView[] = []
  const primaryDim = dimensions[0]

  if (measures.length) {
    views.push({
      id: 'key-measures',
      kind: 'keyMeasures',
      title: 'Key measures',
      description: 'Totals and averages for every numeric field, recomputed as you filter.',
      measures: measures.slice(0, 6),
    })
  }

  if (primaryTime) {
    views.push({
      id: 'time-trend',
      kind: 'timeTrend',
      title: `Trend over ${primaryTime}`,
      description: primaryMeasure
        ? `How ${primaryMeasure} moves over time. Switch the measure or aggregation to explore.`
        : 'How record volume moves over time.',
      timeColumn: primaryTime,
      measure: primaryMeasure,
      aggregate: primaryMeasure ? 'sum' : 'count',
    })
  }

  if (primaryDim) {
    views.push({
      id: 'category-breakdown',
      kind: 'categoryBreakdown',
      title: `Breakdown by ${primaryDim}`,
      description: 'Compare categories by count or by a measure. Click a bar to filter the whole report.',
      dimension: primaryDim,
      measure: null,
      aggregate: 'count',
    })
  }

  if (primaryMeasure) {
    views.push({
      id: 'distribution',
      kind: 'distribution',
      title: `Distribution of ${primaryMeasure}`,
      description: 'How values of the measure are spread across their range.',
      measure: primaryMeasure,
    })
  }

  if (dimensions.length >= 2) {
    views.push({
      id: 'cross-tab',
      kind: 'crossTab',
      title: `${dimensions[0]} × ${dimensions[1]}`,
      description: 'A pivot of two dimensions. Click a cell to filter by that combination.',
      rowDimension: dimensions[0],
      colDimension: dimensions[1],
      measure: null,
      aggregate: 'count',
    })
  }

  if (hasMissing) {
    views.push({
      id: 'completeness',
      kind: 'completeness',
      title: 'Completeness map',
      description: 'Which fields are well populated and which have gaps, for the current selection.',
    })
  }

  views.push({
    id: 'detail-table',
    kind: 'detailTable',
    title: 'Detail table',
    description: 'Every row, searchable and sortable — the deepest level of detail.',
  })

  return views
}

/** Build a complete, generic report plan from a profiled dataset + roles. */
export function planReport(dataset: Dataset, roles: ColumnRole[]): ReportPlan {
  const profiles = byName(dataset.profiles)

  const measureRoles = roles.filter((r) => r.role === 'measure')
  const dimensionRoles = roles.filter((r) => (r.role === 'categorical' || r.role === 'boolean') && r.groupable)
  const measures = rankMeasures(measureRoles, profiles)
  const dimensions = rankDimensions(dimensionRoles, profiles)
  const identifiers = roles.filter((r) => r.role === 'identifier').map((r) => r.name)
  const textFields = roles.filter((r) => r.role === 'text').map((r) => r.name)
  const temporalColumns = roles.filter((r) => r.role === 'temporal').map((r) => r.name)

  const primaryTime = pickPrimaryTime(roles, profiles)
  const primaryMeasure = measures[0] ?? null
  const anyNegative = measureRoles.some((r) => r.hasNegatives)

  const totalCells = dataset.rowCount * dataset.columnCount
  const missingCells = dataset.profiles.reduce((acc, p) => acc + p.missingCount, 0)
  const completeness = totalCells === 0 ? 100 : ((totalCells - missingCells) / totalCells) * 100

  const findings = buildFindings(primaryTime, dimensions, measures, identifiers, textFields, completeness)
  let summary = buildSummary(
    dataset,
    primaryTime,
    primaryTime ? profiles.get(primaryTime) : undefined,
    dimensions,
    measures,
    identifiers,
    anyNegative,
    completeness,
  )
  const qualityWarnings = buildQualityWarnings(roles, dataset.profiles)
  const suggestedViews = buildViews(primaryTime, primaryMeasure, dimensions, measures, missingCells > 0)
  let datasetKindGuess = guessKind(
    Boolean(primaryTime),
    measures.length,
    dimensions.length,
    identifiers.length,
    anyNegative,
  )

  if (dataset.financialAnalysis) {
    const finance = dataset.financialAnalysis
    findings.unshift({
      tone: 'financial',
      label: 'Financial workbook',
      detail: `${formatPercent(finance.confidence * 100)} confidence`,
    })
    summary = [
      `This looks like a financial-statement workbook: ${formatInt(finance.factCount)} statement facts normalized from ${formatInt(finance.sheetCount)} sheet${finance.sheetCount === 1 ? '' : 's'}.`,
      `Detected periods: ${finance.periods.slice(0, 4).join(', ')}${finance.periods.length > 4 ? `, +${finance.periods.length - 4} more` : ''}.`,
      `Statement coverage includes ${finance.statementTypes.slice(0, 4).join(', ')}${finance.statementTypes.length > 4 ? `, +${finance.statementTypes.length - 4} more` : ''}.`,
      ...summary.slice(1),
    ]
    datasetKindGuess = {
      label: 'Financial statement workbook',
      confidence: finance.confidence,
      rationale: 'financial statement sheets, period columns, line items and numeric amounts',
    }
  }

  return {
    title: titleFromFileName(dataset.fileName),
    subtitle: `${formatInt(dataset.rowCount)} rows × ${formatInt(dataset.columnCount)} columns`,
    summary,
    findings,
    primaryTimeColumn: primaryTime,
    temporalColumns,
    dimensions,
    measures,
    identifiers,
    textFields,
    qualityWarnings,
    suggestedViews,
    roles,
    datasetKindGuess,
  }
}
