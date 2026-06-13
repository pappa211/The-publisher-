import type { CsvRow, Dataset, Filter, ReportPlan, SuggestedView } from '../types'
import { FilterBar } from './FilterBar'
import { KeyMeasures } from './views/KeyMeasures'
import { TimeTrend } from './views/TimeTrend'
import { CategoryBreakdown } from './views/CategoryBreakdown'
import { Distribution } from './views/Distribution'
import { CrossTab } from './views/CrossTab'
import { CompletenessMap } from './views/CompletenessMap'
import { ViewCard } from './views/ViewCard'

interface ReportProps {
  dataset: Dataset
  plan: ReportPlan
  rows: CsvRow[]
  filters: Filter[]
  onFilter: (column: string, value: string) => void
  onRemoveFilter: (filter: Filter) => void
  onClearFilters: () => void
  onOpenData: () => void
}

/** The narrative header: title, structural guess, summary and finding chips. */
function ReportIntro({ plan }: { plan: ReportPlan }) {
  return (
    <div className="report-intro">
      <div className="report-intro__top">
        <div>
          <h1 className="report-intro__title">{plan.title}</h1>
          <p className="report-intro__subtitle">{plan.subtitle}</p>
        </div>
        {plan.datasetKindGuess && (
          <div className="kind-guess" title={`Based on ${plan.datasetKindGuess.rationale}. This is a hint, not a classification.`}>
            <span className="kind-guess__label">Looks like</span>
            <span className="kind-guess__value">{plan.datasetKindGuess.label}</span>
            <span className="kind-guess__hint">structural guess</span>
          </div>
        )}
      </div>

      <ul className="findings">
        {plan.findings.map((f) => (
          <li key={`${f.tone}-${f.label}`} className={`finding finding--${f.tone}`}>
            <span className="finding__label">{f.label}</span>
            <span className="finding__detail" title={f.detail}>
              {f.detail}
            </span>
          </li>
        ))}
      </ul>

      <div className="report-intro__summary">
        {plan.summary.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}

/** Render a single suggested view by its kind. */
function renderView(view: SuggestedView, props: ReportProps) {
  const { dataset, plan, rows, filters, onFilter, onOpenData } = props
  switch (view.kind) {
    case 'keyMeasures':
      return <KeyMeasures key={view.id} view={view} rows={rows} />
    case 'timeTrend':
      return <TimeTrend key={view.id} view={view} rows={rows} measures={plan.measures} />
    case 'categoryBreakdown':
      return (
        <CategoryBreakdown
          key={view.id}
          view={view}
          rows={rows}
          dimensions={plan.dimensions}
          measures={plan.measures}
          filters={filters}
          onFilter={onFilter}
        />
      )
    case 'distribution':
      return <Distribution key={view.id} view={view} rows={rows} measures={plan.measures} />
    case 'crossTab':
      return (
        <CrossTab
          key={view.id}
          view={view}
          rows={rows}
          dimensions={plan.dimensions}
          measures={plan.measures}
          onFilter={onFilter}
        />
      )
    case 'completeness':
      return <CompletenessMap key={view.id} view={view} rows={rows} columns={dataset.columns} />
    case 'detailTable':
      return (
        <ViewCard key={view.id} title={view.title} description={view.description}>
          <div className="detail-cta">
            <p>Browse every underlying row — searchable, sortable and paginated.</p>
            <button type="button" className="btn" onClick={onOpenData}>
              Open the data table →
            </button>
          </div>
        </ViewCard>
      )
  }
}

/** The interactive, living report: narrative + filters + suggested views. */
export function Report(props: ReportProps) {
  const { plan, filters, rows, dataset, onRemoveFilter, onClearFilters } = props

  return (
    <div className="report">
      <ReportIntro plan={plan} />

      <FilterBar
        filters={filters}
        filteredCount={rows.length}
        totalCount={dataset.rowCount}
        onRemove={onRemoveFilter}
        onClear={onClearFilters}
      />

      {plan.qualityWarnings.length > 0 && (
        <ViewCard title="Things to watch" description="Generic data-quality notes derived from structure and completeness.">
          <ul className="quality-notes">
            {plan.qualityWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </ViewCard>
      )}

      <div className="report__views">{plan.suggestedViews.map((view) => renderView(view, props))}</div>
    </div>
  )
}
