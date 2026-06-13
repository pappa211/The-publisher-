import type { InferredType } from '../types'
import { typeGlyph, typeLabel } from '../lib/format'

/** A small colored pill showing a column's inferred data type. */
export function TypeBadge({ type, compact = false }: { type: InferredType; compact?: boolean }) {
  return (
    <span className={`type-badge type-badge--${type}`} title={`Inferred type: ${typeLabel(type)}`}>
      <span className="type-badge__glyph" aria-hidden="true">
        {typeGlyph(type)}
      </span>
      {!compact && typeLabel(type)}
    </span>
  )
}
