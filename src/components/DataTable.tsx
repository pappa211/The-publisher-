import { useMemo, useState } from 'react'
import type { ColumnProfile, CsvRow } from '../types'
import { isMissing, isNumericType, parseDate, parseNumber } from '../lib/inferTypes'
import { formatInt, truncate, typeGlyph } from '../lib/format'

interface DataTableProps {
  columns: string[]
  rows: CsvRow[]
  profiles: ColumnProfile[]
}

type SortDir = 'asc' | 'desc'
interface SortState {
  column: string
  dir: SortDir
}

const PAGE_SIZES = [25, 50, 100]

/** Compare two non-missing cell values using the column's inferred type. */
function compareValues(a: string, b: string, numeric: boolean, dateType: boolean): number {
  if (numeric) {
    const na = parseNumber(a)
    const nb = parseNumber(b)
    if (na !== null && nb !== null) return na - nb
  }
  if (dateType) {
    const da = parseDate(a)
    const db = parseDate(b)
    if (da !== null && db !== null) return da - db
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Searchable, sortable, paginated view of the raw rows. */
export function DataTable({ columns, rows, profiles }: DataTableProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [page, setPage] = useState(0)

  const profileByName = useMemo(
    () => new Map(profiles.map((p) => [p.name, p])),
    [profiles],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => columns.some((c) => row[c]?.toLowerCase().includes(q)))
  }, [rows, columns, query])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const profile = profileByName.get(sort.column)
    const numeric = profile ? isNumericType(profile.inferredType) : false
    const dateType = profile?.inferredType === 'date'
    const factor = sort.dir === 'asc' ? 1 : -1
    const col = sort.column

    return [...filtered].sort((a, b) => {
      const av = a[col] ?? ''
      const bv = b[col] ?? ''
      const aM = isMissing(av)
      const bM = isMissing(bv)
      if (aM || bM) {
        if (aM && bM) return 0
        return aM ? 1 : -1 // missing values always sort to the bottom
      }
      return factor * compareValues(av, bv, numeric, dateType)
    })
  }, [filtered, sort, profileByName])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  function handleSort(column: string) {
    setSort((prev) =>
      prev && prev.column === column
        ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { column, dir: 'asc' },
    )
    setPage(0)
  }

  function handleQuery(value: string) {
    setQuery(value)
    setPage(0)
  }

  function handlePageSize(value: number) {
    setPageSize(value)
    setPage(0)
  }

  return (
    <section className="datatable">
      <div className="datatable__toolbar">
        <div className="search">
          <span className="search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="search__input"
            type="search"
            placeholder="Search all columns…"
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            aria-label="Search rows"
          />
        </div>
        <div className="datatable__count">
          {query ? (
            <>
              <strong>{formatInt(sorted.length)}</strong> of {formatInt(rows.length)} rows
            </>
          ) : (
            <>
              <strong>{formatInt(rows.length)}</strong> rows
            </>
          )}
        </div>
      </div>

      <div className="datatable__scroll">
        <table className="datatable__table">
          <thead>
            <tr>
              <th className="datatable__rownum" scope="col">
                #
              </th>
              {columns.map((col) => {
                const profile = profileByName.get(col)
                const active = sort?.column === col
                const numeric = profile ? isNumericType(profile.inferredType) : false
                return (
                  <th
                    key={col}
                    scope="col"
                    className={`datatable__th${numeric ? ' datatable__th--num' : ''}${
                      active ? ' datatable__th--active' : ''
                    }`}
                    onClick={() => handleSort(col)}
                    aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className="datatable__th-inner">
                      {profile && (
                        <span className="datatable__th-glyph" aria-hidden="true">
                          {typeGlyph(profile.inferredType)}
                        </span>
                      )}
                      <span className="datatable__th-name">{col}</span>
                      <span className="datatable__sort" aria-hidden="true">
                        {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={start + i}>
                <td className="datatable__rownum">{start + i + 1}</td>
                {columns.map((col) => {
                  const value = row[col] ?? ''
                  const profile = profileByName.get(col)
                  const numeric = profile ? isNumericType(profile.inferredType) : false
                  if (isMissing(value)) {
                    return (
                      <td key={col} className="datatable__cell datatable__cell--missing">
                        —
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col}
                      className={`datatable__cell${numeric ? ' datatable__cell--num' : ''}`}
                      title={value.length > 80 ? value : undefined}
                    >
                      {truncate(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="datatable__empty">
            No rows match <strong>“{query}”</strong>.
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="datatable__footer">
          <div className="pagesize">
            <label htmlFor="pagesize">Rows per page</label>
            <select
              id="pagesize"
              value={pageSize}
              onChange={(e) => handlePageSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="pager">
            <span className="pager__info">
              {formatInt(start + 1)}–{formatInt(Math.min(start + pageSize, sorted.length))} of{' '}
              {formatInt(sorted.length)}
            </span>
            <div className="pager__buttons">
              <button
                className="btn btn--icon"
                onClick={() => setPage(0)}
                disabled={currentPage === 0}
                aria-label="First page"
              >
                «
              </button>
              <button
                className="btn btn--icon"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="pager__page">
                {currentPage + 1} / {pageCount}
              </span>
              <button
                className="btn btn--icon"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
                aria-label="Next page"
              >
                ›
              </button>
              <button
                className="btn btn--icon"
                onClick={() => setPage(pageCount - 1)}
                disabled={currentPage >= pageCount - 1}
                aria-label="Last page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
