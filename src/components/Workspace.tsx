import { useState } from 'react'
import type { Dataset, ParseIssue } from '../types'
import { formatInt } from '../lib/format'
import { SummaryCards } from './SummaryCards'
import { DataTable } from './DataTable'
import { ColumnProfileCard } from './ColumnProfileCard'

type Tab = 'overview' | 'data'

function ReportHeader({ dataset }: { dataset: Dataset }) {
  const generated = new Date(dataset.parsedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <div className="report-head">
      <div>
        <h1 className="report-head__title" title={dataset.fileName}>
          {dataset.fileName}
        </h1>
        <p className="report-head__sub">
          {formatInt(dataset.rowCount)} rows × {formatInt(dataset.columnCount)} columns ·
          generated {generated}
        </p>
      </div>
      <span className="report-head__badge">Live report</span>
    </div>
  )
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

/** The post-upload report: summary, column overview and the data table. */
export function Workspace({ dataset }: { dataset: Dataset }) {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="workspace">
      <ReportHeader dataset={dataset} />
      <SummaryCards dataset={dataset} />
      {dataset.issues.length > 0 && <IssuesNote issues={dataset.issues} />}

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'overview'}
          className={`tab${tab === 'overview' ? ' tab--active' : ''}`}
          onClick={() => setTab('overview')}
        >
          Column overview
        </button>
        <button
          role="tab"
          aria-selected={tab === 'data'}
          className={`tab${tab === 'data' ? ' tab--active' : ''}`}
          onClick={() => setTab('data')}
        >
          Data table
        </button>
      </div>

      {tab === 'overview' ? (
        <section className="profiles-grid">
          {dataset.profiles.map((profile) => (
            <ColumnProfileCard key={profile.name} profile={profile} />
          ))}
        </section>
      ) : (
        <DataTable columns={dataset.columns} rows={dataset.rows} profiles={dataset.profiles} />
      )}
    </div>
  )
}
