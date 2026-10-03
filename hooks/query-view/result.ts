// Pure parts of the query view: the payload's shape, its parsing and the
// per-line marks. No `$` here - every engine call stays in register.tsx.

import type { KbDef } from './state'
import { lineText } from './sql'
import type { Expansion, Token } from './sql'

export const MAX_ROWS = 20
const MAX_COL = 24

type Injection = {
  outcome?: string
  source?: string
  rule_name?: string
  source_id?: string
  why?: string
  added_clauses?: string[]
  transformations?: Array<{ column?: string }>
  reason?: string
}

// Feature #1062: the CLI's allowlist - see serialize_kb_references (backend).
export type KbReference = { kind?: string; name?: string; deprecated?: boolean }

// The gateway's reference kinds, as template kinds.
export const REF_KIND: Record<string, string> = { metric: 'Metric', metric_raw: 'Measure', dim: 'Dimension' }

type QueryResult = {
  rows: Array<Record<string, unknown>>
  columns?: string[]
  row_count?: number
  query_ms?: number
  source?: string
  sql?: string
  governed_sql?: string
  hidden_columns?: string[]
  provenance?: {
    tier?: string
    kb_refs?: number
    kb_references?: KbReference[]
    rules_enforced?: number
    injection_summary?: {
      injections?: Injection[]
      override_denied?: Array<{ rule_name?: string; reason?: string }>
    }
  }
}

export const OUTCOME_BADGE: Record<string, { label: string; color: string }> = {
  rewritten: { label: 'REWROTE', color: '#2e9e5b' },
  conditional_applied: { label: 'APPLIED', color: '#2e9e5b' },
  conditional_default_fire: { label: 'APPLIED BY DEFAULT', color: '#2e9e5b' },
  validated: { label: 'VALIDATED', color: '#3b82f6' },
  blocked: { label: 'BLOCKED', color: '#dc2626' },
  overridden: { label: 'OVERRIDDEN', color: '#6b7280' },
  conditional_skipped: { label: 'SKIPPED', color: '#6b7280' },
}

export const TIER_COLOR: Record<string, string> = {
  governed: 'green',
  verified: 'cyan',
  ad_hoc: 'gray',
}

// Query data is untrusted: strip ANSI, C0/C1 controls and bidi overrides.
export function clean(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return s
    .replace(/\u001b\[[0-9;:?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[@-_]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '')
}

export function cell(value: unknown): string {
  const s = clean(value).replace(/\n/g, ' ')
  return s.length > MAX_COL ? `${s.slice(0, MAX_COL - 1)}…` : s
}

export function fmtNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 100 ? 2 : 4 })
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export function parseQueryResult(output: unknown): QueryResult | null {
  // The terminal passes Bash's record ({ stdout, stderr }); the desktop's
  // ToolUse card passes the output as one string.
  const stdout =
    typeof output === 'string'
      ? output
      : output && typeof output === 'object'
        ? (output as { stdout?: unknown }).stdout
        : undefined
  if (typeof stdout !== 'string') return null
  const json = firstJsonObject(stdout)
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Partial<QueryResult>
    const isQuery = Array.isArray(parsed.rows) && ('columns' in parsed || 'provenance' in parsed)
    return isQuery ? (parsed as QueryResult) : null
  } catch {
    return null
  }
}

export const MARK = {
  added: { marker: '+', color: '#2e9e5b' },
  masked: { marker: '~', color: '#c2409a' },
  kb: { marker: '◆', color: '#2a9d8f' },
}

type LineMark = { marker: string; color: string; note: string }

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// An added clause arrives parameterized (MEDIA_SOURCE <> '?'): each ? stands
// for the literal the runtime SQL bound in its place.
function clauseMatcher(clause: string): RegExp {
  const pattern = escapeRe(clause.trim())
    .replace(/'\\\?'/g, "'(?:[^']|'')*'")
    .replace(/\\\?/g, "(?:'(?:[^']|'')*'|[\\w.-]+)")
    .replace(/\s+/g, '\\s+')
  return new RegExp(pattern, 'i')
}

// What each SQL line owes to the KB and to governance, for its gutter and note.
export function marksFor(
  line: Token[],
  mode: 'base' | 'runtime',
  injections: Injection[],
  expansions: Expansion[],
): LineMark[] {
  const text = lineText(line)
  const marks: LineMark[] = []
  if (mode === 'base') {
    // The reference itself opens the sidebar; the gutter flags the line.
    if (line.some(t => t.kind === 'template')) marks.push({ ...MARK.kb, note: '' })
    return marks
  }
  for (const inj of injections) {
    const rule = cell(inj.rule_name ?? inj.source_id ?? 'rule')
    if ((inj.added_clauses ?? []).some(cl => cl && clauseMatcher(cl).test(text))) {
      marks.push({ ...MARK.added, note: rule })
    }
    for (const t of inj.transformations ?? []) {
      if (t.column && new RegExp(`NULL\\s+AS\\s+"?${escapeRe(t.column)}\\b`, 'i').test(text)) {
        marks.push({ ...MARK.masked, note: `${rule} hid ${cell(t.column)}` })
      }
    }
  }
  for (const x of runtimeExpansions(line, expansions)) {
    marks.push({ ...MARK.kb, note: `${x.kind} ${cell(x.name)}` })
  }
  return marks
}

// The KB expansions a runtime SQL line holds: the select item whose alias a
// base-query template compiled into.
function runtimeExpansions(line: Token[], expansions: Expansion[]): Expansion[] {
  const text = lineText(line)
  return expansions.filter(x => new RegExp(`\\bAS\\s+"?${escapeRe(x.alias)}"?\\s*,?\\s*$`, 'i').test(text))
}

// A `graphit kb get metric` answer, cut to what the sidebar shows.
export function parseMetricDef(stdout: string): KbDef {
  try {
    const entity = (JSON.parse(stdout) as { entity?: Record<string, unknown> }).entity ?? {}
    const tp = (entity.type_params ?? {}) as Record<string, unknown>
    const parts: Array<{ label: string; value: string }> = []
    const named = (v: unknown) => (v && typeof v === 'object' ? (v as { name?: unknown }).name : v)
    for (const key of ['measure', 'numerator', 'denominator', 'expr']) {
      const v = named(tp[key])
      if (typeof v === 'string' && v) parts.push({ label: key, value: v })
    }
    if (Array.isArray(tp.metrics)) {
      parts.push({ label: 'metrics', value: tp.metrics.map(named).filter(Boolean).join(', ') })
    }
    if (typeof entity.filter === 'string' && entity.filter) parts.push({ label: 'filter', value: entity.filter })
    const meta = ((entity.meta as { graphit?: Record<string, unknown> } | undefined)?.graphit ?? {}) as Record<string, unknown>
    return {
      status: 'ok',
      type: typeof entity.type === 'string' ? entity.type : undefined,
      description: typeof entity.description === 'string' ? entity.description : undefined,
      group: typeof entity.group === 'string' ? entity.group : undefined,
      lifecycle: typeof meta.lifecycle === 'string' ? meta.lifecycle : undefined,
      domains: Array.isArray(entity.domain_keys) ? entity.domain_keys.map(String) : undefined,
      parts,
    }
  } catch {
    const err = (() => {
      try {
        return String((JSON.parse(stdout) as { error?: unknown }).error ?? '')
      } catch {
        return ''
      }
    })()
    return { status: 'error', error: err || 'Could not read the definition.' }
  }
}

// The query's own SQL from `graphit query "<sql>"` in the Bash command, for a
// CLI too old to echo `sql` in its JSON.
export function sqlFromCommand(command: string): string | undefined {
  const dq = /\bquery\s+"((?:[^"\\]|\\.)*)"/.exec(command)
  if (dq) return dq[1].replace(/\\(["\\$`])/g, '$1')
  const sq = /\bquery\s+'([^']*)'/.exec(command)
  return sq ? sq[1] : undefined
}

export function commandOf(input: unknown): string | null {
  const command = (input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? cell(command) : null
}

export const KIND_LABEL: Record<string, string> = {
  dim: 'Dimension',
  metric: 'Metric',
  metric_raw: 'Measure',
  simple: 'Simple metric',
  ratio: 'Ratio metric',
  derived: 'Derived metric',
  cumulative: 'Cumulative metric',
  conversion: 'Conversion metric',
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// Feature #1062: Issue #1025's rule, the same one scripts/show-query-result.mjs
// applies - a graphit query whose stdout reaches this Bash call's output. A
// piped or redirected query, or another command's JSON, is left to the engine.
// The two copies must agree; gate.test.tsx and show-query-result.test.mjs pin
// the same cases.
const QUERY_INVOCATION = /(?:graphit|index\.js)\s+query\b/

// Feature #1062 (Gate 2): blank out quoted strings and `#` comments, keeping
// every position, so an operator inside the SQL (`x <> 'y'`, `n > 2`) is not read
// as a redirect, and `graphit query` inside another command's quotes or a
// comment is not read as a query.
function maskQuotesAndComments(command: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        out += '  '
        i += 1
      } else if (ch === quote) {
        quote = null
        out += ch
      } else {
        out += ' '
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      out += ch
    } else if (ch === '#' && (i === 0 || /\s/.test(command[i - 1]))) {
      while (i < command.length && command[i] !== '\n') {
        out += ' '
        i += 1
      }
      if (i < command.length) out += '\n'
    } else {
      out += ch
    }
  }
  return out
}

export function isGraphitQuery(command: string): boolean {
  return QUERY_INVOCATION.test(maskQuotesAndComments(command))
}

export function queryReachesStdout(command: string): boolean {
  const masked = maskQuotesAndComments(command)
  for (const match of masked.matchAll(new RegExp(QUERY_INVOCATION.source, 'g'))) {
    const tail = masked.slice(match.index).split(/\n|;|&&|\|\||(?<![|&>])&(?![&>])/)[0]
    const withoutStderr = tail.replace(/2>&\d|2>>?\s*\S+/g, '')
    if (!/(?<!\|)\|(?!\|)|>/.test(withoutStderr)) return true
  }
  return false
}
