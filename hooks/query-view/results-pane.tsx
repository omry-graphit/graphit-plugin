// Feature #1067: Full results - every row and every column of one query in a
// sidebar that opens as wide as the table: search across the columns, sort by
// a column header, totals for the numeric columns, a thousand rows at a time,
// and copy as TSV or CSV. Pure: register.tsx keeps the view state and supplies
// the actions.

import { cell, fmtNumber } from './result'
import type { QueryResult } from './result'
import type { ResultsView } from './state'

export const RESULTS_STEP = 1000
const MAX_COL_CHARS = 28
// The widest sidebar the view asks for; the person can drag it wider.
const MAX_PANE_COLUMNS = 240
const COL_GAP = 3

type Row = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ui = Record<string, any>

export type ResultsActions = {
  search: (query: string) => unknown
  sortBy: (column: string) => unknown
  more: () => unknown
  copy: (text: string) => unknown
}

// The rows the view shows: matching the search (case-insensitive, any column
// the policy did not mask), then sorted - numbers as numbers, empties last.
export function viewRows(rows: Row[], cols: string[], hidden: Set<string>, view: Pick<ResultsView, 'query' | 'sort' | 'desc'>): Row[] {
  const q = view.query.trim().toLowerCase()
  const seen = cols.filter(c => !hidden.has(c))
  const matched = q ? rows.filter(r => seen.some(c => r[c] != null && String(r[c]).toLowerCase().includes(q))) : rows
  if (!view.sort || !cols.includes(view.sort)) return matched
  const dir = view.desc ? -1 : 1
  const key = view.sort
  return [...matched].sort((a, b) => {
    const x = a[key]
    const y = b[key]
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y), 'en', { numeric: true }) * dir
  })
}

// The rows as text a spreadsheet pastes: masked columns stay empty.
export function delimited(cols: string[], rows: Row[], hidden: Set<string>, sep: '\t' | ','): string {
  const field = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    if (sep === '\t') return s.replace(/[\t\n\r]/g, ' ')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map(field).join(sep), ...rows.map(r => cols.map(c => (hidden.has(c) ? '' : field(r[c]))).join(sep))].join('\n')
}

const shownText = (v: unknown): string => (typeof v === 'number' ? fmtNumber(v) : cell(v))

// Sum and average of each numeric column over every matching row.
function totals(cols: string[], rows: Row[], hidden: Set<string>): Map<string, { sum: number; avg: number }> {
  const out = new Map<string, { sum: number; avg: number }>()
  for (const c of cols) {
    if (hidden.has(c)) continue
    let sum = 0
    let n = 0
    for (const r of rows) {
      const v = r[c]
      if (typeof v === 'number') {
        sum += v
        n += 1
      } else if (v != null) {
        n = -1
        break
      }
    }
    if (n > 0) out.set(c, { sum, avg: sum / n })
  }
  return out
}

const columnsOf = (result: QueryResult): string[] => (result.columns?.length ? result.columns : Object.keys(result.rows[0] ?? {})).map(String)

// The sidebar width that shows every column side by side, sized on the first
// rows: the row number, each column at its widest (capped), the gaps, padding.
export function resultsWidth(result: QueryResult): number {
  const sample = result.rows.slice(0, 200)
  const widths = columnsOf(result).map(c => Math.min(MAX_COL_CHARS, Math.max(c.length + 4, ...sample.map(r => shownText(r[c]).length))))
  const total = widths.reduce((sum, w) => sum + w + COL_GAP, String(result.rows.length).length + COL_GAP + 4)
  return Math.min(MAX_PANE_COLUMNS, Math.max(60, total))
}

export function drawResultsPane(ui: Ui, result: QueryResult | undefined, view: ResultsView | null, act: ResultsActions): unknown {
  const { Box, Text, Button, Input } = ui
  if (!result || !view) return <Text dimColor>Open Full results on a query result.</Text>
  const cols = columnsOf(result)
  const hidden = new Set((result.hidden_columns ?? []).map(String))
  const rows = viewRows(result.rows, cols, hidden, view)
  const shown = rows.slice(0, view.limit)
  const sums = totals(cols, rows, hidden)
  const n = (x: number) => x.toLocaleString('en-US')

  const parts = [view.query ? `${n(rows.length)} of ${n(result.rows.length)} rows match` : `${n(result.rows.length)} rows`]
  if (view.sort) parts.push(`sorted by ${view.sort} ${view.desc ? 'high to low' : 'low to high'}`)
  if (rows.length > shown.length) parts.push(`showing the first ${n(shown.length)}`)
  const numWidth = Math.max(3, String(shown.length).length)

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {Input ? (
        <Input key="rs-search" label="Search" placeholder="Filter rows by any value" value={view.query} autoFocus onInput={(v: string) => act.search(v)} onSubmit={(v: string) => act.search(v)} />
      ) : null}
      <Box justifyContent="space-between" alignItems="center">
        <Text key="rs-status" dimColor>{parts.join(' · ')}</Text>
        <Box gap={1}>
          <Button key="rs-copy-tsv" label="Copy for Sheets" variant="secondary" onPress={() => act.copy(delimited(cols, rows, hidden, '\t'))} />
          <Button key="rs-copy-csv" label="Copy CSV" variant="secondary" onPress={() => act.copy(delimited(cols, rows, hidden, ','))} />
        </Box>
      </Box>
      {rows.length === 0 ? (
        <Text dimColor>{view.query ? `No row matches "${view.query}".` : 'Query returned 0 rows.'}</Text>
      ) : (
        <Box gap={COL_GAP}>
          <Box key="rs-col-#" flexDirection="column">
            <Text dimColor>{'#'.padStart(numWidth)}</Text>
            {sums.size > 0 ? <Text dimColor>{'Sum'.padStart(numWidth)}</Text> : null}
            {sums.size > 0 ? <Text dimColor>{'Avg'.padStart(numWidth)}</Text> : null}
            {shown.map((_, i) => (
              <Text key={`rs-n${i}`} dimColor>{String(i + 1).padStart(numWidth)}</Text>
            ))}
          </Box>
          {cols.map(c => {
            const masked = hidden.has(c)
            const total = sums.get(c)
            const arrow = view.sort === c ? (view.desc ? ' ↓' : ' ↑') : ''
            return (
              <Box key={`rs-col-${c}`} flexDirection="column">
                <Button key={`rs-sort-${c}`} label={`${cell(c)}${masked ? ' ⊘' : ''}${arrow}`} plain bold={view.sort === c ? true : undefined} onPress={() => act.sortBy(c)} />
                {sums.size > 0 ? <Text key={`rs-sum-${c}`} bold>{total ? fmtNumber(total.sum) : ' '}</Text> : null}
                {sums.size > 0 ? <Text key={`rs-avg-${c}`} dimColor>{total ? fmtNumber(total.avg) : ' '}</Text> : null}
                {shown.map((r, i) => (
                  <Text key={`rs-${c}-${i}`} dimColor={masked}>{masked ? '•••' : shownText(r[c]) || ' '}</Text>
                ))}
              </Box>
            )
          })}
        </Box>
      )}
      {rows.length > shown.length ? (
        <Button key="rs-more" label={`Show ${n(Math.min(RESULTS_STEP, rows.length - shown.length))} more`} variant="secondary" onPress={() => act.more()} />
      ) : null}
      {hidden.size > 0 ? <Text color="gray">⊘ hidden by policy: {[...hidden].map(cell).join(', ')}</Text> : null}
    </Box>
  )
}
