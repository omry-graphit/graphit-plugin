// The query view's pane ids and the cap on its state maps: every map keyed per
// call or per group is capped, so a long session never grows it without bound.
// The atoms themselves live in register.tsx - the state library reads only an
// atom declared in the file that reads it.

export const KB_PANE = 'graphit-kb'
export const LINEAGE_PANE = 'graphit-lineage'
export const SQL_PANE = 'graphit-sql'
export const RESULTS_PANE = 'graphit-results'

// Entries kept per map; the oldest drop past this.
const MAX_ENTRIES = 200

// `{ ...map, [key]: value }`, keeping only the newest MAX_ENTRIES keys.
export function capped<T>(map: Record<string, T>, key: string, value: T): Record<string, T> {
  const { [key]: _old, ...rest } = map
  return Object.fromEntries([...Object.entries(rest), [key, value]].slice(-MAX_ENTRIES))
}
