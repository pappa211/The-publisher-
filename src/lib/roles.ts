/**
 * Generic semantic role inference.
 *
 * This is the heart of The Publisher's domain-agnostic design. Given the
 * structural profile of each column (type, cardinality, length, sign) we assign
 * a *generic* role — temporal, measure, categorical, boolean, identifier or
 * text. We deliberately do NOT look up business-specific column names: a column
 * called `pnl`, `balance` or `home_goals` is just "a numeric measure", and a
 * `symbol`, `entity` or `home_team` is just "a categorical dimension".
 *
 * The only place we consult names at all is a small, generic naming-convention
 * test for identifier-like fields (`id`, `code`, `no`, `uuid`, …). That is a
 * cross-domain convention, not a domain definition, and it only ever nudges a
 * column between "identifier" and "dimension" — never into a business meaning.
 */
import type { Cardinality, ColumnProfile, ColumnRole, Dataset, SemanticRole } from '../types'

/**
 * Generic identifier naming conventions shared across every domain. Used only
 * to distinguish keys from measures/dimensions, never to infer business intent.
 */
const ID_NAME_RE = /(^|[_\s-])(id|ids|uuid|guid|key|code|ref|no|num|number|hash|sku|isbn|ean)([_\s-]|$)/i

/** Average character length above which a string column reads as free text. */
const TEXT_LENGTH = 40

function bucketCardinality(uniqueCount: number, uniqueRatio: number): Cardinality {
  if (uniqueCount <= 1) return 'constant'
  if (uniqueRatio >= 0.98) return 'unique'
  if (uniqueCount <= 12) return 'low'
  if (uniqueCount <= 50) return 'medium'
  return 'high'
}

/** Classify a single column into a generic role from its profile alone. */
export function classifyColumn(profile: ColumnProfile): ColumnRole {
  const { name, index, inferredType, filledCount, uniqueCount, avgLength } = profile
  const uniqueRatio = filledCount === 0 ? 0 : uniqueCount / filledCount
  const cardinality = bucketCardinality(uniqueCount, uniqueRatio)
  const idName = ID_NAME_RE.test(name)
  const hasNegatives = profile.numericStats ? profile.numericStats.min < 0 : false
  const reasons: string[] = []

  const base = {
    name,
    index,
    inferredType,
    uniqueRatio,
    cardinality,
    hasNegatives,
  }

  // 1. Temporal — anything we could confidently parse as a date/time.
  if (inferredType === 'date') {
    reasons.push('Parsed as date/time values')
    return {
      ...base,
      role: 'temporal',
      groupable: cardinality === 'low' || cardinality === 'medium',
      measureLike: false,
      temporalLike: true,
      confidence: 0.9,
      reasons,
    }
  }

  // 2. Boolean — a two-state flag, treated as a tiny dimension.
  if (inferredType === 'boolean') {
    reasons.push('Two-state boolean flag')
    return {
      ...base,
      role: 'boolean',
      groupable: true,
      measureLike: false,
      temporalLike: false,
      confidence: 0.95,
      reasons,
    }
  }

  const isInteger = inferredType === 'integer'
  const isNumeric = isInteger || inferredType === 'number'

  // 3. Numeric columns: measure vs identifier vs encoded category.
  if (isNumeric) {
    // An integer field that *names* itself a key is an identifier/dimension,
    // never a quantity to sum. Decimals are virtually never identifiers.
    if (isInteger && idName) {
      if (cardinality === 'unique') {
        reasons.push('Integer key with (near) unique values', 'Name matches an identifier pattern')
        return {
          ...base,
          role: 'identifier',
          groupable: false,
          measureLike: false,
          temporalLike: false,
          confidence: 0.8,
          reasons,
        }
      }
      reasons.push('Integer code that repeats — used as a grouping key', 'Name matches an identifier pattern')
      return {
        ...base,
        role: 'categorical',
        groupable: cardinality !== 'constant',
        measureLike: false,
        temporalLike: false,
        confidence: 0.6,
        reasons,
      }
    }

    reasons.push(hasNegatives ? 'Numeric measure (includes negatives)' : 'Numeric measure')
    return {
      ...base,
      role: 'measure',
      // A measure with only a handful of distinct values (e.g. goals, ratings)
      // also works as a grouping axis.
      groupable: cardinality === 'low',
      measureLike: true,
      temporalLike: false,
      confidence: 0.8,
      reasons,
    }
  }

  // 4. Strings: identifier vs free text vs categorical dimension.
  if (idName && uniqueRatio >= 0.5) {
    reasons.push('High-cardinality field whose name matches an identifier pattern')
    return {
      ...base,
      role: 'identifier',
      groupable: false,
      measureLike: false,
      temporalLike: false,
      confidence: cardinality === 'unique' ? 0.8 : 0.55,
      reasons,
    }
  }

  if (cardinality === 'unique' || cardinality === 'high' || avgLength > TEXT_LENGTH) {
    reasons.push(
      avgLength > TEXT_LENGTH ? 'Long, free-form text values' : 'Very high number of distinct values',
    )
    return {
      ...base,
      role: 'text',
      groupable: false,
      measureLike: false,
      temporalLike: false,
      confidence: 0.6,
      reasons,
    }
  }

  reasons.push(`Low/medium cardinality (${uniqueCount} distinct) — good for grouping`)
  return {
    ...base,
    role: 'categorical',
    groupable: cardinality !== 'constant',
    measureLike: false,
    temporalLike: false,
    confidence: 0.8,
    reasons,
  }
}

/** Infer generic roles for every column of a dataset. */
export function inferRoles(dataset: Dataset): ColumnRole[] {
  return dataset.profiles.map(classifyColumn)
}

/** Pretty, human-readable label for a role (used in diagnostics UI). */
export function roleLabel(role: SemanticRole): string {
  switch (role) {
    case 'temporal':
      return 'Time'
    case 'measure':
      return 'Measure'
    case 'categorical':
      return 'Dimension'
    case 'boolean':
      return 'Flag'
    case 'identifier':
      return 'Identifier'
    case 'text':
      return 'Text'
  }
}
