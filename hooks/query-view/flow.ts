// The lineage explorer's diagram: the chain top to bottom, tables first and
// the result last, each layer's nodes ordered under the nodes they come from.
//
// A node is a native bordered Box with its name as a Button, laid out in flow
// (a drawing takes no clicks; a drawing laid against Buttons never lines up on
// this surface, so lines stitched across rows broke). Only the links between
// one layer and the next are drawn, each as its own connector strip that
// spans no row; a link that skips layers reads on its node as "from X". Pure.

import { fitText, measure, xml } from './svgcard'
import type { Layers } from './upstream'

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
const SUB = '#6E6E73'
// A character cell's width on the desktop sidebar.
export const CELL_W = 8
const BUTTON_PX = 13
const SUB_PX = 11
const MARGIN = 1
// The connector between two layers: its height and the layer name it carries.
const LINK_H = 40

export type FlowNode = { id: string; cols: number; label: string; subtitle?: string; color: string; muted?: boolean; focus: boolean }
// A row of nodes: `lead` empty cells, then each node after `gap` cells.
export type FlowRow = { key: string; first: boolean; lead: number; nodes: Array<FlowNode & { gap: number }> }
export type FlowStrip = { kind: 'link'; key: string; svg: string; height: number } | ({ kind: 'row' } & FlowRow)

type Placed = { id: string; col: number; cols: number; layer: number; row: number }

const f = (n: number) => n.toFixed(1)

export function renderFlowSvg(spec: Layers, opts: { width?: number; focus?: string } = {}): { width: number; strips: FlowStrip[] } {
  const cols = Math.floor((opts.width ?? 400) / CELL_W)
  const width = cols * CELL_W
  const inner = cols - 2 * MARGIN
  const pos = new Map<string, Placed>()
  const layerOf = new Map(spec.layers.flatMap((l, li) => l.nodes.map(n => [n.id, li] as const)))
  const titleOf = new Map(spec.layers.flatMap(l => l.nodes.map(n => [n.id, n.title] as const)))
  const strips: FlowStrip[] = []
  // How many rows each layer wrapped into, and the columns it spans.
  const extent = new Map<number, { rows: number; lo: number; hi: number }>()

  spec.layers.forEach((layer, li) => {
    // Under the nodes they come from: order by the parents' mean center.
    const center = (id: string) => {
      const ps = spec.edges.filter(e => e.to === id).map(e => pos.get(e.from)).filter((p): p is Placed => !!p)
      return ps.length ? ps.reduce((s, p) => s + p.col + p.cols / 2, 0) / ps.length : cols / 2
    }
    const sized = layer.nodes
      .map((n, i) => ({ n, i, c: center(n.id) }))
      .sort((a, b) => a.c - b.c || a.i - b.i)
      .map(({ n }): { n: typeof n; label: string; subtitle?: string; cols: number } => {
        // A link from further up than the layer above reads on the node.
        const far = spec.edges.filter(e => e.to === n.id && (layerOf.get(e.from) ?? li) < li - 1).map(e => titleOf.get(e.from) ?? '')
        const subtitle = [n.subtitle, far.length ? `from ${far.join(', ')}` : undefined].filter(Boolean).join(' · ') || undefined
        const label = fitText(n.title, BUTTON_PX, (inner - 4) * CELL_W)
        const need = Math.max(measure(label, BUTTON_PX), subtitle ? Math.min(measure(subtitle, SUB_PX), 220) : 0)
        return { n, label, subtitle, cols: Math.min(inner, Math.max(10, 5 + Math.ceil(need / CELL_W))) }
      })
    // Pack into rows of nodes, each centered, two cells apart.
    const rows: Array<typeof sized> = [[]]
    let used = 0
    for (const s of sized) {
      if (rows[rows.length - 1].length && used + 2 + s.cols > inner) {
        rows.push([])
        used = 0
      }
      used += (rows[rows.length - 1].length ? 2 : 0) + s.cols
      rows[rows.length - 1].push(s)
    }
    const placedRows = rows.map((row, ri) => {
      const rowCols = row.reduce((a, s) => a + s.cols, 0) + 2 * (row.length - 1)
      let col = MARGIN + Math.floor((inner - rowCols) / 2)
      return row.map(s => {
        const p: Placed = { id: s.n.id, col, cols: s.cols, layer: li, row: ri }
        pos.set(s.n.id, p)
        col += s.cols + 2
        return { s, p }
      })
    })

    const all = placedRows.flat().map(x => x.p)
    extent.set(li, { rows: placedRows.length, lo: Math.min(...all.map(p => p.col)), hi: Math.max(...all.map(p => p.col + p.cols)) })

    // The connector into this layer: the links from the layer above, and its
    // name. A line spans no row of nodes, so it reaches only this layer's first
    // row: a node on a later row reads its sources as "from X" instead. A
    // source layer that wrapped feeds down from one bracket under it, not from
    // a column that a later row of it covers.
    const links = spec.edges
      .map(e => ({ e, a: pos.get(e.from), b: pos.get(e.to) }))
      .filter((x): x is { e: typeof x.e; a: Placed; b: Placed } => !!x.a && !!x.b && x.a.layer === li - 1 && x.b.layer === li)
    for (const { s, p } of placedRows.slice(1).flat()) {
      const from = links.filter(x => x.b.id === p.id).map(x => titleOf.get(x.a.id) ?? '')
      if (from.length) s.subtitle = [s.subtitle, `from ${from.join(', ')}`].filter(Boolean).join(' · ')
    }
    const above = extent.get(li - 1)
    const bracket = !!above && above.rows > 1
    let body = bracket && links.some(x => x.b.row === 0)
      ? `<path d="M${f(above!.lo * CELL_W + 6)},1.5 L${f(above!.hi * CELL_W - 6)},1.5" stroke="${SUB}" stroke-opacity="0.35" stroke-width="1.3" stroke-linecap="round"/>`
      : ''
    for (const { e, a, b } of links.filter(x => x.b.row === 0)) {
      const x1 = bracket ? ((above!.lo + above!.hi) / 2) * CELL_W : (a.col + a.cols / 2) * CELL_W
      const x2 = (b.col + b.cols / 2) * CELL_W
      const lit = opts.focus && (e.from === opts.focus || e.to === opts.focus)
      body += `<path d="M${f(x1)},0 C${f(x1)},${LINK_H / 2} ${f(x2)},${LINK_H / 2} ${f(x2)},${LINK_H - 4}" fill="none" stroke="${e.color}" stroke-opacity="${lit ? 0.85 : 0.45}" stroke-width="${lit ? 1.8 : 1.3}"${e.dashed ? ' stroke-dasharray="4 4"' : ''}/>`
      body += `<circle cx="${f(x2)}" cy="${LINK_H - 3}" r="2.2" fill="${e.color}"/>`
    }
    const name = `<text x="${MARGIN * CELL_W + 2}" y="${LINK_H - 10}" font-size="9.5" font-weight="700" fill="${SUB}" letter-spacing="0.6" stroke="#FFFFFF" stroke-width="4" paint-order="stroke">${xml(layer.label)}${layer.nodes.length > 1 ? `<tspan fill="#AEAEB2" font-weight="600">  ${layer.nodes.length}</tspan>` : ''}</text>`
    strips.push({
      kind: 'link',
      key: `k${li}`,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LINK_H}" viewBox="0 0 ${width} ${LINK_H}" font-family="${xml(FONT)}">${body}${name}</svg>`,
      height: LINK_H,
    })
    placedRows.forEach((row, ri) => {
      strips.push({
        kind: 'row',
        key: `r${li}-${ri}`,
        first: ri === 0,
        lead: row[0].p.col,
        nodes: row.map(({ s, p }, i) => ({
          id: p.id,
          cols: p.cols,
          gap: i === 0 ? 0 : 2,
          label: s.label,
          subtitle: s.subtitle,
          color: s.n.color,
          muted: s.n.muted,
          focus: p.id === opts.focus,
        })),
      })
    })
  })
  return { width, strips }
}
