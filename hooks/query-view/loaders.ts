// Feature #1067: bookkeeping for what the view reads beyond the Bash output - a
// large result Claude Code saved to a file, and the lineage upstream. Pure: the
// reads themselves run in register.tsx (a mod's `$` never crosses an import).
// None of it runs on a query's path: tool.call only remembers a path.

import type { QueryResult } from './result'

// `$.fs.read` refuses a file past this; such a result is reported, not read.
export const READ_LIMIT = 4 * 1024 * 1024
const MAX_SAVED = 200
const MAX_PARSED = 4
export const MAX_PARALLEL_READS = 3

export type Loaded = { result: QueryResult } | { tooLarge: number } | null

// tool_use_id -> the file Claude Code moved a large output to, from the
// engine's own `persistedOutputPath` (never from text a command printed).
// Module memory, set synchronously: no state write sits on the query path.
const saved = new Map<string, { path: string; size: number }>()
// Parsed saved results by path, so redraws never re-read megabytes.
const parsed = new Map<string, QueryResult | null>()

export function rememberSaved(id: string, result: unknown): void {
  const r = result as { persistedOutputPath?: unknown; persistedOutputSize?: unknown } | null
  if (typeof r?.persistedOutputPath !== 'string') return
  saved.set(id, { path: r.persistedOutputPath, size: typeof r.persistedOutputSize === 'number' ? r.persistedOutputSize : 0 })
  if (saved.size > MAX_SAVED) saved.delete(saved.keys().next().value as string)
}

export function savedFor(id: string | undefined): { path: string; size: number } | undefined {
  return id ? saved.get(id) : undefined
}

export function parsedFor(path: string): QueryResult | null | undefined {
  return parsed.get(path)
}

export function rememberParsed(path: string, result: QueryResult | null): void {
  parsed.set(path, result)
  if (parsed.size > MAX_PARSED) parsed.delete(parsed.keys().next().value as string)
}

// Feature #1067: the results a Full results sidebar shows, by row key - kept
// here, not in session state, so ten thousand rows never cross into it. A
// module reload forgets them; the sidebar then asks to open it again.
const opened = new Map<string, QueryResult>()

export function rememberOpened(id: string, result: QueryResult): void {
  opened.delete(id)
  opened.set(id, result)
  if (opened.size > MAX_PARSED) opened.delete(opened.keys().next().value as string)
}

export function openedFor(id: string | undefined): QueryResult | undefined {
  return id ? opened.get(id) : undefined
}

// Every `graphit` read the view makes - each card's lineage and the KB
// sidebar - shares one cap, so open cards never crowd the user's own queries.
let reading = 0
const waiting: Array<() => void> = []

export async function withReadSlot<T>(task: () => Promise<T>): Promise<T> {
  if (reading >= MAX_PARALLEL_READS) await new Promise<void>(resolve => waiting.push(resolve))
  reading += 1
  try {
    return await task()
  } finally {
    reading -= 1
    waiting.shift()?.()
  }
}
