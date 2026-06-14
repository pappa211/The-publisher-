import { useCallback, useMemo, useState } from 'react'
import type { Dataset, Filter, ParseIssue, PdfOcrProgress } from '../types'
import { inferRoles } from '../lib/roles'
import { planReport } from '../lib/reportPlanner'
import { applyFilters } from '../lib/aggregate'
import { formatInt } from '../lib/format'
import { SummaryCards } from './SummaryCards'
import { DataTable } from './DataTable'
import { ColumnProfileCard } from './ColumnProfileCard'
import { Report } from './Report'
import { FilterBar } from './FilterBar'
import { FinancialWorkspace } from './FinancialWorkspace'

type Tab = 'financial' | 'report' | 'columns' | 'data'

function tabsFor(dataset: Dataset): { id: Tab; label: string }[] {
  return dataset.financialDocument
    ? [
      { id: 'financial', label: 'Financial statements' },
      { id: 'report', label: 'Generic report' },
      { id: 'columns', label: 'Diagnostics' },
      { id: 'data', label: 'Raw data' },
    ]
    : [
      { id: 'report', label: 'Report' },
      { id: 'columns', label: 'Column diagnostics' },
      { id: 'data', label: 'Data table' },
    ]
}

function IssuesNote({ issues }: { issues: ParseIssue[] }) {
  return (
    <details className="issues">
      <summary>
        <span aria-hidden="true">⚠</span> {issues.length} parsing{' '}
        {issues.length === 1 ? 'note' : 'notes'}
      </summary>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            {issue.row != null && <span className="issues__row">Row {issue.row + 1}:</span>}{' '}
            {issue.message}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * The post-upload workspace. Financial documents open first in the
 * reconstruction view; generic data still gets the original report planner.
 */
export function Workspace({
  dataset,
  onRunOcr,
  ocrBusy = false,
  ocrProgress = null,
}: {
  dataset: Dataset
  onRunOcr?: () => void
  ocrBusy?: boolean
  ocrProgress?: PdfOcrProgress | null
}) {
  const [tab, setTab] = useState<Tab>(dataset.financialDocument ? 'financial' : 'report')
  const [filters, setFilters] = useState<Filter[]>([])

  const tabs = useMemo(() => tabsFor(dataset), [dataset])
  const roles = useMemo(() => inferRoles(dataset), [dataset])
  const plan = useMemo(() => planReport(dataset, roles), [dataset, roles])
  const roleByName = useMemo(() => new Map(roles.map((r) => [r.name, r])), [roles])
  const filteredRows = useMemo(() => applyFilters(dataset.rows, filters), [dataset.rows, filters])

  const handleFilter = useCallback((column: string, value: string) => {
    setFilters((prev) => [...prev.filter((f) => f.column !== column), { column, value }])
  }, [])

  const handleRemoveFilter = useCallback((filter: Filter) => {
    setFilters((prev) => prev.filter((f) => !(f.column === filter.column && f.value === filter.value)))
  }, [])

  const handleClearFilters = useCallback(() => setFilters([]), [])
  const openData = useCallback(() => setTab('data'), [])

  return (
    <div className="workspace">
      {dataset.issues.length > 0 && <IssuesNote issues={dataset.issues} />}

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'financial' && dataset.financialDocument && (
        <FinancialWorkspace
          document={dataset.financialDocument}
          onRunOcr={onRunOcr}
          ocrBusy={ocrBusy}
          ocrProgress={ocrProgress}
        />
      )}

      {tab === 'report' && (
        <Report
          dataset={dataset}
          plan={plan}
          rows={filteredRows}
          filters={filters}
          onFilter={handleFilter}
          onRemoveFilter={handleRemoveFilter}
          onClearFilters={handleClearFilters}
          onOpenData={openData}
        />
      )}

      {tab === 'columns' && (
        <section className="columns-tab">
          <SummaryCards dataset={dataset} />
          <p className="columns-tab__note muted">
            Column diagnostics describe the full file ({formatInt(dataset.rowCount)} rows). Filters apply to the
            Report and Data tabs.
          </p>
          <div className="profiles-grid">
            {dataset.profiles.map((profile) => (
              <ColumnProfileCard key={profile.name} profile={profile} role={roleByName.get(profile.name)} />
            ))}
          </div>
        </section>
      )}

      {tab === 'data' && (
        <section className="data-tab">
          <FilterBar
            filters={filters}
            filteredCount={filteredRows.length}
            totalCount={dataset.rowCount}
            onRemove={handleRemoveFilter}
            onClear={handleClearFilters}
          />
          <DataTable columns={dataset.columns} rows={filteredRows} profiles={dataset.profiles} />
        </section>
      )}
    </div>
  )
}
