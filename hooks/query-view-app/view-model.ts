// Feature #1099: the query card as an MCP App - the Cursor counterpart of
// card-desktop.tsx. Pure: state in, one HTML string out; view.ts owns the App
// connection and the clicks. The card itself is the desktop's frosted SVG
// (renderCardSvg), so both editors draw the same card; the controls the desktop
// lays over it as native Buttons are HTML buttons here, carrying data-act.
// Every value from the query is escaped: by svgcard's xml() inside the SVG, by
// esc() everywhere else.

import { buildModel } from '../query-view/card'
import type { CardActions } from '../query-view/card'
import { OUTCOME_BADGE, REF_KIND, TIER_COLOR, TIER_LABEL, cell, clean, fmtNumber, marksFor, own, parseMetricDef } from '../query-view/result'
import type { QueryResult } from '../query-view/result'
import { formatLines, lineText } from '../query-view/sql'
import type { KbDef, TabId, Upstream } from '../query-view/state'
import { columnWidths, fitColumns, renderCardSvg } from '../query-view/svgcard'
import type { SvgPanel } from '../query-view/svgcard'
import { assembleUpstream } from '../query-view/upstream'
import type { Layers } from '../query-view/upstream'

export const TOOLBAR_PX = 46
export const FOOTER_PX = 56
const CARD_SQL_LINES = 12
const KB_COLORS: Record<string, string> = { Metric: '#2a9d8f', Dimension: '#3b82f6', Measure: '#8b5cf6' }
// The Full results panel draws this many rows at a time.
export const RESULTS_STEP = 200

export type Drawer = { kind: 'results' } | { kind: 'sql'; title: string; sql: string } | { kind: 'explore'; selected?: string } | { kind: 'kb'; name: string }

export type ViewState = {
  tab: TabId
  page: number
  colPage: number
  upstream?: Upstream
  defs: Record<string, KbDef>
  drawer: Drawer | null
  search: string
  sort: string
  desc: boolean
  limit: number
  copied?: boolean
}

export const INITIAL_STATE: ViewState = { tab: 'results', page: 0, colPage: 0, defs: {}, drawer: null, search: '', sort: '', desc: false, limit: RESULTS_STEP }

// The tool result the view draws: show_query_result's structuredContent (the
// local server) or, after Project #302, the remote query tool's envelope.
export type Payload = { command: string; result: QueryResult }

export function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Reads a show_query_result / query tool result into the view's payload. The
// remote envelope may nest the result or return it bare, and may count with
// total_rows instead of row_count.
export function payloadOf(structured: unknown): Payload | null {
  const s = structured as { command?: unknown; result?: unknown } | null
  const raw = (s && typeof s === 'object' && s.result && typeof s.result === 'object' ? s.result : s) as Record<string, unknown> | null
  if (!raw || !Array.isArray(raw.rows)) return null
  const result = { ...raw } as unknown as QueryResult & { total_rows?: number }
  if (result.row_count === undefined && typeof result.total_rows === 'number') result.row_count = result.total_rows
  return { command: typeof s?.command === 'string' ? s.command : '', result }
}

// Upstream from the query_upstream tool's raw CLI answers, as the mod builds it.
export function upstreamOf(
  answer: { dsList?: unknown; history?: unknown; models?: unknown; metrics?: unknown[]; notFound?: string; stderr?: string } | null,
  sourceName: string | undefined,
  refs: Array<{ kind: string; name: string }>,
  loadedAt: string,
): Upstream {
  if (!answer) return { status: 'error', error: 'the graphit-view server did not answer' }
  try {
    const up = assembleUpstream({ sourceName, dsList: answer.dsList, history: answer.history, models: answer.models, metrics: answer.metrics ?? [], refs })
    if (answer.notFound) up.notFound = answer.notFound
    up.loadedAt = loadedAt
    if (!answer.dsList && !answer.models) {
      up.status = 'error'
      up.error = answer.stderr ? `the graphit CLI said: ${clean(answer.stderr).slice(0, 200)}` : 'the graphit CLI did not answer'
    }
    return up
  } catch {
    return { status: 'error', error: 'the graphit CLI answered in an unexpected shape' }
  }
}

export function kbDefOf(stdout: string): KbDef {
  return parseMetricDef(stdout)
}

const noop = async () => undefined
const ACTIONS: CardActions = { setTab: noop, goTo: noop, goCols: noop, openKb: noop, loadUpstream: noop, openExplorer: noop, openSql: noop, openResults: noop, copy: noop }

export function modelOf(payload: Payload, state: ViewState, logoInner: string) {
  return buildModel({
    id: 'card',
    rowKey: 'card',
    command: payload.command,
    result: payload.result,
    header: null,
    nav: null,
    state: { tab: state.tab, page: state.page, colPage: state.colPage, upstream: state.upstream, logoInner },
    act: ACTIONS,
  })
}

function button(act: string, label: string, opts: { on?: boolean; arg?: string; dim?: boolean; title?: string } = {}): string {
  const cls = ['btn', opts.on ? 'on' : '', opts.dim ? 'dim' : ''].filter(Boolean).join(' ')
  const arg = opts.arg !== undefined ? ` data-arg="${esc(opts.arg)}"` : ''
  const title = opts.title ? ` aria-label="${esc(opts.title)}"` : ''
  return `<button type="button" class="${cls}" data-act="${act}"${arg}${title}${opts.dim ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`
}

export function renderCard(payload: Payload, state: ViewState, logoInner: string): string {
  const m = modelOf(payload, state, logoInner)
  const { active, result, injections, kbRefs, kbCount, hidden, cols, shown, upstream, layers } = m

  const numeric = cols.map(c => !hidden.has(c) && shown.some(r => typeof r[c] === 'number') && shown.every(r => typeof r[c] === 'number' || r[c] === null))
  const cellRows = shown.map(r => cols.map(c => (typeof r[c] === 'number' ? fmtNumber(r[c] as number) : cell(r[c]))))
  const widths = columnWidths(cols, cellRows, hidden)
  const colStarts: number[] = []
  for (let at = 0; at < cols.length; at += fitColumns(widths, at)) colStarts.push(at)
  const colPage = Math.min(Math.max(m.colPage, 0), Math.max(colStarts.length - 1, 0))
  const cStart = colStarts[colPage] ?? 0
  const cEnd = cStart + fitColumns(widths, cStart)

  const sqlPanel = (kind: 'base' | 'runtime', text: string | undefined): SvgPanel => ({
    kind: 'code',
    lines: formatLines(clean(text ?? '')).map(line => {
      const marks = marksFor(line, kind, injections, m.expansions)
      const notes = [...new Set(marks.map(mk => mk.note).filter(Boolean))]
      return { tokens: line, mark: marks[0] ? { glyph: marks[0].marker, color: marks[0].color, note: notes.join(', ') } : undefined }
    }),
    maxLines: CARD_SQL_LINES,
  })
  const panels: Record<TabId, () => SvgPanel> = {
    results: () => ({
      kind: 'table',
      columns: cols.slice(cStart, cEnd),
      rows: cellRows.map(r => r.slice(cStart, cEnd)),
      hidden,
      numeric: numeric.slice(cStart, cEnd),
      note: hidden.size > 0 ? `⊘ hidden by policy: ${[...hidden].join(', ')}` : undefined,
    }),
    chart: () => ({ kind: 'chart', spec: m.chart }),
    lineage: () => ({ kind: 'layers', spec: layers }),
    base: () => sqlPanel('base', m.baseSql),
    runtime: () => sqlPanel('runtime', result.governed_sql),
    kb: () => ({
      kind: 'list',
      items: kbRefs.map(ref => {
        const kindName = own(REF_KIND, ref.kind) ?? 'Metric'
        const x = m.expansionFor(kindName, ref.name ?? '')
        return {
          title: cell(ref.name),
          badge: { text: kindName.toUpperCase(), color: own(KB_COLORS, kindName) ?? KB_COLORS.Metric },
          lines: [`{{ ${kindName}('${cell(ref.name)}') }}`, ...(x.expr ? [`${x.expr === x.alias ? 'Column' : 'Compiles to'}  ${x.expr}`] : [])],
        }
      }),
    }),
    governance: () => ({
      kind: 'list',
      items: injections.map(inj => {
        const outcome = own(OUTCOME_BADGE, inj.outcome) ?? { label: clean(inj.outcome ?? 'applied').toUpperCase(), color: '#6b7280' }
        return {
          title: cell(inj.rule_name ?? inj.source_id ?? 'rule'),
          badge: { text: outcome.label, color: outcome.color },
          lines: [
            ...(inj.why ? [clean(inj.why)] : []),
            ...(inj.added_clauses ?? []).map(cl => `+ ${clean(cl)}`),
            ...(inj.transformations ?? []).filter(t => t.column).map(t => `~ ${cell(t.column)} returned as NULL`),
          ],
        }
      }),
    }),
  }

  const isSql = active === 'base' || active === 'runtime'
  const tabs: Array<{ go: TabId; label: string; on: boolean }> = [
    { go: 'results', label: 'Results', on: active === 'results' },
    { go: isSql ? active : 'runtime', label: 'SQL', on: isSql },
    { go: 'chart', label: 'Graph', on: active === 'chart' },
    { go: 'lineage', label: 'Lineage', on: active === 'lineage' },
    { go: 'kb', label: `KB (${kbCount})`, on: active === 'kb' },
    { go: 'governance', label: `Rules (${injections.length})`, on: active === 'governance' },
  ]

  const n = (x: number) => x.toLocaleString('en-US')
  const sqlText = clean((active === 'base' ? m.baseSql : result.governed_sql) ?? '')
  let footer = ''
  if (active === 'results' && shown.length > 0) {
    footer =
      button('open-results', 'Full results ↗') +
      `<span class="group">${m.pageCount > 1 ? button('page', '❮', { arg: String(m.page - 1), dim: m.page === 0, title: 'Previous rows' }) : ''}` +
      `<span class="status">Rows ${n(m.first + 1)}-${n(m.first + shown.length)} of ${n(result.rows.length)}</span>` +
      `${m.pageCount > 1 ? button('page', '❯', { arg: String(m.page + 1), dim: m.page === m.pageCount - 1, title: 'Next rows' }) : ''}</span>` +
      (colStarts.length > 1
        ? `<span class="group">${button('cols', '❮', { arg: String(colPage - 1), dim: colPage === 0, title: 'Previous columns' })}` +
          `<span class="status">Columns ${cStart + 1}-${cEnd} of ${cols.length}</span>` +
          `${button('cols', '❯', { arg: String(colPage + 1), dim: colPage === colStarts.length - 1, title: 'Next columns' })}</span>`
        : '')
  } else if (active === 'lineage') {
    const status =
      upstream?.status === 'ok'
        ? upstream.notFound
          ? `${upstream.notFound} isn't in your Graphit org - showing the query only`
          : `Warehouse to result, read from Graphit at ${upstream.loadedAt ?? ''}`
        : upstream?.status === 'loading'
          ? 'Reading the warehouse, data source and KB definitions…'
          : upstream?.status === 'error'
            ? `Upstream not read: ${upstream.error ?? 'unknown error'}`
            : 'Showing the query only; load the upstream for the full chain'
    footer =
      button('open-explore', 'Explore lineage') +
      button('load-upstream', upstream?.status === 'ok' ? 'Reload' : upstream?.status === 'loading' ? 'Loading…' : 'Load upstream', { dim: upstream?.status === 'loading' }) +
      `<span class="status">${esc(status)}</span>`
  } else if (isSql) {
    footer =
      `<span class="group">${button('tab', 'As written', { arg: 'base', on: active === 'base' })}${button('tab', 'As run', { arg: 'runtime', on: active === 'runtime' })}</span>` +
      (sqlText
        ? `<span class="group">${button('copy-sql', state.copied ? 'Copied' : 'Copy')}${button('open-sql', 'Open full SQL', { arg: active })}</span>`
        : '')
  } else if (active === 'kb') {
    // Only metric definitions can be read (`graphit kb get metric`), as in the mod.
    const metrics = kbRefs.filter(ref => (own(REF_KIND, ref.kind) ?? 'Metric') === 'Metric')
    if (metrics.length > 0) {
      footer =
        '<span class="status">Metric definition:</span>' +
        metrics
          .slice(0, 6)
          .map(ref => button('open-kb', cell(ref.name), { arg: clean(ref.name ?? '') }))
          .join('')
    }
  }

  const card = renderCardSvg({
    logoInner,
    tierLabel: own(TIER_LABEL, m.tier) ?? clean(m.tier),
    tierColor: own(TIER_COLOR, m.tier) ?? TIER_COLOR.ad_hoc,
    meta: m.meta.join(' · '),
    source: m.sourceName ? cell(m.sourceName) : undefined,
    panel: panels[active](),
    toolbar: TOOLBAR_PX,
    footer: FOOTER_PX,
  })
  // The bands renderCardSvg leaves empty, in the card's own pixels.
  const footerTop = card.height - 24 - FOOTER_PX
  return (
    `<div class="card" style="width:${card.width}px;height:${card.height}px">` +
    `<div class="svg" role="img" aria-label="${esc(`Graphit query result: ${m.meta.join(', ')}`)}">${card.svg}</div>` +
    `<nav class="band tabs" style="top:66px;height:${TOOLBAR_PX}px">${tabs.map(t => button('tab', t.label, { arg: t.go, on: t.on })).join('')}</nav>` +
    (footer ? `<div class="band footer" style="top:${footerTop}px;height:${FOOTER_PX}px">${footer}</div>` : '') +
    `</div>` +
    renderDrawer(payload, state, m.sourceName, layers)
  )
}

function kbDefBody(def: KbDef): string {
  const facts = [['Type', def.type], ['Group', def.group], ['Lifecycle', def.lifecycle], ['Domains', def.domains?.join(', ')], ...(def.parts ?? []).map(p => [p.label, p.value])].filter(
    ([, v]) => v,
  )
  if (!def.description && facts.length === 0) return '<p class="muted">The definition has no description or details.</p>'
  return (
    (def.description ? `<p>${esc(def.description)}</p>` : '') +
    (facts.length ? `<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '')
  )
}

// What the mod opens as a sidebar pane draws here as a panel under the card.
function renderDrawer(payload: Payload, state: ViewState, sourceName: string | undefined, layers: Layers): string {
  const d = state.drawer
  if (!d) return ''
  const close = button('close-drawer', 'Close', { title: 'Close panel' })
  if (d.kind === 'sql') {
    const text = formatLines(d.sql).map(lineText).join('\n')
    return `<section class="drawer"><header><h2>${esc(d.title)}</h2>${close}</header><pre class="sql">${esc(text)}</pre></section>`
  }
  if (d.kind === 'kb') {
    const def = state.defs[`Metric:${d.name}`]
    const body =
      !def || def.status === 'loading'
        ? '<p class="muted">Reading the definition…</p>'
        : def.status === 'error'
          ? `<p class="muted">${esc(def.error ?? 'Could not read the definition.')}</p>`
          : def.status === 'unsupported'
            ? '<p class="muted">Only metric definitions can be read here.</p>'
            : kbDefBody(def)
    return `<section class="drawer"><header><h2>${esc(d.name)} <span class="muted">metric</span></h2>${close}</header>${body}</section>`
  }
  if (d.kind === 'explore') {
    const body = layers.layers
      .map(
        layer =>
          `<div class="layer"><h3>${esc(layer.label)}</h3>` +
          layer.nodes
            .map(
              node =>
                `<details${node.id === d.selected ? ' open' : ''}><summary><span class="dot" style="background:${esc(node.color)}"></span>${esc(node.title)}${node.subtitle ? ` <span class="muted">${esc(node.subtitle)}</span>` : ''}</summary>` +
                (node.facts?.length
                  ? `<dl>${node.facts.map(f => `<dt>${esc(f.label)}</dt><dd>${f.code ? `<code>${esc(f.value)}</code>` : esc(f.value)}</dd>`).join('')}</dl>`
                  : '<p class="muted">No details.</p>') +
                '</details>',
            )
            .join('') +
          '</div>',
      )
      .join('')
    return `<section class="drawer"><header><h2>${esc(`${sourceName ?? 'Query'} lineage`)}</h2>${close}</header><div class="explore">${body}</div></section>`
  }
  // Full results: every returned row, searchable and sortable.
  const result = payload.result
  const cols = (result.columns?.length ? result.columns : Object.keys(result.rows[0] ?? {})).map(String)
  const q = state.search.trim().toLowerCase()
  let rows = q ? result.rows.filter(r => cols.some(c => String(r[c] ?? '').toLowerCase().includes(q))) : result.rows
  if (state.sort && cols.includes(state.sort)) {
    const k = state.sort
    const dir = state.desc ? -1 : 1
    rows = [...rows].sort((a, b) => {
      const x = a[k]
      const y = b[k]
      if (x === y) return 0
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
    })
  }
  const shown = rows.slice(0, state.limit)
  const head = cols
    .map(c => `<th>${button('sort', `${c}${state.sort === c ? (state.desc ? ' ▼' : ' ▲') : ''}`, { arg: c, title: `Sort by ${c}` })}</th>`)
    .join('')
  const body = shown
    .map(r => `<tr>${cols.map(c => `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${esc(typeof r[c] === 'number' ? fmtNumber(r[c] as number) : cell(r[c]))}</td>`).join('')}</tr>`)
    .join('')
  const capped = result.truncated ? ' · the result was capped; narrow the query for every row' : ''
  return (
    `<section class="drawer"><header><h2>Full results</h2>` +
    `<input class="search" type="search" placeholder="Search rows" value="${esc(state.search)}" aria-label="Search rows">${close}</header>` +
    `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
    `<footer><span class="muted">${rows.length.toLocaleString('en-US')} of ${result.rows.length.toLocaleString('en-US')} rows${esc(capped)}</span>` +
    (rows.length > shown.length ? button('more-rows', `Show ${Math.min(RESULTS_STEP, rows.length - shown.length)} more`) : '') +
    '</footer></section>'
  )
}
