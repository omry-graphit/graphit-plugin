import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { KB_PANE, LINEAGE_PANE, RESULTS_PANE, SQL_PANE, capped } from './atoms'
import { buildModel, drawTooLarge } from './card'
import type { CardActions } from './card'
import { drawDesktopCard } from './card-desktop'
import { drawTerminalCard } from './card-terminal'
import { READ_LIMIT, openedFor, parsedFor, rememberOpened, rememberParsed, rememberSaved, savedFor, withReadSlot } from './loaders'
import type { Loaded } from './loaders'
import { drawExplorer, drawKbPane, drawSqlPane } from './panes'
import { RESULTS_STEP, drawResultsPane, resultsWidth } from './results-pane'
import { clean, isGraphitQuery, parseMetricDef, parseQueryResult, queryReachesStdout } from './result'
import type { QueryResult } from './result'
import type { Expansion } from './sql'
import type { CommandByCall, Explore, KbDef, KbSelection, ResultsView, SqlPane, TabByCall, Upstream } from './state'
import { assembleUpstream, errorOf, jsonOf } from './upstream'

// Feature #1062: the selected tab of each result, keyed by tool_use_id (by the
// group's requestId in a carousel); the KB reference the sidebar shows; the
// definitions it fetched; each Bash call's command.
const tabs = atom({ plugin: 'graphit', key: 'queryViewTab' } as const, {} as TabByCall)
const selected = atom({ plugin: 'graphit', key: 'queryViewSelected' } as const, null as KbSelection | null)
const defs = atom({ plugin: 'graphit', key: 'queryViewDefs' } as const, {} as Record<string, KbDef>)
const commands = atom({ plugin: 'graphit', key: 'queryViewCommands' } as const, {} as CommandByCall)
// Feature #1067: the query a folded group's carousel shows (by requestId); the
// row and column page of each result; the upstream read for each query; the
// lineage explorer's and full-SQL pane's content.
const slides = atom({ plugin: 'graphit', key: 'queryViewSlide' } as const, {} as Record<string, number>)
const pages = atom({ plugin: 'graphit', key: 'queryViewPage' } as const, {} as Record<string, number>)
const upstreams = atom({ plugin: 'graphit', key: 'queryViewUpstream' } as const, {} as Record<string, Upstream>)
const explore = atom({ plugin: 'graphit', key: 'queryViewExplore' } as const, null as Explore | null)
const sqlPane = atom({ plugin: 'graphit', key: 'queryViewSqlPane' } as const, null as SqlPane | null)
const resultsView = atom({ plugin: 'graphit', key: 'queryViewResults' } as const, null as ResultsView | null)

// Feature #1077: tell scripts/show-query-result.mjs that this view draws the
// session's query results, so it says "already displayed" instead of asking the
// agent to repeat the table (plugin-status/query-view-marker.mjs reads it). The
// hook's context cannot be rewritten from here: in the desktop app the classic
// chain carried none of it (Feature #1067). Stamped before every query, keyed by
// the current id - `/clear` and a resume continue under a new id without a
// reload, and SessionStart prunes markers older than 48h. A failed stamp only
// costs the old directive, so it never blocks the query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stampDrawsMarker($: any): Promise<void> {
  try {
    const id = String(await $.session.id())
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) return
    // An empty variable counts as unset, as in plugin-status/query-view-marker.mjs.
    const home = await $.env.get('HOME')
    const data = (await $.env.get('GRAPHIT_PLUGIN_DATA')) || (home ? `${home}/.graphit` : null)
    if (data) await $.fs.write(`${data}/sessions/${id}.query-view`, '{}')
  } catch {
    // An engine without these calls, or an unwritable directory.
  }
}

// The command as shown on a card: from the graphit invocation on, so a long
// path or a `cd ... &&` prefix does not hide the SQL.
function commandLine(command: string): string {
  const at = command.search(/(?:graphit|index\.js)\s+query\b/)
  const shown = at > 0 ? command.slice(at) : command
  return clean(shown).replace(/\s+/g, ' ').slice(0, 160)
}

// The chalk G's inner markup, read once per load from the plugin bundle.
let logoInner: string | null = null

// Feature #1067: the call's result - its output when that parses, else the
// file Claude Code saved it to (read once, at draw time, never on tool.call).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadResult($: any, id: string | undefined, output: unknown): Promise<Loaded> {
  const direct = parseQueryResult(output)
  if (direct) return { result: direct }
  const file = savedFor(id)
  if (!file) return null
  if (file.size > READ_LIMIT) return { tooLarge: file.size }
  if (parsedFor(file.path) === undefined) {
    // A read that fails (past `$.fs.read`'s limit when the engine gave no size)
    // is reported as too large rather than leaving the plain row.
    let text: string
    try {
      text = await $.fs.read(file.path)
    } catch {
      return { tooLarge: file.size }
    }
    rememberParsed(file.path, parseQueryResult(text))
  }
  const result = parsedFor(file.path)
  return result ? { result } : null
}

// Feature #1067: `$.process.run` resolves argv[0] on the app's own PATH, and
// Claude Code puts the plugin's bin/ on the PATH of Bash calls only - so a bare
// `graphit` never starts for a plugin-only install. Run the plugin's own
// wrapper; a global install on PATH is the fallback (and covers Windows, where
// the bash wrapper cannot start without a shell).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runGraphit($: any, args: string[], timeoutMs: number): Promise<{ exitCode?: number; stdout?: string; stderr?: string }> {
  try {
    return await $.process.run([`${$.plugin.root}/bin/graphit`, ...args], { timeoutMs })
  } catch {
    return await $.process.run(['graphit', ...args], { timeoutMs })
  }
}

// Feature #1067: one query's upstream lineage, read through plain `graphit`
// with the caller's own permissions - the source (its warehouse SQL and last
// refresh), the semantic models, each referenced metric - at most
// a shared cap of reads at a time (withReadSlot), cached per query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadUpstream($: any, key: string, sourceName: string | undefined, refs: Array<{ kind: string; name: string }>): Promise<void> {
  if ((await read($, upstreams))[key]?.status === 'loading') return
  await update($, upstreams, m => capped(m, key, { status: 'loading' } as Upstream))
  let reason = ''
  const run = async (args: string[]): Promise<unknown> => {
    try {
      const ran = await withReadSlot(() => runGraphit($, args, 30000))
      const answer = jsonOf(String(ran.stdout ?? ''))
      // The CLI prints its failure as `{"error": ...}` on stderr, after any warning.
      if (!answer && !reason) reason = errorOf(String(ran.stderr ?? ''))
      return answer
    } catch {
      return null
    }
  }
  let up: Upstream
  try {
    const metricRefs = refs.filter(r => r.kind === 'Metric')
    const [dsList, models, ...metrics] = await Promise.all([
      run(['ds', 'list', '--limit', '200']),
      run(['kb', 'list', 'semantic-model']),
      ...metricRefs.map(r => run(['kb', 'get', 'metric', '--', r.name])),
    ])
    const ds = ((dsList as { data_sources?: Array<{ id?: string; name?: string }> } | null)?.data_sources ?? []).find(
      d => !!sourceName && (d.name ?? '').toLowerCase() === sourceName.toLowerCase(),
    )
    const history = ds?.id ? await run(['ds', 'refresh-history', '--', ds.id]) : null
    up = assembleUpstream({ sourceName, dsList, history, models, metrics, refs })
    // Feature #1067: a source the signed-in org does not have is said plainly,
    // never reported as a warehouse-to-result read.
    if (dsList && sourceName && !ds) up.notFound = sourceName
    up.loadedAt = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
    if (!dsList && !models) {
      up.status = 'error'
      up.error = reason ? `the graphit CLI said: ${reason}` : 'the graphit CLI did not answer'
    }
  } catch {
    // A malformed answer must never leave the lineage stuck on loading.
    up = { status: 'error', error: 'the graphit CLI answered in an unexpected shape' }
  }
  await update($, upstreams, m => capped(m, key, up))
}

// Feature #1062: open the KB sidebar on a reference and read its definition.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openKb($: any, x: Expansion): Promise<void> {
  const k = `${x.kind}:${x.name}`
  await update($, selected, () => ({ kind: x.kind, name: x.name, alias: x.alias, expansion: x.expr }))
  await $.ui.open({ id: KB_PANE, title: 'Knowledge Base', closeOnEscape: true, focus: true })
  if (x.kind !== 'Metric') {
    await update($, defs, d => capped(d, k, { status: 'unsupported' }))
    return
  }
  if ((await read($, defs))[k]?.status === 'ok') return
  await update($, defs, d => capped(d, k, { status: 'loading' }))
  try {
    const ran = await withReadSlot(() => runGraphit($, ['kb', 'get', 'metric', '--', x.name], 20000))
    const def = parseMetricDef(ran.stdout || ran.stderr)
    await update($, defs, d => capped(d, k, def))
  } catch {
    await update($, defs, d => capped(d, k, { status: 'error', error: 'Could not run graphit kb get.' }))
  }
}

// One query's card: its state read here, drawn by the surface's renderer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drawLoaded($: any, e: any, loaded: Loaded, id: string, command: string, header: string | null, nav: unknown = null, rowKey: string = id): Promise<unknown> {
  const ui = $.ui.resolve(e)
  if (loaded && 'tooLarge' in loaded) return drawTooLarge(ui, loaded.tooLarge)
  const result = (loaded as { result: QueryResult }).result
  if (logoInner === null) {
    const logo: string = await $.fs.read(`${$.plugin.root}/hooks/query-view/graphit-logo.svg`).catch(() => '')
    logoInner = logo.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '')
  }
  const paged = await read($, pages)
  const colKey = `${rowKey}:cols`
  let model: ReturnType<typeof buildModel> | null = null
  const act: CardActions = {
    setTab: tab => update($, tabs, m => capped(m, id, tab)),
    goTo: n => update($, pages, m => capped(m, rowKey, Math.min(Math.max(n, 0), (model?.pageCount ?? 1) - 1))),
    goCols: (n, count) => update($, pages, m => capped(m, colKey, Math.min(Math.max(n, 0), count - 1))),
    openKb: x => openKb($, x),
    loadUpstream: () => loadUpstream($, rowKey, model?.sourceName, model?.lineageRefs ?? []),
    openExplorer: async (title, layers) => {
      await update($, explore, () => ({ title, layers: layers.layers, edges: layers.edges, trail: [] }))
      await $.ui.open({ id: LINEAGE_PANE, title: 'Lineage', closeOnEscape: true, focus: true })
    },
    openSql: async (title, sql) => {
      await update($, sqlPane, () => ({ title, sql }))
      await $.ui.open({ id: SQL_PANE, title, closeOnEscape: true, focus: true })
    },
    openResults: async () => {
      rememberOpened(rowKey, result)
      const title = `Results · ${model?.sourceName ?? 'query'}`
      await update($, resultsView, () => ({ id: rowKey, title, query: '', sort: '', desc: false, limit: RESULTS_STEP }))
      // Wide enough for every column; a width the person dragged to still wins.
      await $.ui.open({ id: RESULTS_PANE, title, closeOnEscape: true, focus: true, columns: resultsWidth(result) })
    },
    copy: text => $.ui.copy({ text, surface: e.surface }),
  }
  model = buildModel({
    id,
    rowKey,
    command,
    result,
    header,
    nav,
    state: {
      tab: (await read($, tabs))[id],
      page: paged[rowKey],
      colPage: paged[colKey],
      upstream: (await read($, upstreams))[rowKey],
      logoInner,
    },
    act,
  })
  return e.surface === 'desktop' && ui.Svg ? drawDesktopCard(ui, model) : drawTerminalCard(ui, model)
}

export const register: Register = on => {
  // The terminal's result row carries no command, so record each graphit query
  // here for the render gate below. Feature #1067: a large result is moved to
  // a file and drawn with an empty output; the engine names that file in
  // `persistedOutputPath`, kept in module memory - nothing is read or parsed
  // here, so a query is never slower for the view (Feature #1077's marker is
  // one small write).
  on('tool.call', { tool: 'Bash' }, async ($, e, proceed) => {
    const command = (e as { command?: unknown }).command
    if (typeof command !== 'string' || !e.tool_use_id || !isGraphitQuery(command)) return proceed(e)
    const id = e.tool_use_id
    await stampDrawsMarker($)
    await update($, commands, m => capped(m, id, command))
    const out = await proceed(e)
    if (queryReachesStdout(command)) rememberSaved(id, (out as { result?: unknown } | null)?.result)
    return out
  })

  // The terminal draws a standalone Bash result as its own ToolResult; the
  // desktop draws command and output as one ToolUse card. Hook both.
  for (const component of ['ToolResult', 'ToolUse'] as const) {
    on('ui.render', { component }, async ($, e, proceed) => {
      if (e.props.tool !== 'Bash' || e.props.isErrored) return proceed(e)
      if ('isRunning' in e.props && e.props.isRunning) return proceed(e)
      const command =
        'input' in e.props ? (e.props.input as { command?: unknown } | null)?.command : (await read($, commands))[e.props.tool_use_id]
      if (typeof command !== 'string' || !isGraphitQuery(command) || !queryReachesStdout(command)) {
        return proceed(e)
      }
      const loaded = await loadResult($, e.props.tool_use_id, e.props.output)
      if (!loaded) return proceed(e)
      return drawLoaded($, e, loaded, e.props.tool_use_id, command, 'input' in e.props ? commandLine(command) : null)
    })
  }

  // Feature #1067: the desktop folds a run of calls into one "Ran N commands"
  // row. Keep that row as the app draws it and show the query card under it;
  // several queries in one fold share a carousel. Unfolded, each row draws its
  // own card.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, proceed) => {
    if (e.props.isExpanded) return proceed(e)
    const known = await read($, commands)
    const groupKey = String(e.requestId)
    const queries: Array<{ id: string; command: string; loaded: NonNullable<Loaded> }> = []
    for (const [i, c] of e.props.calls.entries()) {
      if (c.tool !== 'Bash' || c.isRunning || c.isErrored) continue
      const input = (c.input as { command?: unknown } | null)?.command
      const command = typeof input === 'string' ? input : c.tool_use_id ? known[c.tool_use_id] : undefined
      if (typeof command !== 'string' || !isGraphitQuery(command) || !queryReachesStdout(command)) continue
      const loaded = await loadResult($, c.tool_use_id, c.output)
      if (loaded) queries.push({ id: c.tool_use_id ?? `${groupKey}:${i}`, command, loaded })
    }
    if (queries.length === 0) return proceed(e)
    const engine = await proceed(e)
    const stored = (await read($, slides))[groupKey]
    const pos = Math.min(Math.max(stored ?? queries.length - 1, 0), queries.length - 1)
    const q = queries[pos]
    const { Box, Text, Button } = $.ui.resolve(e)
    const nav =
      queries.length > 1 ? (
        <Box alignItems="center" gap={1} flexShrink={0}>
          <Button
            key={`slide-prev-${groupKey}`}
            label="❮"
            variant="secondary"
            dimColor={pos === 0}
            onPress={() => update($, slides, m => capped(m, groupKey, Math.max(pos - 1, 0)))}
          />
          <Button
            key={`slide-next-${groupKey}`}
            label="❯"
            variant="secondary"
            dimColor={pos === queries.length - 1}
            onPress={() => update($, slides, m => capped(m, groupKey, Math.min(pos + 1, queries.length - 1)))}
          />
          <Text wrap="truncate">{`Query ${pos + 1} of ${queries.length}`}</Text>
        </Box>
      ) : null
    // In a carousel the selected tab belongs to the group, so paging keeps it.
    const card = await drawLoaded($, e, q.loaded, queries.length > 1 ? groupKey : q.id, q.command, commandLine(q.command), nav, q.id)
    return (
      <Box flexDirection="column">
        {engine}
        {card}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: KB_PANE }, async ($, e) => {
    const sel = await read($, selected)
    const def = sel ? (await read($, defs))[`${sel.kind}:${sel.name}`] : undefined
    return drawKbPane($.ui.resolve(e), sel, def, text => $.ui.copy({ text, surface: e.surface }))
  })
  on('ui.render', { component: 'Pane', requestId: SQL_PANE }, async ($, e) =>
    drawSqlPane($.ui.resolve(e), await read($, sqlPane), text => $.ui.copy({ text, surface: e.surface })),
  )
  // Feature #1067: Full results. A search starts the rows over at the first
  // thousand; a header press sorts low to high, then high to low, then off.
  on('ui.render', { component: 'Pane', requestId: RESULTS_PANE }, async ($, e) => {
    const view = await read($, resultsView)
    const set = (fn: (v: ResultsView) => ResultsView) => update($, resultsView, v => (v ? fn(v) : v))
    return drawResultsPane($.ui.resolve(e), openedFor(view?.id), view, {
      search: query => set(v => ({ ...v, query, limit: RESULTS_STEP })),
      sortBy: column =>
        set(v =>
          v.sort !== column ? { ...v, sort: column, desc: false } : v.desc ? { ...v, sort: '', desc: false } : { ...v, desc: true },
        ),
      more: () => set(v => ({ ...v, limit: v.limit + RESULTS_STEP })),
      copy: text => $.ui.copy({ text, surface: e.surface }),
    })
  })
  // Feature #1067: the lineage explorer. The trail keeps '' for the layer list,
  // so Back returns to it too. A pane that throws draws nothing; say why.
  on('ui.render', { component: 'Pane', requestId: LINEAGE_PANE }, async ($, e) => {
    try {
      return drawExplorer($.ui.resolve(e), await read($, explore), {
        go: to => update($, explore, x => (x ? { ...x, selected: to, trail: [...x.trail, x.selected ?? ''].slice(-30) } : x)),
        back: () => update($, explore, x => (x && x.trail.length ? { ...x, selected: x.trail[x.trail.length - 1] || undefined, trail: x.trail.slice(0, -1) } : x)),
        all: () => update($, explore, x => (x ? { ...x, selected: undefined, trail: [...x.trail, x.selected ?? ''].slice(-30) } : x)),
      })
    } catch (err) {
      const { Text } = $.ui.resolve(e)
      return <Text color="red">{`The lineage explorer failed: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`}</Text>
    }
  })
}
