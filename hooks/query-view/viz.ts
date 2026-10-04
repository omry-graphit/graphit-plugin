// Feature #1067: the graph the Graph tab draws, decided from the result alone.
// Pure: no `$`, no rendering.

export type ChartSpec = {
  type: 'bar' | 'line'
  x: string
  measure: string
  categories: string[]
  series: Array<{ name: string; values: Array<number | null> }>
  // Set when the graph draws fewer x values than the result holds.
  note?: string
}

// Series colors: Energy Teal first, then calm blues and violets; never yellow.
export const SERIES_COLORS = ['#4DB6AC', '#5B8DEF', '#9B6DD6', '#E07A8B', '#2F8F83', '#7FA7C9']

const TIME_NAME = /(^|_)(date|day|week|month|quarter|year|time|ts|period)(_|$)/i
const TIME_VALUE = /^\d{4}-\d{2}(-\d{2})?([ T].*)?$/
const MONTH_START = /^\d{4}-\d{2}-01(T00:00:00(\.0+)?Z?)?$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// A bar chart reads up to this many categories; a line keeps the SVG well
// under the desktop's 131072-char limit at this many points per series.
const MAX_BARS = 24
const MAX_POINTS = 200

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const plain = (v: unknown) => (v === null || v === undefined ? '(null)' : String(v))

// Indices spread evenly over 0..n-1, first and last kept.
function sampleIndices(n: number, k: number): number[] {
  if (n <= k) return [...Array(n).keys()]
  return [...new Set([...Array(k).keys()].map(i => Math.round((i * (n - 1)) / (k - 1))))]
}

// The graph the in-app agent would pick for this shape: time on x draws a line
// (bars while there are too few points for a trend), a category draws bars; a
// second category becomes the series. Masked columns never chart. Points are
// sampled, never summed: summing a ratio such as CPI would invent numbers.
export function chartSpec(columns: string[], rows: Array<Record<string, unknown>>, hidden: Set<string>): ChartSpec | null {
  const visible = columns.filter(c => !hidden.has(c))
  const measures = visible.filter(c => rows.length > 0 && rows.every(r => r[c] === null || isNum(r[c])) && rows.some(r => isNum(r[c])))
  const dims = visible.filter(c => !measures.includes(c))
  if (measures.length === 0 || rows.length === 0) return null
  const isTime = (c: string) => TIME_NAME.test(c) || rows.every(r => typeof r[c] === 'string' && TIME_VALUE.test(r[c] as string))
  const time = dims.find(isTime)
  const x = time ?? dims[0]
  if (!x) return null
  const split = dims.find(c => c !== x)
  // 2026-03-01T00:00:00 -> 2026-03-01; a month-start series -> Mar 2026.
  const monthly = !!time && rows.every(r => MONTH_START.test(String(r[time])))
  const label = (raw: string) => {
    const text = raw.replace(/T00:00:00(\.0+)?Z?$/, '')
    return monthly ? `${MONTHS[Number(text.slice(5, 7)) - 1]} ${text.slice(0, 4)}` : text
  }

  // One pass: each x value's first row per series, in result order.
  const lead = split ? measures[0] : null
  const names: string[] = []
  const xs: string[] = []
  const cell = new Map<string, Map<string, Record<string, unknown>>>()
  for (const r of rows) {
    const k = plain(r[x])
    const name = split ? plain(r[split]) : ''
    let bySeries = cell.get(k)
    if (!bySeries) {
      cell.set(k, (bySeries = new Map()))
      xs.push(k)
    }
    if (!bySeries.has(name)) bySeries.set(name, r)
    if (split && !names.includes(name) && names.length < SERIES_COLORS.length) names.push(name)
  }
  const seriesNames = split ? names : measures.slice(0, SERIES_COLORS.length)
  const valueAt = (k: string, si: number) => {
    const r = split ? cell.get(k)?.get(seriesNames[si]) : cell.get(k)?.get('')
    const v = r?.[split ? (lead as string) : seriesNames[si]]
    return isNum(v) ? (v as number) : null
  }

  let keep: string[]
  let note: string | undefined
  if (time) {
    xs.sort()
    keep = sampleIndices(xs.length, MAX_POINTS).map(i => xs[i])
    if (keep.length < xs.length) note = `${xs.length.toLocaleString('en-US')} points, ${keep.length} shown evenly across the range`
  } else if (xs.length > MAX_BARS) {
    // The categories with the largest values, in result order.
    const total = (k: string) => seriesNames.reduce((n, _, si) => n + Math.abs(valueAt(k, si) ?? 0), 0)
    const top = new Set([...xs].sort((a, b) => total(b) - total(a)).slice(0, MAX_BARS))
    keep = xs.filter(k => top.has(k))
    note = `Top ${MAX_BARS} of ${xs.length.toLocaleString('en-US')} ${x} values`
  } else {
    keep = xs
  }

  const series = seriesNames.map((name, si) => ({ name, values: keep.map(k => valueAt(k, si)) }))
  if (split && names.length < new Set(rows.map(r => plain(r[split]))).size) {
    note = [note, `first ${names.length} ${split} values`].filter(Boolean).join('; ')
  }
  const type = time && keep.length > 4 ? 'line' : 'bar'
  return { type, x, measure: split ? (lead as string) : measures.slice(0, SERIES_COLORS.length).join(', '), categories: keep.map(label), series, note }
}
