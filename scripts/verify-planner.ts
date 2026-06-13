/**
 * Dev-only sanity check: runs the real profiling → roles → planner pipeline
 * against every bundled sample CSV and prints what the planner inferred.
 * Not part of the app build; run with `npx tsx scripts/verify-planner.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { profileColumns } from '../src/lib/profile'
import { inferRoles } from '../src/lib/roles'
import { planReport } from '../src/lib/reportPlanner'
import type { CsvRow, Dataset } from '../src/types'

const dir = join(process.cwd(), 'public', 'sample-data')

function buildDataset(file: string): Dataset {
  const text = readFileSync(join(dir, file), 'utf8')
  const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: 'greedy' })
  const columns = parsed.meta.fields ?? []
  const rows = (parsed.data as CsvRow[]).map((r) => {
    const row: CsvRow = {}
    for (const c of columns) row[c] = r[c] == null ? '' : String(r[c])
    return row
  })
  return {
    fileName: file,
    fileSize: text.length,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    profiles: profileColumns(columns, rows),
    issues: [],
    parsedAt: Date.now(),
  }
}

for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv')).sort()) {
  const dataset = buildDataset(file)
  const roles = inferRoles(dataset)
  const plan = planReport(dataset, roles)
  console.log('\n' + '='.repeat(72))
  console.log(`FILE: ${file}  (${dataset.rowCount} rows × ${dataset.columnCount} cols)`)
  console.log('TITLE:', plan.title)
  console.log('KIND GUESS:', plan.datasetKindGuess?.label, `(${plan.datasetKindGuess?.confidence})`)
  console.log('ROLES:')
  for (const r of roles) {
    console.log(`  - ${r.name.padEnd(26)} ${r.role.padEnd(12)} ${r.inferredType.padEnd(8)} card=${r.cardinality}`)
  }
  console.log('PRIMARY TIME:', plan.primaryTimeColumn ?? '(none)')
  console.log('MEASURES   :', plan.measures.join(', ') || '(none)')
  console.log('DIMENSIONS :', plan.dimensions.join(', ') || '(none)')
  console.log('IDENTIFIERS:', plan.identifiers.join(', ') || '(none)')
  console.log('TEXT       :', plan.textFields.join(', ') || '(none)')
  console.log('VIEWS      :', plan.suggestedViews.map((v) => v.kind).join(' → '))
  console.log('SUMMARY:')
  for (const s of plan.summary) console.log('  ·', s)
  if (plan.qualityWarnings.length) {
    console.log('WARNINGS:')
    for (const w of plan.qualityWarnings) console.log('  !', w)
  }
}
