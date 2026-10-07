// Feature #1067: the full lineage of a query result, from the
// warehouse down to the result columns. Pure: parsing of what the graphit CLI
// returns and the layer graph the card draws; the reads themselves run in
// register.tsx.

import type { Expansion } from './sql'
import type { Upstream } from './state'

// A fact the sidebar shows for a node; `code` values are drawn as SQL.
export type Fact = { label: string; value: string; code?: boolean }
export type LayerNode = { id: string; title: string; subtitle?: string; color: string; muted?: boolean; facts?: Fact[] }
export type LayerEdge = { from: string; to: string; color: string; dashed?: boolean }
export type Layers = { layers: Array<{ label: string; nodes: LayerNode[] }>; edges: LayerEdge[] }

const KEYWORDS = new Set(
  (
    'SELECT FROM WHERE AND OR NOT CASE WHEN THEN ELSE END AS CAST DATE TIMESTAMP TIMESTAMP_NTZ INT INTEGER NUMBER ' +
    'NUMERIC DECIMAL FLOAT DOUBLE VARCHAR STRING TEXT BOOLEAN TRUE FALSE NULL IS IN LIKE ILIKE BETWEEN DISTINCT ' +
    'DAY WEEK MONTH QUARTER YEAR HOUR MINUTE SECOND INTERVAL ON JOIN LEFT RIGHT INNER OUTER FULL GROUP BY ORDER ' +
    'HAVING LIMIT OVER PARTITION ROWS UNBOUNDED PRECEDING FOLLOWING CURRENT ROW WITH ASC DESC'
  ).split(' '),
)

// Blank quoted text so an identifier search never reads inside a literal.
const unquote = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''")
// Feature #1092: blank literals and drop comments in one left-to-right pass, so
// neither fools the other - an apostrophe in `-- it's read from Firestore`
// opened a fake literal that swallowed the next real FROM, and a `--` inside a
// literal must stay text. A comment is prose, never a table.
const uncomment = (sql: string) =>
  sql.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, m => (m.startsWith("'") ? "''" : ' '))
// One name part: bare, "double quoted" (Snowflake) or `backticked` (BigQuery).
const NAME_PART = '(?:"[^"]+"|`[^`]+`|[A-Za-z_][\\w$]*)'
const FROM_TARGET = new RegExp(`\\b(?:FROM|JOIN)\\s+(${NAME_PART}(?:\\s*\\.\\s*${NAME_PART})*)`, 'gi')

// FROM targets that are not tables: inline rows and table functions.
const NOT_TABLES = new Set(['VALUES', 'LATERAL', 'TABLE', 'UNNEST', 'FLATTEN', 'GENERATOR', 'SELECT'])
// A FROM inside EXTRACT(YEAR FROM col) or TRIM(x FROM col) names a column.
const IN_FUNCTION = /\b(?:EXTRACT|TRIM|SUBSTRING|POSITION|OVERLAY)\s*\([^()]*$/i

// Column identifiers an expression reads: bare names, not functions, keywords
// or numbers; a qualified `o.AMOUNT` counts as AMOUNT.
export function columnsOf(expr: string): string[] {
  const out: string[] = []
  for (const m of unquote(expr).matchAll(/(?:\b[A-Za-z_]\w*\.)?\b([A-Za-z_]\w*)\b(?!\s*\()/g)) {
    const name = m[1].toUpperCase()
    if (!KEYWORDS.has(name) && !out.includes(name)) out.push(name)
  }
  return out
}

// The warehouse tables a data source's SQL reads: FROM / JOIN targets that are
// not its own CTE names, inline VALUES, table functions or comment text.
export function warehouseTables(sql: string): string[] {
  const text = uncomment(sql)
  const ctes = new Set([...text.matchAll(/\b([A-Za-z_]\w*)\s+AS\s*\(/gi)].map(m => m[1].toUpperCase()))
  const out: string[] = []
  for (const m of text.matchAll(FROM_TARGET)) {
    const name = m[1].replace(/\s*\.\s*/g, '.').replace(/["`]/g, '')
    const upper = name.toUpperCase()
    if (ctes.has(upper) || NOT_TABLES.has(upper) || IN_FUNCTION.test(text.slice(Math.max(0, (m.index ?? 0) - 80), m.index))) continue
    if (!out.includes(name)) out.push(name)
  }
  return out
}

// snowflake -> Snowflake; the warehouse names the tables layer.
export function warehouseLabel(kind: string): string {
  return kind === 'snowflake' ? 'Snowflake' : kind === 'bigquery' ? 'BigQuery' : kind === 'file_upload' ? 'File upload' : kind.charAt(0).toUpperCase() + kind.slice(1)
}

// 2026-10-04T05:00:10Z -> "4 Oct 08:00" in Israel time.
export function israelTime(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return undefined
  try {
    // Built from parts: runtimes disagree on the joiner ("4 Oct, 08:00", "4 Oct at 08:00").
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return `${part('day')} ${part('month')} ${part('hour')}:${part('minute')}`
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

// The first JSON value in a CLI's output, or null.
export function jsonOf(text: string): unknown {
  const at = text.search(/[[{]/)
  if (at < 0) return null
  try {
    return JSON.parse(text.slice(at))
  } catch {
    return null
  }
}

// The CLI's own failure text: the last `{"error": ...}` line on stderr, else
// its last line, kept short for a one-line status.
export function errorOf(stderr: string): string {
  const lines = stderr.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of [...lines].reverse()) {
    const parsed = line.startsWith('{') ? (jsonOf(line) as { error?: unknown } | null) : null
    if (typeof parsed?.error === 'string') return parsed.error.slice(0, 120)
  }
  return (lines[lines.length - 1] ?? '').slice(0, 120)
}

type DsRow = { id?: string; name?: string; connector_type?: string; source_sql?: string; row_count?: number; last_refreshed?: string; domain?: string }
type Model = {
  name?: string
  group?: string
  primary_entity?: string
  dimensions?: Array<{ name?: string; expr?: string | null }>
  measures?: Array<{ name?: string; agg?: string; expr?: string | null }>
}
type MetricEntity = {
  name?: string
  type?: string
  group?: string
  type_params?: {
    measure?: { name?: string } | null
    numerator?: { name?: string } | null
    denominator?: { name?: string } | null
    metrics?: Array<{ name?: string }> | null
  }
}

// Assemble the upstream from the CLI's answers. Every input is optional: a
// read that failed leaves its layer out rather than failing the lineage.
export function assembleUpstream(input: {
  sourceName?: string
  dsList: unknown
  history: unknown
  models: unknown
  metrics: unknown[]
  refs: Array<{ kind: string; name: string }>
}): Upstream {
  const up: Upstream = { status: 'ok' }
  const rows = ((input.dsList as { data_sources?: DsRow[] } | null)?.data_sources ?? []) as DsRow[]
  const ds = input.sourceName ? rows.find(r => (r.name ?? '').toLowerCase() === input.sourceName!.toLowerCase()) : undefined
  if (ds) {
    const kind = ds.connector_type ?? 'warehouse'
    const file = /Uploaded from:\s*([^,\n]+)/.exec(ds.source_sql ?? '')?.[1]?.trim()
    up.warehouse = { kind, file }
    if (kind !== 'file_upload' && ds.source_sql) up.tables = warehouseTables(ds.source_sql)
    const run = Array.isArray(input.history) ? (input.history[0] as { started_at?: string; status?: string; type?: string; rows?: number } | undefined) : undefined
    up.ds = {
      name: ds.name ?? input.sourceName ?? '',
      rows: run?.rows ?? ds.row_count,
      refreshedAt: israelTime(run?.started_at ?? ds.last_refreshed),
      refreshType: run?.type,
      refreshStatus: run?.status,
      domain: ds.domain,
      sql: kind !== 'file_upload' ? ds.source_sql : undefined,
    }
  }

  const metricEntities = input.metrics
    .map(m => (m as { entity?: MetricEntity } | null)?.entity)
    .filter((m): m is MetricEntity => !!m && !!m.name)
  up.metrics = metricEntities.map(m => {
    const p = m.type_params ?? {}
    const inputs = [p.measure?.name, p.numerator?.name, p.denominator?.name, ...(p.metrics ?? []).map(x => x.name)].filter(
      (x): x is string => !!x,
    )
    return { name: m.name!, type: m.type ?? 'metric', group: m.group, inputs }
  })

  // The model: the one holding the referenced dimensions and metric inputs.
  const models = ((input.models as { items?: Model[] } | null)?.items ?? (Array.isArray(input.models) ? input.models : [])) as Model[]
  const dimNames = input.refs.filter(r => r.kind === 'Dimension').map(r => r.name.split('__').pop() as string)
  const inputNames = up.metrics.flatMap(m => m.inputs)
  const score = (m: Model) =>
    dimNames.filter(d => (m.dimensions ?? []).some(x => x.name === d)).length +
    inputNames.filter(n => (m.measures ?? []).some(x => x.name === n)).length +
    (input.sourceName && (m.name ?? '').toLowerCase() === input.sourceName.toLowerCase() ? 1 : 0)
  const model = models.reduce<Model | undefined>((best, m) => (score(m) > 0 && (!best || score(m) > score(best)) ? m : best), undefined)
  if (model) {
    up.model = { name: model.name ?? '', group: model.group }
    up.measures = (model.measures ?? [])
      .filter(x => x.name && inputNames.includes(x.name))
      .map(x => ({ name: x.name!, agg: (x.agg ?? '').toUpperCase(), expr: x.expr ?? x.name!, columns: columnsOf(x.expr ?? x.name!) }))
    up.dims = (model.dimensions ?? [])
      .filter(x => x.name && dimNames.includes(x.name))
      .map(x => ({ name: x.name!, expr: x.expr ?? x.name!, columns: columnsOf(x.expr ?? x.name!) }))
  }
  return up
}

// Drop a set of nodes and join what fed them straight to what they fed, so
// the chain stays connected.
function bypass(spec: Layers, drop: Set<string>): Layers {
  const into = spec.edges.filter(e => drop.has(e.to) && !drop.has(e.from))
  const out = spec.edges.filter(e => drop.has(e.from) && !drop.has(e.to))
  const kept = spec.edges.filter(e => !drop.has(e.from) && !drop.has(e.to))
  const joined = into.flatMap(a => out.filter(b => b.from === a.to).map(b => ({ ...b, from: a.from })))
  const seen = new Set<string>()
  const edges = [...kept, ...joined].filter(e => {
    const k = `${e.from}>${e.to}`
    return seen.has(k) ? false : (seen.add(k), true)
  })
  const layers = spec.layers.map(l => ({ ...l, nodes: l.nodes.filter(n => !drop.has(n.id)) })).filter(l => l.nodes.length > 0)
  return { layers, edges }
}

// The card's overview of the chain: tables, source, model, KB, rules, result.
// Physical columns and measures are the model's detail - drawn on the card
// they made eight columns too narrow to read a name in. The explorer keeps
// every layer.
const DETAIL_LAYERS = new Set(['COLUMNS', 'MEASURES'])
export function overviewLayers(spec: Layers): Layers {
  const drop = new Set(spec.layers.filter(l => DETAIL_LAYERS.has(l.label)).flatMap(l => l.nodes.map(n => n.id)))
  return drop.size ? bypass(spec, drop) : spec
}

// One node's own chain: everything it comes from and everything it feeds.
export function chainOf(spec: Layers, id: string): Layers {
  const walk = (upward: boolean) => {
    const seen = new Set([id])
    const queue = [id]
    while (queue.length) {
      const at = queue.shift() as string
      for (const e of spec.edges) {
        const next = upward ? (e.to === at ? e.from : undefined) : e.from === at ? e.to : undefined
        if (next && !seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    return seen
  }
  const up = walk(true)
  const down = walk(false)
  const keep = new Set([...up, ...down])
  return {
    layers: spec.layers.map(l => ({ ...l, nodes: l.nodes.filter(n => keep.has(n.id)) })).filter(l => l.nodes.length > 0),
    edges: spec.edges.filter(e => keep.has(e.from) && keep.has(e.to) && (up.has(e.to) || down.has(e.from))),
  }
}

const C = {
  ink: '#222224',
  wh: '#2F6FDB',
  ds: '#4DB6AC',
  model: '#7A5AF8',
  column: '#6E6E73',
  measure: '#2A9D8F',
  metric: '#2A9D8F',
  dim: '#5B8DEF',
  red: '#dc2626',
  gray: '#AEAEB2',
}

// The layers top to bottom; a layer with nothing to show is left out.
export function lineageLayers(input: {
  up?: Upstream
  sourceName?: string
  rowCount: number
  columns: string[]
  hidden: Set<string>
  refs: Array<{ kind: string; name: string }>
  expansions: Expansion[]
  rules: Array<{ name: string; clauses: string[]; masks: string[]; color: string; why?: string }>
}): Layers {
  const up = input.up?.status === 'ok' ? input.up : undefined
  const layers: Layers['layers'] = []
  const edges: LayerEdge[] = []
  const add = (label: string, nodes: LayerNode[]) => nodes.length && layers.push({ label, nodes })
  const link = (from: string, to: string, color: string, dashed?: boolean) => edges.push({ from, to, color, dashed })

  // The warehouse tables (or the uploaded file) the source reads. The
  // warehouse itself is the layer's name, not a node of its own: one box
  // saying "Snowflake" told nothing the tables do not.
  const warehouse = up?.warehouse ? warehouseLabel(up.warehouse.kind) : undefined
  if (up?.warehouse?.kind === 'file_upload') {
    add('FILE', [{ id: 'file', title: up.warehouse.file ?? 'Uploaded file', subtitle: 'file upload', color: C.wh, facts: [{ label: 'Kind', value: 'File upload' }, ...(up.warehouse.file ? [{ label: 'File', value: up.warehouse.file }] : [])] }])
  } else if (warehouse) {
    add(
      `${warehouse.toUpperCase()} TABLES`,
      (up?.tables ?? []).map(t => {
        const parts = t.split('.')
        return {
          id: `tb:${t}`,
          title: parts[parts.length - 1],
          subtitle: parts.length > 1 ? parts.slice(0, -1).join('.') : 'table',
          color: C.wh,
          facts: [{ label: 'Table', value: t }, { label: 'Warehouse', value: warehouse }],
        }
      }),
    )
  }

  // The cached data source.
  const dsName = up?.ds?.name ?? input.sourceName
  if (dsName) {
    // Rows first: a clipped subtitle still says how big the source is.
    const bits = [up?.ds?.rows != null ? `${up.ds.rows.toLocaleString('en-US')} rows` : undefined, up?.ds?.refreshedAt].filter(Boolean)
    add('DATA SOURCE', [
      {
        id: 'ds',
        title: dsName,
        subtitle: bits.join(' · ') || 'cached source',
        color: C.ds,
        facts: [
          ...(up?.ds?.rows != null ? [{ label: 'Rows', value: up.ds.rows.toLocaleString('en-US') }] : []),
          ...(up?.ds?.refreshedAt ? [{ label: 'Last refresh', value: [up.ds.refreshType, up.ds.refreshedAt, up.ds.refreshStatus].filter(Boolean).join(' · ') }] : []),
          ...(up?.ds?.domain ? [{ label: 'Access domain', value: up.ds.domain }] : []),
          ...(up?.ds?.sql ? [{ label: 'Source SQL', value: up.ds.sql, code: true }] : []),
        ],
      },
    ])
    if (up?.warehouse?.kind === 'file_upload') link('file', 'ds', C.wh)
    else for (const t of up?.tables ?? []) link(`tb:${t}`, 'ds', C.wh)
  }

  // Semantic model, its physical columns, its measures.
  const ruleColumns = input.rules.flatMap(r => r.clauses.flatMap(columnsOf))
  if (up?.model) {
    add('SEMANTIC MODEL', [
      {
        id: 'model',
        title: up.model.name,
        subtitle: up.model.group ? `group ${up.model.group}` : 'model',
        color: C.model,
        facts: [
          ...(up.model.group ? [{ label: 'Group', value: up.model.group }] : []),
          { label: 'Measures used', value: (up.measures ?? []).map(m => m.name).join(', ') || 'none' },
          { label: 'Dimensions used', value: (up.dims ?? []).map(d => d.name).join(', ') || 'none' },
        ],
      },
    ])
    if (dsName) link('ds', 'model', C.model)
    const physical = [...new Set([...(up.measures ?? []).flatMap(m => m.columns), ...(up.dims ?? []).flatMap(d => d.columns), ...ruleColumns])]
    add('COLUMNS', physical.map(c => ({ id: `col:${c}`, title: c, color: C.column, facts: [{ label: 'Physical column', value: c }] })))
    for (const c of physical) link('model', `col:${c}`, C.gray)
    add('MEASURES', (up.measures ?? []).map(m => ({ id: `ms:${m.name}`, title: m.name, subtitle: `${m.agg}(${m.expr})`, color: C.measure, facts: [{ label: 'Aggregation', value: m.agg }, { label: 'Expression', value: `${m.agg}(${m.expr})`, code: true }] })))
    for (const m of up.measures ?? []) {
      for (const c of m.columns) link(`col:${c}`, `ms:${m.name}`, C.measure)
      // COUNT(1) reads no column: it comes from the model itself.
      if (m.columns.length === 0) link('model', `ms:${m.name}`, C.measure)
    }
  }

  // Metrics and dimensions the query references.
  const refNodes: LayerNode[] = input.refs.map(r => {
    const short = r.name.split('__').pop() as string
    const metric = up?.metrics?.find(m => m.name === r.name)
    const dim = up?.dims?.find(d => d.name === short)
    const compiled = input.expansions.find(x => x.kind === r.kind && x.name === r.name)?.expr
    return {
      id: `ref:${r.kind}:${r.name}`,
      title: short,
      subtitle: r.kind === 'Metric' ? [metric?.type ?? 'metric', metric?.group].filter(Boolean).join(' · ') : 'dimension',
      color: r.kind === 'Metric' ? C.metric : C.dim,
      facts: [
        { label: 'Reference', value: `{{ ${r.kind}('${r.name}') }}`, code: true },
        ...(metric ? [{ label: 'Type', value: metric.type }, ...(metric.group ? [{ label: 'Group', value: metric.group }] : []), ...(metric.inputs.length ? [{ label: 'Inputs', value: metric.inputs.join(', ') }] : [])] : []),
        ...(dim ? [{ label: 'Expression', value: dim.expr, code: true }] : []),
        ...(compiled ? [{ label: 'Compiles to', value: compiled, code: true }] : []),
      ],
    }
  })
  add('KB ASSETS', refNodes)
  for (const r of input.refs) {
    const id = `ref:${r.kind}:${r.name}`
    const short = r.name.split('__').pop() as string
    if (r.kind === 'Metric') {
      const inputs = up?.metrics?.find(m => m.name === r.name)?.inputs ?? []
      const fromMeasures = inputs.filter(i => up?.measures?.some(m => m.name === i))
      for (const i of fromMeasures) link(`ms:${i}`, id, C.metric)
      if (fromMeasures.length === 0 && up?.model) link('model', id, C.metric)
      if (!up?.model && dsName) link('ds', id, C.metric)
    } else {
      const dim = up?.dims?.find(d => d.name === short)
      if (dim) for (const c of dim.columns) link(`col:${c}`, id, C.dim)
      else if (up?.model) link('model', id, C.dim)
      else if (dsName) link('ds', id, C.dim)
    }
  }

  // Governance: a filter reads columns and narrows the rows; a mask hides one.
  add(
    'GOVERNANCE',
    input.rules.map(r => ({
      id: `rule:${r.name}`,
      title: r.name,
      subtitle: r.masks.length ? 'mask' : 'row filter',
      color: r.color,
      facts: [
        ...(r.why ? [{ label: 'Why', value: r.why }] : []),
        ...r.clauses.map((c, i) => ({ label: i === 0 ? 'Adds filter' : '', value: c, code: true })),
        ...(r.masks.length ? [{ label: 'Masks', value: r.masks.join(', ') }] : []),
      ],
    })),
  )
  for (const r of input.rules) {
    const cols = r.clauses.flatMap(columnsOf).filter(c => layers.some(l => l.nodes.some(n => n.id === `col:${c}`)))
    if (cols.length) for (const c of cols) link(`col:${c}`, `rule:${r.name}`, r.color, true)
    else if (dsName) link('ds', `rule:${r.name}`, r.color, true)
    if (r.clauses.length) link(`rule:${r.name}`, 'rows', r.color, true)
    for (const m of r.masks) link(`rule:${r.name}`, `out:${m}`, C.red, true)
  }

  // The result: its rows and columns.
  add('RESULT', [
    { id: 'rows', title: `${input.rowCount.toLocaleString('en-US')} rows`, color: C.ds, facts: [{ label: 'Rows returned', value: input.rowCount.toLocaleString('en-US') }] },
    ...input.columns.map(c => ({
      id: `out:${c}`,
      title: c,
      subtitle: input.hidden.has(c) ? 'masked' : undefined,
      color: input.hidden.has(c) ? C.red : C.ink,
      muted: input.hidden.has(c),
      facts: [{ label: 'Result column', value: c }, ...(input.hidden.has(c) ? [{ label: 'Policy', value: 'Returned as NULL by a masking rule' }] : [])],
    })),
  ])
  // The rows come from the source; a rule that filters them says so above.
  if (dsName) link('ds', 'rows', C.ds)
  for (const c of input.columns) {
    const ref = input.refs.find(r => {
      const x = input.expansions.find(e => e.kind === r.kind && e.name === r.name)
      return c === x?.alias || c === r.name || c === r.name.split('__').pop()
    })
    if (ref) link(`ref:${ref.kind}:${ref.name}`, `out:${c}`, ref.kind === 'Metric' ? C.metric : C.dim)
    else if (layers.some(l => l.nodes.some(n => n.id === `col:${c.toUpperCase()}`))) link(`col:${c.toUpperCase()}`, `out:${c}`, C.gray)
    else if (dsName && !input.hidden.has(c)) link('ds', `out:${c}`, C.gray)
  }
  return { layers, edges }
}
