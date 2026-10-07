// Feature #1067: the query card drawn as one SVG on the desktop - a
// frosted panel (gradient, hairline, soft shadow), the chalk G, system type and
// a real table. Pure: no `$`; every value from the query is XML-escaped here.

import type { Token } from './sql'
import { SERIES_COLORS } from './viz'
import type { ChartSpec } from './viz'
import { overviewLayers } from './upstream'
import type { Layers } from './upstream'

export type SvgPanel =
  | { kind: 'table'; columns: string[]; rows: string[][]; hidden: Set<string>; numeric: boolean[]; note?: string }
  | { kind: 'code'; lines: Array<{ tokens: Token[]; mark?: { glyph: string; color: string; note: string } }>; maxLines?: number }
  | { kind: 'list'; items: Array<{ title: string; titleColor?: string; badge?: { text: string; color: string }; lines: string[] }> }
  | { kind: 'chart'; spec: ChartSpec | null }
  | { kind: 'layers'; spec: Layers; note?: string }

export type SvgCardInput = {
  logoInner: string
  tierLabel: string
  tierColor: string
  meta: string
  panel: SvgPanel
  // Empty bands (px) kept for native controls laid over the card.
  toolbar?: number
  footer?: number
  // The data source, drawn bold after the meta.
  source?: string
  // The footer band's caption (a pager's row range).
  status?: string
}

const W = 720
// Sized so a native control row laid over it (one cell, about 18px, down)
// sits on its center line.
const HEADER_ROW = 66
// The native switcher laid one cell down centers here.
const ROW_MID = 31
// The chalk G's box: the brand mark drawn as is, black body and chalk outline.
const MARK_W = 30
const MARK_H = 34

const PAD = 22
// Feature #1067: one body height for every tab and result size - a header row
// and ten table rows plus a note line - so a card never changes height and the
// transcript never jumps. Every panel fits it; the sidebars hold the rest.
export const BODY_H = 300
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
const MONO = "'SF Mono', ui-monospace, Menlo, monospace"
const INK = '#1D1D1F'
const SUB = '#6E6E73'
const HAIR = 'rgba(0,0,0,0.08)'

const TOKEN_FILL: Record<string, string> = {
  kw: '#9B4DCA',
  fn: '#2F6FDB',
  str: '#C0392B',
  num: '#178F80',
  param: '#C2185B',
  comment: '#8E8E93',
  template: '#2A9D8F',
}

export function xml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// Rough advance widths, enough to place columns: system text and monospace.
const textWidth = (s: string, px: number) => s.length * px * 0.56
const monoWidth = (s: string, px: number) => s.length * px * 0.61

// Each column's drawn width: its header or its widest cell, capped.
export function columnWidths(columns: string[], rows: string[][], hidden: Set<string>): number[] {
  return columns.map((c, i) =>
    Math.min(220, Math.max(c.length * 11.5 * 0.7 + (hidden.has(c) ? 16 : 0) + 24, ...rows.map(r => textWidth(r[i] ?? '', 13) + 24))),
  )
}

// How many columns from `start` fit the card's width (at least one).
export function fitColumns(widths: number[], start: number): number {
  let used = 0
  let n = 0
  for (let i = start; i < widths.length; i += 1) {
    if (n > 0 && used + widths[i] > W - 2 * PAD) break
    used += widths[i]
    n += 1
  }
  return n
}

function tableSvg(p: Extract<SvgPanel, { kind: 'table' }>, top: number): { body: string; height: number } {
  const px = 13
  const rowH = 24
  const widths = columnWidths(p.columns, p.rows, p.hidden)
  const xs: number[] = []
  widths.reduce((x, w, i) => ((xs[i] = x), x + w), PAD)
  let out = ''
  // Header
  p.columns.forEach((c, i) => {
    const hidden = p.hidden.has(c)
    const anchor = p.numeric[i] ? 'end' : 'start'
    const x = p.numeric[i] ? xs[i] + widths[i] - 14 : xs[i]
    out += `<text x="${x}" y="${top + 16}" text-anchor="${anchor}" font-size="11.5" font-weight="600" fill="${SUB}" letter-spacing="0.2">${xml(c.toUpperCase())}${hidden ? ' ⊘' : ''}</text>`
  })
  out += `<line x1="${PAD}" x2="${W - PAD}" y1="${top + 26}" y2="${top + 26}" stroke="${HAIR}"/>`
  p.rows.forEach((r, ri) => {
    const y = top + 30 + ri * rowH
    if (ri % 2 === 1) out += `<rect x="${PAD - 8}" y="${y}" width="${W - 2 * PAD + 16}" height="${rowH}" rx="7" fill="rgba(0,0,0,0.028)"/>`
    p.columns.forEach((c, i) => {
      const hidden = p.hidden.has(c)
      // A masked cell's dots sit centered under its column header.
      const headerW = c.length * 11.5 * 0.7 + 16
      const anchor = hidden ? 'middle' : p.numeric[i] ? 'end' : 'start'
      const x = hidden ? xs[i] + headerW / 2 : p.numeric[i] ? xs[i] + widths[i] - 14 : xs[i]
      out += `<text x="${x}" y="${y + 16.5}" text-anchor="${anchor}" font-size="${px}" fill="${hidden ? '#AEAEB2' : INK}" style="font-variant-numeric: tabular-nums">${xml(hidden ? '•••' : clip(r[i] ?? '', 28))}</text>`
    })
  })
  let height = 30 + p.rows.length * rowH + 6
  if (p.note) {
    out += `<text x="${PAD}" y="${top + height + 14}" font-size="12" fill="${SUB}">${xml(p.note)}</text>`
    height += 24
  }
  return { body: out, height }
}

// Long lines wrap under their own indent (no line number on a continuation);
// past maxLines the card stops and says how many lines the sidebar holds.
function codeSvg(p: Extract<SvgPanel, { kind: 'code' }>, top: number): { body: string; height: number } {
  const px = 12.5
  const lineH = 21
  const gutter = PAD + 26
  const cols = Math.floor((W - PAD - gutter) / monoWidth('x', px))
  type Seg = { text: string; fill: string; bold: boolean }
  const visual: Array<{ num?: number; mark?: { glyph: string; color: string; note: string }; segs: Seg[] }> = []
  p.lines.forEach((line, li) => {
    const indent = line.tokens[0]?.kind === 'ws' ? line.tokens[0].text.length : 0
    let row: Seg[] = []
    let used = 0
    let first = true
    const flush = () => {
      visual.push({ num: first ? li + 1 : undefined, mark: first ? line.mark : undefined, segs: row })
      first = false
      row = [{ text: ' '.repeat(indent + 2), fill: INK, bold: false }]
      used = indent + 2
    }
    for (const t of line.tokens) {
      let text = t.kind === 'template' ? `{{ ${t.templateKind}('${t.templateName}') }}` : t.text
      const fill = TOKEN_FILL[t.kind] ?? INK
      const bold = t.kind === 'kw' || t.kind === 'template'
      while (used + text.length > cols && used > indent + 2) {
        if (text.length <= cols - indent - 2) {
          flush()
          if (t.kind === 'ws') text = ''
        } else {
          const room = cols - used
          row.push({ text: text.slice(0, room), fill, bold })
          text = text.slice(room)
          flush()
        }
      }
      if (text) {
        row.push({ text, fill, bold })
        used += text.length
      }
    }
    visual.push({ num: first ? li + 1 : undefined, mark: first ? line.mark : undefined, segs: row })
  })
  const max = p.maxLines ?? visual.length
  const shown = visual.slice(0, max)
  const hiddenLines = p.lines.length - (shown.filter(v => v.num).length)
  let out = `<rect x="${PAD - 8}" y="${top}" width="${W - 2 * PAD + 16}" height="${shown.length * lineH + 16}" rx="10" fill="rgba(118,118,128,0.08)"/>`
  shown.forEach((v, i) => {
    const y = top + 8 + (i + 1) * lineH - 6
    if (v.num) out += `<text x="${PAD}" y="${y}" font-family="${MONO}" font-size="11" fill="#AEAEB2">${v.num}</text>`
    if (v.mark) out += `<text x="${PAD + 14}" y="${y}" font-family="${MONO}" font-size="${px}" font-weight="700" fill="${v.mark.color}">${xml(v.mark.glyph)}</text>`
    const spans = v.segs.map(sg => `<tspan fill="${sg.fill}"${sg.bold ? ' font-weight="600"' : ''}>${xml(sg.text)}</tspan>`).join('')
    out += `<text x="${gutter}" y="${y}" font-family="${MONO}" font-size="${px}" xml:space="preserve">${spans}</text>`
    if (v.mark?.note) {
      const usedChars = v.segs.reduce((n, sg) => n + sg.text.length, 0)
      const nx = gutter + monoWidth('x'.repeat(usedChars), px) + 14
      if (nx < W - PAD - 60) out += `<text x="${nx}" y="${y}" font-size="11.5" fill="${v.mark.color}">${xml(clip(`← ${v.mark.note}`, Math.floor((W - PAD - nx) / 6.5)))}</text>`
    }
  })
  let height = shown.length * lineH + 16
  if (hiddenLines > 0) {
    out += `<text x="${PAD}" y="${top + height + 18}" font-size="12" fill="${SUB}">${xml(`${hiddenLines} more line${hiddenLines === 1 ? '' : 's'} - open the full SQL in the sidebar`)}</text>`
    height += 28
  }
  return { body: out, height }
}

function listSvg(p: Extract<SvgPanel, { kind: 'list' }>, top: number): { body: string; height: number } {
  let out = ''
  let y = top
  for (const [index, item] of p.items.entries()) {
    const need = 36 + item.lines.length * 20
    if (y + need > top + BODY_H - 24 && index > 0) {
      const rest = p.items.length - index
      out += `<text x="${PAD}" y="${y + 16}" font-size="12" fill="${SUB}">${xml(`+${rest} more`)}</text>`
      break
    }
    let x = PAD
    if (item.badge) {
      const bw = textWidth(item.badge.text, 10.5) + 16
      out += `<rect x="${x}" y="${y + 3}" width="${bw}" height="18" rx="9" fill="${item.badge.color}" fill-opacity="0.14"/>`
      out += `<text x="${x + bw / 2}" y="${y + 16}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${item.badge.color}" letter-spacing="0.4">${xml(item.badge.text)}</text>`
      x += bw + 10
    }
    out += `<text x="${x}" y="${y + 17}" font-size="14" font-weight="600" fill="${item.titleColor ?? INK}">${xml(item.title)}</text>`
    y += 26
    for (const line of item.lines) {
      out += `<text x="${PAD + 2}" y="${y + 13}" font-size="12.5" fill="${SUB}">${xml(clip(line, 96))}</text>`
      y += 20
    }
    y += 10
  }
  return { body: out, height: y - top }
}

// 515867.35 -> 515.9K; axis and bar labels only, the table keeps full values.
function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function niceStep(max: number, ticks: number): number {
  const raw = max / ticks
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag
}

function chartSvg(p: Extract<SvgPanel, { kind: 'chart' }>, top: number): { body: string; height: number } {
  const spec = p.spec
  if (!spec) {
    return { body: `<text x="${PAD}" y="${top + 20}" font-size="13" fill="${SUB}">Nothing to graph: the result needs a category or date column and a number column.</text>`, height: 32 }
  }
  let out = ''
  // Title and legend.
  out += `<text x="${PAD}" y="${top + 16}" font-size="13" font-weight="600" fill="${INK}">${xml(clip(`${spec.measure} by ${spec.x}`, 60))}</text>`
  let lx = W - PAD
  for (let i = spec.series.length - 1; i >= 0 && spec.series.length > 1; i--) {
    const name = clip(spec.series[i].name, 16)
    const w = textWidth(name, 12) + 22
    lx -= w
    out += `<circle cx="${lx + 5}" cy="${top + 12}" r="4.5" fill="${SERIES_COLORS[i]}"/>`
    out += `<text x="${lx + 14}" y="${top + 16}" font-size="12" fill="${SUB}">${xml(name)}</text>`
  }
  const plotTop = top + 36
  const plotH = BODY_H - 36 - 50
  const left = PAD + 52
  const right = W - PAD
  const plotW = right - left
  const values = spec.series.flatMap(s => s.values.filter((v): v is number => v !== null))
  const maxV = Math.max(0, ...values)
  const minV = Math.min(0, ...values)
  const step = niceStep(Math.max(maxV - minV, 1), 4)
  const yMax = Math.ceil(maxV / step) * step || step
  const yMin = Math.floor(minV / step) * step
  const y = (v: number) => plotTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    out += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? 'rgba(0,0,0,0.18)' : HAIR}"${v === 0 ? '' : ' stroke-dasharray="3 4"'}/>`
    out += `<text x="${left - 10}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${SUB}" style="font-variant-numeric: tabular-nums">${compact(v)}</text>`
  }
  const n = spec.categories.length
  const band = plotW / n
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(plotW / 70)))
  spec.categories.forEach((c, i) => {
    if (i % labelEvery !== 0) return
    out += `<text x="${left + band * (i + 0.5)}" y="${plotTop + plotH + 18}" text-anchor="middle" font-size="11.5" fill="${SUB}">${xml(clip(c, 14))}</text>`
  })
  if (spec.type === 'bar') {
    const k = spec.series.length
    const groupW = Math.min(band * 0.72, 46 * k + 6 * (k - 1))
    const barW = (groupW - 6 * (k - 1)) / k
    spec.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        if (v === null) return
        const x = left + band * (i + 0.5) - groupW / 2 + si * (barW + 6)
        const y0 = y(Math.max(v, 0))
        const barH = Math.max(1, Math.abs(y(v) - y(0)))
        out += `<rect x="${x}" y="${y0}" width="${barW}" height="${barH}" rx="${Math.min(6, barW / 3)}" fill="url(#bar${si})"/>`
        if (k <= 3 && n <= 12) {
          out += `<text x="${x + barW / 2}" y="${y0 - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${INK}" style="font-variant-numeric: tabular-nums">${compact(v)}</text>`
        }
      })
    })
  } else {
    spec.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v === null ? null : [left + band * (i + 0.5), y(v)] as const)).filter(Boolean) as Array<readonly [number, number]>
      if (pts.length === 0) return
      const path = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
      if (spec.series.length === 1) {
        out += `<path d="${path} L${pts[pts.length - 1][0].toFixed(1)},${y(Math.max(yMin, 0))} L${pts[0][0].toFixed(1)},${y(Math.max(yMin, 0))} Z" fill="url(#area0)"/>`
      }
      out += `<path d="${path}" fill="none" stroke="${SERIES_COLORS[si]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      // Markers only while they read as points; a dense line stays a line.
      if (pts.length <= 40) for (const [px, py] of pts) out += `<circle cx="${px}" cy="${py}" r="3.5" fill="#fff" stroke="${SERIES_COLORS[si]}" stroke-width="2"/>`
    })
  }
  const defs = SERIES_COLORS.map(
    (c, i) =>
      `<linearGradient id="bar${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0.72"/></linearGradient>`,
  ).join('') + `<linearGradient id="area0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SERIES_COLORS[0]}" stop-opacity="0.28"/><stop offset="1" stop-color="${SERIES_COLORS[0]}" stop-opacity="0"/></linearGradient>`
  if (spec.note) {
    out += `<text x="${right}" y="${plotTop + plotH + 40}" text-anchor="end" font-size="11.5" fill="${SUB}">${xml(spec.note)}</text>`
  }
  return { body: `<defs>${defs}</defs>${out}`, height: 36 + plotH + (spec.note ? 50 : 30) }
}


// Advance width by character class: capitals, digits and `_` run wide in a
// system face, lowercase narrow. Close enough to fit names without clipping.
export function measure(s: string, px: number, bold = false): number {
  let w = 0
  for (const ch of s) w += /[A-Z0-9_%@#&MW]/.test(ch) ? 0.68 : /[ .,:;'|!il()[\]]/.test(ch) ? 0.3 : 0.55
  return w * px * (bold ? 1.05 : 1)
}

// Fit a name into a width; when it does not fit, keep its head and its tail
// (`digest_act…_count`) - two names sharing a prefix still read apart.
export function fitText(s: string, px: number, maxW: number, bold = false): string {
  if (measure(s, px, bold) <= maxW) return s
  let head = s.length
  let tail = 0
  while (head > 1) {
    head -= 1
    tail = Math.min(Math.ceil(head * 0.6), s.length - head)
    const cut = `${s.slice(0, head)}…${s.slice(s.length - tail)}`
    if (measure(cut, px, bold) <= maxW) return cut
  }
  return `${s.slice(0, 1)}…`
}

// Feature #1067: lineage as a left-to-right flow inside the card's fixed body -
// one column per layer, the tables first and the result last, each column's
// nodes stacked and centered, each column as wide as its names need. An
// overview: Explore lineage holds every name and fact.
// Column heads short enough for eight columns across the card.
const SHORT_LABEL: Record<string, string> = { 'DATA SOURCE': 'SOURCE', 'SEMANTIC MODEL': 'MODEL', 'KB ASSETS': 'KB', GOVERNANCE: 'RULES' }
const TITLE_PX = 10.5
const SUB_PX = 9.5
const nodeHeight = (layer: { nodes: Array<{ subtitle?: string }> }) => (layer.nodes.some(n => n.subtitle) ? 40 : 28)

// A layer past what its column holds keeps its first nodes and folds the rest
// into one "+N more" node; edges to a folded node land on it. The sidebar shows all.
function capLayers(spec: Layers, room: (layer: Layers['layers'][number]) => number): Layers {
  const folded = new Map<string, string>()
  const layers = spec.layers.map(layer => {
    const max = room(layer)
    if (layer.nodes.length <= max) return layer
    const keep = layer.nodes.slice(0, max - 1)
    const rest = layer.nodes.slice(max - 1)
    const moreId = `more:${layer.label}`
    for (const n of rest) folded.set(n.id, moreId)
    return { ...layer, nodes: [...keep, { id: moreId, title: `+${rest.length} more`, subtitle: 'Explore lineage', color: '#8E8E93' }] }
  })
  const seen = new Set<string>()
  const edges = spec.edges
    .map(e => ({ ...e, from: folded.get(e.from) ?? e.from, to: folded.get(e.to) ?? e.to }))
    .filter(e => {
      const k = `${e.from}>${e.to}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  return { layers, edges }
}

function layersSvg(panel: Extract<SvgPanel, { kind: 'layers' }>, top: number): { body: string; height: number } {
  const labelH = 26
  const gapY = 10
  const areaTop = top + labelH
  const areaH = BODY_H - labelH - 4
  const spec = capLayers(overviewLayers(panel.spec), layer => Math.max(2, Math.floor((areaH + gapY) / (nodeHeight(layer) + gapY))))
  const cols = Math.max(1, spec.layers.length)
  const label = (l: string) => SHORT_LABEL[l] ?? l
  // "SNOWFLAKE TABLES" when it fits its column, else "TABLES".
  const head = (l: string, w: number) => (measure(label(l), 9, true) + 4 <= w || !l.endsWith(' TABLES') ? fitText(label(l), 9, w, true) : 'TABLES')
  // Each column as wide as its longest name (and its head) needs, within bounds;
  // squeezed evenly when the chain is longer than the card.
  const want = spec.layers.map(layer =>
    Math.min(
      190,
      Math.max(
        76,
        measure(label(layer.label), 9, true) + 4,
        // The name sets the width; a subtitle may widen it a little, never much.
        ...layer.nodes.map(n => {
          const title = measure(n.title, TITLE_PX, true)
          return Math.max(title, Math.min(measure(n.subtitle ?? '', SUB_PX), title + 24)) + 22
        }),
      ),
    ),
  )
  const margin = 16
  const room = W - 2 * margin
  const minGap = 16
  // Too long for the card: trim the widest columns first, down to a common
  // ceiling, so short names never pay for a long one.
  const budget = room - minGap * (cols - 1)
  let ceiling = Math.max(...want)
  while (want.reduce((a, w) => a + Math.min(w, ceiling), 0) > budget && ceiling > 40) ceiling -= 1
  const widths = want.map(w => Math.min(w, ceiling))
  const gap = cols > 1 ? Math.min(64, (room - widths.reduce((a, b) => a + b, 0)) / (cols - 1)) : 0
  const used = widths.reduce((a, b) => a + b, 0) + gap * (cols - 1)
  let x = margin + (room - used) / 2
  const pos = new Map<string, { x: number; y: number; w: number; h: number; col: number }>()
  // Each column's extent: left, right, its first node's top, its last node's bottom.
  const extents: Array<{ left: number; right: number; top: number; bottom: number }> = []
  let heads = ''
  spec.layers.forEach((layer, li) => {
    const w = widths[li]
    const h = nodeHeight(layer)
    const n = layer.nodes.length
    const total = n * h + (n - 1) * gapY
    const y0 = areaTop + Math.max(0, (areaH - total) / 2)
    heads += `<text x="${x.toFixed(1)}" y="${top + 13}" font-size="9" font-weight="700" fill="${SUB}" letter-spacing="0.6">${xml(head(layer.label, w))}</text>`
    layer.nodes.forEach((node, i) => pos.set(node.id, { x, y: y0 + i * (h + gapY), w, h, col: li }))
    extents.push({ left: x, right: x + w, top: y0, bottom: y0 + total })
    x += w + gap
  })
  let out = heads
  for (const e of spec.edges) {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (!a || !b) continue
    const x1 = a.x + a.w
    const y1 = a.y + a.h / 2
    const x2 = b.x
    const y2 = b.y + b.h / 2
    const mx = (x1 + x2) / 2
    let d = `M${x1.toFixed(1)},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${(x2 - 3).toFixed(1)},${y2.toFixed(1)}`
    // An edge that skips columns runs above or below them (the side nearer
    // its ends), never behind the nodes it passes.
    const between = extents.slice(a.col + 1, b.col)
    if (between.length) {
      const above = Math.min(...between.map(c => c.top)) - 7
      const below = Math.max(...between.map(c => c.bottom)) + 7
      const g = Math.abs((y1 + y2) / 2 - above) <= Math.abs((y1 + y2) / 2 - below) ? Math.max(areaTop - 4, above) : Math.min(top + BODY_H - 4, below)
      const xa = between[0].left - 4
      const xb = between[between.length - 1].right + 4
      d =
        `M${x1.toFixed(1)},${y1.toFixed(1)} C${((x1 + xa) / 2).toFixed(1)},${y1.toFixed(1)} ${((x1 + xa) / 2).toFixed(1)},${g.toFixed(1)} ${xa.toFixed(1)},${g.toFixed(1)}` +
        ` L${xb.toFixed(1)},${g.toFixed(1)} C${((xb + x2) / 2).toFixed(1)},${g.toFixed(1)} ${((xb + x2) / 2).toFixed(1)},${y2.toFixed(1)} ${(x2 - 3).toFixed(1)},${y2.toFixed(1)}`
    }
    out += `<path d="${d}" fill="none" stroke="${e.color}" stroke-opacity="0.38" stroke-width="1.2"${e.dashed ? ' stroke-dasharray="4 4"' : ''}/>`
    out += `<circle cx="${(x2 - 2).toFixed(1)}" cy="${y2.toFixed(1)}" r="2" fill="${e.color}" fill-opacity="0.8"/>`
  }
  for (const layer of spec.layers) {
    for (const n of layer.nodes) {
      const at = pos.get(n.id)
      if (!at) continue
      const textW = at.w - 18
      // The full name on hover: the desktop draws the lineage tab interactive.
      out += `<g><title>${xml([n.title, n.subtitle].filter(Boolean).join(' - '))}</title>`
      out += `<rect x="${at.x.toFixed(1)}" y="${at.y.toFixed(1)}" width="${at.w.toFixed(1)}" height="${at.h}" rx="9" fill="#FFFFFF" stroke="${n.color}" stroke-opacity="0.32"/>`
      out += `<rect x="${(at.x + 0.5).toFixed(1)}" y="${(at.y + 8).toFixed(1)}" width="3" height="${at.h - 16}" rx="1.5" fill="${n.color}"/>`
      const titleY = n.subtitle ? at.y + 17 : at.y + at.h / 2 + 4
      out += `<text x="${(at.x + 11).toFixed(1)}" y="${titleY.toFixed(1)}" font-size="${TITLE_PX}" font-weight="600" fill="${n.muted ? '#AEAEB2' : INK}"${n.muted ? ' text-decoration="line-through"' : ''}>${xml(fitText(n.title, TITLE_PX, textW, true))}</text>`
      if (n.subtitle) out += `<text x="${(at.x + 11).toFixed(1)}" y="${(at.y + 31).toFixed(1)}" font-size="${SUB_PX}" fill="${SUB}">${xml(fitText(n.subtitle, SUB_PX, textW))}</text>`
      out += '</g>'
    }
  }
  return { body: out, height: BODY_H }
}

export function renderCardSvg(input: SvgCardInput): { svg: string; width: number; height: number } {
  // Feature #1067: a window-style card. The toolbar band carries the
  // chalk G and the tier pill (native tabs are laid between them); the footer
  // band is a status bar, its text drawn here and its controls laid over it.
  const T = input.toolbar ?? 0
  const F = input.footer ?? 0
  // Header row (chalk G, tier, meta) on top, then the tab band, then the panel.
  const HR = HEADER_ROW
  const top = HR + T + 10
  const panel =
    input.panel.kind === 'table'
      ? tableSvg(input.panel, top)
      : input.panel.kind === 'code'
        ? codeSvg(input.panel, top)
        : input.panel.kind === 'chart'
          ? chartSvg(input.panel, top)
          : input.panel.kind === 'layers'
              ? layersSvg(input.panel, top)
              : listSvg(input.panel, top)
  const H = top + BODY_H + 14 + F
  const pillW = textWidth(input.tierLabel, 12) + 30
  const pillX = PAD + MARK_W + 10
  const rowMid = ROW_MID
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 24}" viewBox="0 0 ${W} ${H + 24}" font-family="${xml(FONT)}">
<defs>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.92"/>
    <stop offset="1" stop-color="#F7F6F2" stop-opacity="0.86"/>
  </linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4DB6AC" stop-opacity="0.10"/>
    <stop offset="0.45" stop-color="#4DB6AC" stop-opacity="0"/>
  </linearGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#222224" flood-opacity="0.10"/>
    <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#222224" flood-opacity="0.08"/>
  </filter>
  <clipPath id="cardclip"><rect x="1" y="1" width="${W - 2}" height="${H}" rx="18"/></clipPath>
  <clipPath id="bodyclip"><rect x="0" y="${top - 4}" width="${W}" height="${BODY_H + 8}"/></clipPath>
</defs>
<g filter="url(#shadow)">
  <rect x="1" y="1" width="${W - 2}" height="${H}" rx="18" fill="url(#glass)"/>
</g>
<rect x="1" y="1" width="${W - 2}" height="${H}" rx="18" fill="url(#sheen)"/>
<g clip-path="url(#cardclip)">
${T ? `<rect x="0" y="${HR}" width="${W}" height="${T}" fill="rgba(118,118,128,0.07)"/><line x1="0" x2="${W}" y1="${HR}" y2="${HR}" stroke="rgba(0,0,0,0.07)"/><line x1="0" x2="${W}" y1="${HR + T}" y2="${HR + T}" stroke="rgba(0,0,0,0.07)"/>` : ''}
${F ? `<rect x="0" y="${H - F}" width="${W}" height="${F + 2}" fill="rgba(118,118,128,0.07)"/><line x1="0" x2="${W}" y1="${H - F}" y2="${H - F}" stroke="rgba(0,0,0,0.07)"/>` : ''}
</g>
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 1}" rx="17.5" fill="none" stroke="rgba(255,255,255,0.9)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H + 1}" rx="18.5" fill="none" stroke="${HAIR}"/>
<svg x="${PAD}" y="${rowMid - MARK_H / 2}" width="${MARK_W}" height="${MARK_H}" viewBox="0 0 878 1000">${input.logoInner}</svg>
<rect x="${pillX}" y="${rowMid - 11}" width="${pillW}" height="22" rx="11" fill="${input.tierColor}" fill-opacity="0.14"/>
<circle cx="${pillX + 11}" cy="${rowMid}" r="3.5" fill="${input.tierColor}"/>
<text x="${pillX + 19}" y="${rowMid + 4}" font-size="12" font-weight="600" fill="${input.tierColor}">${xml(input.tierLabel)}</text>
<text x="${W - PAD}" y="${rowMid + 4}" text-anchor="end" font-size="12" fill="${SUB}" style="font-variant-numeric: tabular-nums">${xml(input.meta)}${input.source ? `<tspan> · </tspan><tspan font-weight="700" fill="${INK}">${xml(input.source)}</tspan>` : ''}</text>
${F && input.status ? `<text x="${PAD}" y="${H - F / 2 + 4}" font-size="12" fill="${SUB}" style="font-variant-numeric: tabular-nums">${xml(input.status)}</text>` : ''}
<g clip-path="url(#bodyclip)">${panel.body}</g>
</svg>`
  return { svg, width: W, height: H + 24 }
}


// Feature #1067: the lineage inspector's header - a frosted card
// tinted with the node's color, a rounded icon tile, the title and its kind.
// Feature #1092: the tables layer is named for its warehouse ("SNOWFLAKE TABLES").
const HERO_GLYPH: Record<string, string> = {
  FILE: 'F',
  'DATA SOURCE': 'DS',
  'SEMANTIC MODEL': 'SM',
  COLUMNS: 'C',
  MEASURES: 'Σ',
  'KB ASSETS': 'KB',
  GOVERNANCE: 'R',
  RESULT: '⇥',
  LINEAGE: 'L',
}

export function renderHeroSvg(input: { kind: string; title: string; subtitle?: string; color: string }): { svg: string; width: number; height: number } {
  const w = 360
  const heroH = 96
  const glyph = HERO_GLYPH[input.kind] ?? (input.kind.endsWith(' TABLES') ? 'TB' : input.kind.slice(0, 2))
  const kindLabel = input.kind.charAt(0) + input.kind.slice(1).toLowerCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${heroH}" viewBox="0 0 ${w} ${heroH}" font-family="${xml(FONT)}">
<defs>
  <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${input.color}" stop-opacity="0.16"/>
    <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.9"/>
    <stop offset="1" stop-color="#F7F6F2" stop-opacity="0.95"/>
  </linearGradient>
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${input.color}" stop-opacity="0.95"/>
    <stop offset="1" stop-color="${input.color}" stop-opacity="0.75"/>
  </linearGradient>
</defs>
<rect x="0.5" y="0.5" width="${w - 1}" height="${heroH - 1}" rx="16" fill="url(#hg)" stroke="rgba(0,0,0,0.08)"/>
<rect x="1.5" y="1.5" width="${w - 3}" height="${heroH - 3}" rx="15" fill="none" stroke="rgba(255,255,255,0.85)"/>
<rect x="18" y="22" width="52" height="52" rx="13" fill="url(#tile)"/>
<rect x="18.5" y="22.5" width="51" height="51" rx="12.5" fill="none" stroke="rgba(255,255,255,0.35)"/>
<text x="44" y="${glyph.length > 1 ? 54 : 56}" text-anchor="middle" font-size="${glyph.length > 1 ? 17 : 22}" font-weight="700" fill="#FFFFFF" letter-spacing="0.3">${xml(glyph)}</text>
<text x="86" y="34" font-size="10.5" font-weight="700" fill="${input.color}" letter-spacing="0.8">${xml(kindLabel.toUpperCase())}</text>
<text x="86" y="56" font-size="17" font-weight="700" fill="${INK}" letter-spacing="-0.2">${xml(fitText(input.title, 17, w - 100, true))}</text>
${input.subtitle ? `<text x="86" y="75" font-size="12" fill="${SUB}">${xml(fitText(input.subtitle, 12, w - 100))}</text>` : ''}
</svg>`
  return { svg, width: w, height: heroH }
}
