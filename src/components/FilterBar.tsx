import type { Filter } from '../types'
import { formatInt } from '../lib/format'

/** Sticky bar showing the active filters as removable chips. */
export function FilterBar({
  filters,
  filteredCount,
  totalCount,
  onRemove,
  onClear,
}: {
  filters: Filter[]
  filteredCount: number
  totalCount: number
  onRemove: (filter: Filter) => void
  onClear: () => void
}) {
  if (filters.length === 0) return null

  return (
    <div className="filterbar" role="region" aria-label="Active filters">
      <span className="filterbar__label">Filtered</span>
      <ul className="filterbar__chips">
        {filters.map((f) => (
          <li key={`${f.column}:${f.value}`}>
            <button
              type="button"
              className="chip"
              onClick={() => onRemove(f)}
              title="Remove this filter"
            >
              <span className="chip__col">{f.column}</span>
              <span className="chip__val">{f.value === '' ? '(empty)' : f.value}</span>
              <span className="chip__x" aria-hidden="true">
                ✕
              </span>
            </button>
          </li>
        ))}
      </ul>
      <span className="filterbar__count">
        {formatInt(filteredCount)} of {formatInt(totalCount)} rows
      </span>
      <button type="button" className="btn btn--soft btn--sm" onClick={onClear}>
        Clear all
      </button>
    </div>
  )
}
