import type { ColumnProfile, Dataset, InferredType } from '../types'
import { formatBytes, formatInt, formatPercent, typeLabel } from '../lib/format'

const TYPE_ORDER: InferredType[] = ['integer', 'number', 'date', 'boolean', 'string']

function countTypes(profiles: ColumnProfile[]): { type: InferredType; count: number }[] {
  const counts = new Map<InferredType, number>()
  for (const p of profiles) {
    counts.set(p.inferredType, (counts.get(p.inferredType) ?? 0) + 1)
  }
  return TYPE_ORDER.filter((t) => counts.has(t)).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }))
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      {sub && (
        <span className="stat-card__sub" title={sub}>
          {sub}
        </span>
      )}
    </div>
  )
}

/** The headline metrics shown at the top of the report. */
export function SummaryCards({ dataset }: { dataset: Dataset }) {
  const totalCells = dataset.rowCount * dataset.columnCount
  const missingCells = dataset.profiles.reduce((acc, p) => acc + p.missingCount, 0)
  const completeness = totalCells === 0 ? 100 : ((totalCells - missingCells) / totalCells) * 100
  const types = countTypes(dataset.profiles)

  return (
    <section className="summary" aria-label="Dataset summary">
      <StatCard label="Rows" value={formatInt(dataset.rowCount)} />
      <StatCard label="Columns" value={formatInt(dataset.columnCount)} />
      <StatCard
        label="Data complete"
        value={formatPercent(completeness)}
        sub={`${formatInt(missingCells)} of ${formatInt(totalCells)} cells missing`}
      />
      <StatCard label="File size" value={formatBytes(dataset.fileSize)} sub={dataset.fileName} />
      <div className="stat-card stat-card--types">
        <span className="stat-card__label">Column types</span>
        <ul className="type-legend">
          {types.map(({ type, count }) => (
            <li key={type} className={`type-legend__item type-badge--${type}`}>
              <span className="type-legend__dot" />
              {count} {typeLabel(type)}
              {count === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
