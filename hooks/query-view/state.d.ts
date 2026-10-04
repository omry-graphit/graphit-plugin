// Feature #1062: the query view's session state (the `graphit` plugin's
// $.state contract, named by .claude-plugin/plugin.json "types").

export type TabId = 'results' | 'chart' | 'lineage' | 'base' | 'runtime' | 'kb' | 'governance'
export type TabByCall = Record<string, TabId>

// The KB reference opened in the sidebar, with what it compiled to here.
export type KbSelection = { kind: string; name: string; alias: string; expansion: string }

// A fetched definition, keyed `${kind}:${name}`.
export type KbDef = {
  status: 'loading' | 'ok' | 'error' | 'unsupported'
  type?: string
  description?: string
  group?: string
  lifecycle?: string
  domains?: string[]
  parts?: Array<{ label: string; value: string }>
  error?: string
}

// Each Bash call's command, keyed by tool_use_id: the terminal's result row
// carries no command, and the view draws only a graphit query reaching stdout.
export type CommandByCall = Record<string, string>

// Feature #1067: the lineage explorer pane - every layer and edge of
// one query's lineage, the node open in it, and the nodes visited before it.
export type ExploreNode = { id: string; title: string; subtitle?: string; color: string; muted?: boolean; facts?: Array<{ label: string; value: string; code?: boolean }> }
export type Explore = {
  title: string
  layers: Array<{ label: string; nodes: ExploreNode[] }>
  edges: Array<{ from: string; to: string; color: string; dashed?: boolean }>
  selected?: string
  trail: string[]
}
// The full-SQL pane.
export type SqlPane = { title: string; sql: string }
// Feature #1067: the Full results sidebar - which query (its row key), the
// search, the sorted column and how many rows it draws.
export type ResultsView = { id: string; title: string; query: string; sort: string; desc: boolean; limit: number }

// Feature #1067: the upstream lineage read for one query, through
// the same graphit binary, with the caller's own KB and source permissions.
export type Upstream = {
  status: 'loading' | 'ok' | 'error'
  error?: string
  // The source the query named, when the signed-in org's source list lacks it.
  notFound?: string
  loadedAt?: string
  warehouse?: { kind: string; file?: string }
  tables?: string[]
  ds?: { name: string; rows?: number; refreshedAt?: string; refreshType?: string; refreshStatus?: string; domain?: string; sql?: string }
  model?: { name: string; group?: string }
  measures?: Array<{ name: string; agg: string; expr: string; columns: string[] }>
  dims?: Array<{ name: string; expr: string; columns: string[] }>
  metrics?: Array<{ name: string; type: string; group?: string; inputs: string[] }>
}

declare module 'claude-code' {
  interface PluginState {
    graphit: {
      queryViewTab: TabByCall
      queryViewSelected: KbSelection | null
      queryViewDefs: Record<string, KbDef>
      queryViewCommands: CommandByCall
      queryViewSlide: Record<string, number>
      queryViewPage: Record<string, number>
      queryViewUpstream: Record<string, Upstream>
      queryViewExplore: Explore | null
      queryViewSqlPane: SqlPane | null
      queryViewResults: ResultsView | null
    }
  }
}
