// One query's card. The model below is what both surfaces draw: the desktop as
// one frosted SVG with native controls laid over it (card-desktop.tsx), the
// terminal as native rows (card-terminal.tsx). Pure: register.tsx reads the
// state and supplies the actions (a mod's `$` never crosses an import).

import { MAX_ROWS, OUTCOME_BADGE, REF_KIND, cell, clean, sqlFromCommand } from './result'
import type { QueryResult } from './result'
import { templateExpansions } from './sql'
import type { Expansion } from './sql'
import type { TabId, Upstream } from './state'
import { lineageLayers, warehouseTables } from './upstream'
import type { Layers } from './upstream'
import { chartSpec } from './viz'
import type { ChartSpec } from './viz'

export type CardModel = {
  // The tab state key (a carousel's group) and the per-query key (pages, upstream).
  id: string
  rowKey: string
  command: string
  header: string | null
  nav: unknown
  result: QueryResult
  baseSql: string | undefined
  active: TabId
  tier: string
  injections: NonNullable<NonNullable<NonNullable<QueryResult['provenance']>['injection_summary']>['injections']>
  denied: NonNullable<NonNullable<NonNullable<QueryResult['provenance']>['injection_summary']>['override_denied']>
  kbRefs: NonNullable<NonNullable<QueryResult['provenance']>['kb_references']>
  kbCount: number
  rowCount: number
  hidden: Set<string>
  meta: string[]
  sourceName: string | undefined
  cols: string[]
  page: number
  pageCount: number
  first: number
  shown: Array<Record<string, unknown>>
  expansions: Expansion[]
  chart: ChartSpec | null
  upstream: Upstream | undefined
  lineageRefs: Array<{ kind: string; name: string }>
  layers: Layers
  // The stored column page (the desktop clamps it to its own column sets) and
  // the chalk G's inner markup ('' when the logo could not be read).
  colPage: number
  logoInner: string
  expansionFor: (kind: string, name: string) => Expansion
  act: CardActions
}

// What a control on the card does; each runs in register.tsx with `$`.
export type CardActions = {
  setTab: (tab: TabId) => Promise<unknown>
  goTo: (page: number) => Promise<unknown>
  goCols: (page: number, count: number) => Promise<unknown>
  openKb: (x: Expansion) => Promise<unknown>
  loadUpstream: () => Promise<unknown>
  openExplorer: (title: string, layers: Layers) => Promise<unknown>
  openSql: (title: string, sql: string) => Promise<unknown>
  openResults: () => Promise<unknown>
  copy: (text: string) => unknown
}

// The state a card reads, by its keys.
export type CardState = { tab?: TabId; page?: number; colPage?: number; upstream?: Upstream; logoInner: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ui = Record<string, any>

// The source the result came from: the response's own name unless it is the
// generic "data_source", else --ds, else the table the SQL as run reads.
function sourceOf(result: QueryResult, command: string, baseSql: string | undefined): string | undefined {
  if (result.source && result.source !== 'data_source') return result.source
  const ds = /--ds(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(command)
  if (ds) return ds[1] ?? ds[2] ?? ds[3]
  return warehouseTables(clean(result.governed_sql ?? baseSql ?? ''))[0]
}

export function buildModel(input: {
  id: string
  rowKey: string
  command: string
  result: QueryResult
  header: string | null
  nav: unknown
  state: CardState
  act: CardActions
}): CardModel {
  const { id, rowKey, command, result, header, nav, state, act } = input
  const baseSql = result.sql ?? sqlFromCommand(command)
  const prov = result.provenance ?? {}
  const injections = prov.injection_summary?.injections ?? []
  const kbRefs = prov.kb_references ?? []
  const rowCount = result.row_count ?? result.rows.length
  const hidden = new Set((result.hidden_columns ?? []).map(String))

  const meta: string[] = [`${rowCount.toLocaleString('en-US')} rows`]
  if (result.truncated) meta.push('truncated by --limit')
  if (typeof result.query_ms === 'number') meta.push(`${result.query_ms.toFixed(0)}ms`)

  const cols = (result.columns?.length ? result.columns : Object.keys(result.rows[0] ?? {})).map(String)
  // Feature #1067: the table pages through every returned row.
  const pageCount = Math.max(1, Math.ceil(result.rows.length / MAX_ROWS))
  const page = Math.min(Math.max(state.page ?? 0, 0), pageCount - 1)
  const first = page * MAX_ROWS

  // What each KB reference compiled to here, paired by select alias against
  // the returned governed_sql - the masked copy, so the view never shows
  // definition text the receipt hides.
  const expansions = baseSql && result.governed_sql ? templateExpansions(clean(baseSql), clean(result.governed_sql)) : []
  const sourceName = sourceOf(result, command, baseSql)
  const upstream = state.upstream
  const lineageRefs = kbRefs.map(ref => ({ kind: REF_KIND[ref.kind ?? ''] ?? 'Metric', name: clean(ref.name ?? '') }))

  return {
    id,
    rowKey,
    command,
    header,
    nav,
    result,
    baseSql,
    active: state.tab ?? 'results',
    tier: clean(prov.tier ?? 'ad_hoc'),
    injections,
    denied: prov.injection_summary?.override_denied ?? [],
    kbRefs,
    kbCount: kbRefs.length || prov.kb_refs || 0,
    rowCount,
    hidden,
    meta,
    sourceName,
    cols,
    page,
    pageCount,
    first,
    shown: result.rows.slice(first, first + MAX_ROWS),
    expansions,
    chart: chartSpec(cols, result.rows, hidden),
    upstream,
    lineageRefs,
    layers: lineageLayers({
      up: upstream,
      sourceName,
      rowCount,
      columns: cols,
      hidden,
      refs: lineageRefs,
      expansions,
      rules: injections.map(inj => ({
        name: cell(inj.rule_name ?? inj.source_id ?? 'rule'),
        clauses: (inj.added_clauses ?? []).map(clean),
        masks: (inj.transformations ?? []).map(t => cell(t.column)).filter(Boolean),
        color: (OUTCOME_BADGE[inj.outcome ?? ''] ?? { color: '#6b7280' }).color,
        why: inj.why ? clean(inj.why) : undefined,
      })),
    }),
    colPage: state.colPage ?? 0,
    logoInner: state.logoInner,
    expansionFor: (kind, name) => expansions.find(x => x.kind === kind && x.name === name) ?? { kind, name, alias: '', expr: '' },
    act,
  }
}

// A result too large for `$.fs.read`: said plainly instead of a vanished card.
export function drawTooLarge(ui: Ui, size: number): unknown {
  const { Box, Text } = ui
  return (
    <Box marginTop={1} borderStyle="round" borderDimColor paddingX={1}>
      <Text dimColor>{`Graphit query result too large to draw${size > 0 ? ` (${(size / 1024 / 1024).toFixed(1)} MB)` : ''} - narrow it with --limit or a WHERE clause.`}</Text>
    </Box>
  )
}
