// Feature #1062: the query view's session state (the `graphit` plugin's
// $.state contract, named by .claude-plugin/plugin.json "types").

export type TabId = 'results' | 'base' | 'runtime' | 'kb' | 'governance'
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

declare module 'claude-code' {
  interface PluginState {
    graphit: {
      queryViewTab: TabByCall
      queryViewSelected: KbSelection | null
      queryViewDefs: Record<string, KbDef>
      queryViewCommands: CommandByCall
    }
  }
}
