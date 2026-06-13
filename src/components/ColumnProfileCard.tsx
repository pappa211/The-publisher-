import type { ColumnProfile } from '../types'
import { formatInt, formatNumber, formatPercent } from '../lib/format'
import { TypeBadge } from './TypeBadge'
import { CategoryBars } from './CategoryBars'
import { Histogram } from './Histogram'

/** A "report card" for a single column: type, completeness and distribution. */
export function ColumnProfileCard({ profile }: { profile: ColumnProfile }) {
  const completeness = 100 - profile.missingPct
  const { numericStats, dateRange, topValues, histogram } = profile

  return (
    <article className="profile-card">
      <header className="profile-card__head">
        <h3 className="profile-card__name" title={profile.name}>
          {profile.name}
        </h3>
        <TypeBadge type={profile.inferredType} />
      </header>

      <div className="profile-card__meter" title={`${formatPercent(completeness)} filled`}>
        <div
          className="profile-card__meter-fill"
          style={{ width: `${completeness}%` }}
          data-low={completeness < 75 ? 'true' : undefined}
        />
      </div>
      <div className="profile-card__meta">
        <span>
          <strong>{formatPercent(completeness)}</strong> filled
        </span>
        <span>
          <strong>{formatInt(profile.uniqueCount)}</strong> unique
        </span>
        {profile.missingCount > 0 && (
          <span className="muted">{formatInt(profile.missingCount)} missing</span>
        )}
      </div>

      {numericStats && (
        <dl className="stat-grid">
          <div>
            <dt>Min</dt>
            <dd>{formatNumber(numericStats.min)}</dd>
          </div>
          <div>
            <dt>Mean</dt>
            <dd>{formatNumber(numericStats.mean)}</dd>
          </div>
          <div>
            <dt>Median</dt>
            <dd>{formatNumber(numericStats.median)}</dd>
          </div>
          <div>
            <dt>Max</dt>
            <dd>{formatNumber(numericStats.max)}</dd>
          </div>
        </dl>
      )}

      {dateRange && (
        <dl className="stat-grid stat-grid--two">
          <div>
            <dt>Earliest</dt>
            <dd>{dateRange.min}</dd>
          </div>
          <div>
            <dt>Latest</dt>
            <dd>{dateRange.max}</dd>
          </div>
        </dl>
      )}

      {histogram && histogram.length > 1 && <Histogram bins={histogram} />}

      {topValues && topValues.length > 0 && (
        <div className="profile-card__viz">
          <span className="profile-card__viz-title">
            {profile.inferredType === 'boolean' ? 'Values' : 'Most frequent'}
          </span>
          <CategoryBars data={topValues} />
        </div>
      )}
    </article>
  )
}
