import { useId } from 'react'

export interface Option {
  value: string
  label: string
}

/** A small labelled <select> used for the interactive chart controls. */
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <label className="control" htmlFor={id}>
      <span className="control__label">{label}</span>
      <select className="control__select" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Sentinel select value representing "count of rows" (i.e. no measure). */
export const COUNT_VALUE = '__count__'

/** Build measure options, optionally prefixed with a "Count of rows" choice. */
export function measureOptions(measures: string[], includeCount: boolean): Option[] {
  const opts = measures.map((m) => ({ value: m, label: m }))
  return includeCount ? [{ value: COUNT_VALUE, label: 'Count of rows' }, ...opts] : opts
}

/** Map a measure-select value back to a measure name (or null for count). */
export function valueToMeasure(value: string): string | null {
  return value === COUNT_VALUE ? null : value
}

export const AGGREGATE_OPTIONS: Option[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'mean', label: 'Average' },
]
