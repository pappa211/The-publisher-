export interface BarItem {
  value: string
  /** The plotted amount (may be negative for signed measures). */
  amount: number
  /** Secondary caption, e.g. a row count alongside a summed measure. */
  sub?: string
}

/**
 * A horizontal bar list used for category breakdowns and rankings. Bars can be
 * clicked to filter the report; negative amounts render in a distinct colour so
 * sign grammar (debits, losses, …) stays visible without any domain knowledge.
 */
export function BarList({
  items,
  format,
  onSelect,
  activeValue,
}: {
  items: BarItem[]
  format: (amount: number) => string
  onSelect?: (value: string) => void
  activeValue?: string | null
}) {
  const peak = Math.max(...items.map((i) => Math.abs(i.amount)), 1)

  return (
    <ul className="bar-list">
      {items.map((item) => {
        const isOverflow = item.value.startsWith('+ ')
        const clickable = Boolean(onSelect) && !isOverflow
        const active = activeValue === item.value
        const width = `${Math.max((Math.abs(item.amount) / peak) * 100, item.amount !== 0 ? 2 : 0)}%`
        const labelText = item.value === '' ? '(empty)' : item.value

        const inner = (
          <>
            <span className="bar-list__label" title={labelText}>
              {labelText}
            </span>
            <span className="bar-list__track">
              <span
                className="bar-list__fill"
                style={{ width }}
                data-negative={item.amount < 0 ? 'true' : undefined}
              />
            </span>
            <span className="bar-list__value">
              {format(item.amount)}
              {item.sub && <span className="bar-list__sub">{item.sub}</span>}
            </span>
          </>
        )

        return (
          <li key={item.value} className={`bar-list__row${active ? ' bar-list__row--active' : ''}`}>
            {clickable ? (
              <button
                type="button"
                className="bar-list__button"
                onClick={() => onSelect?.(item.value)}
                aria-pressed={active}
                title={`Filter to ${labelText}`}
              >
                {inner}
              </button>
            ) : (
              <div className="bar-list__static">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
