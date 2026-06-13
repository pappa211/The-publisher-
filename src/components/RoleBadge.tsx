import type { SemanticRole } from '../types'
import { roleLabel } from '../lib/roles'

/** A small pill describing a column's generic semantic role. */
export function RoleBadge({ role }: { role: SemanticRole }) {
  return (
    <span className={`role-badge role-badge--${role}`} title={`Semantic role: ${roleLabel(role)}`}>
      {roleLabel(role)}
    </span>
  )
}
