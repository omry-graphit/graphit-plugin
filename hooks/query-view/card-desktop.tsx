// The card on the desktop: one frosted SVG - header row, tab band, the panel,
// a status bar - with native Buttons laid over its bands. An SVG draws as an
// image (no clicks reach the mod), so every control is a Button placed with
// `position: "absolute"`, in character cells (about 8 x 18 px).

import type { CardModel, Ui } from './card'
import { OUTCOME_BADGE, REF_KIND, TIER_COLOR, TIER_LABEL, cell, clean, fmtNumber, marksFor } from './result'
import { TEMPLATE_COLOR } from './spans'
import { formatLines, lineText } from './sql'
import type { TabId } from './state'
import { columnWidths, fitColumns, renderCardSvg } from './svgcard'
import type { SvgPanel } from './svgcard'

// Bands the SVG leaves empty for the native tabs and the footer controls,
// sized so a row laid 4 cells down sits on the tab band's center line.
const TOOLBAR_PX = 46
const FOOTER_PX = 56
// The card shows this many SQL lines; the sidebar shows them all.
const CARD_SQL_LINES = 12

export function drawDesktopCard(ui: Ui, m: CardModel): unknown {
  const { Box, Text, Button, Svg } = ui
  const { active, result, injections, kbRefs, kbCount, hidden, cols, shown, upstream, layers } = m

  // Right-aligned only when the page holds a number; an all-null (masked) column stays left.
  const numeric = cols.map(c => !hidden.has(c) && shown.some(r => typeof r[c] === 'number') && shown.every(r => typeof r[c] === 'number' || r[c] === null))
  // Columns page like rows: the ones that fit the card, then the next set.
  const cellRows = shown.map(r => cols.map(c => (typeof r[c] === 'number' ? fmtNumber(r[c] as number) : cell(r[c]))))
  const widths = columnWidths(cols, cellRows, hidden)
  const colStarts: number[] = []
  for (let at = 0; at < cols.length; at += fitColumns(widths, at)) colStarts.push(at)
  const colPage = Math.min(Math.max(m.colPage, 0), Math.max(colStarts.length - 1, 0))
  const cStart = colStarts[colPage] ?? 0
  const cEnd = cStart + fitColumns(widths, cStart)
  const goCols = (n: number) => m.act.goCols(n, colStarts.length)

  const sqlPanel = (kind: 'base' | 'runtime', text: string | undefined): SvgPanel => ({
    kind: 'code',
    lines: formatLines(clean(text ?? '')).map(line => {
      const marks = marksFor(line, kind, injections, m.expansions)
      const notes = [...new Set(marks.map(mk => mk.note).filter(Boolean))]
      return { tokens: line, mark: marks[0] ? { glyph: marks[0].marker, color: marks[0].color, note: notes.join(', ') } : undefined }
    }),
    maxLines: CARD_SQL_LINES,
  })
  const panels: Record<TabId, () => SvgPanel> = {
    results: () => ({
      kind: 'table',
      columns: cols.slice(cStart, cEnd),
      rows: cellRows.map(r => r.slice(cStart, cEnd)),
      hidden,
      numeric: numeric.slice(cStart, cEnd),
      note: hidden.size > 0 ? `⊘ hidden by policy: ${[...hidden].join(', ')}` : undefined,
    }),
    chart: () => ({ kind: 'chart', spec: m.chart }),
    lineage: () => ({ kind: 'layers', spec: layers }),
    base: () => sqlPanel('base', m.baseSql),
    runtime: () => sqlPanel('runtime', result.governed_sql),
    kb: () => ({
      kind: 'list',
      items: kbRefs.map(ref => {
        const kindName = REF_KIND[ref.kind ?? ''] ?? 'Metric'
        const x = m.expansionFor(kindName, ref.name ?? '')
        return {
          title: cell(ref.name),
          badge: { text: kindName.toUpperCase(), color: TEMPLATE_COLOR[kindName] ?? TEMPLATE_COLOR.Metric },
          lines: [`{{ ${kindName}('${cell(ref.name)}') }}`, ...(x.expr ? [`${x.expr === x.alias ? 'Column' : 'Compiles to'}  ${x.expr}`] : [])],
        }
      }),
    }),
    governance: () => ({
      kind: 'list',
      items: injections.map(inj => {
        const outcome = OUTCOME_BADGE[inj.outcome ?? ''] ?? { label: clean(inj.outcome ?? 'applied').toUpperCase(), color: '#6b7280' }
        return {
          title: cell(inj.rule_name ?? inj.source_id ?? 'rule'),
          badge: { text: outcome.label, color: outcome.color },
          lines: [
            ...(inj.why ? [clean(inj.why)] : []),
            ...(inj.added_clauses ?? []).map(cl => `+ ${clean(cl)}`),
            ...(inj.transformations ?? []).filter(t => t.column).map(t => `~ ${cell(t.column)} returned as NULL`),
          ],
        }
      }),
    }),
  }

  const isSql = active === 'base' || active === 'runtime'
  const segments: Array<{ id: TabId; label: string; on: boolean; go: TabId }> = [
    { id: 'results', label: 'Results', on: active === 'results', go: 'results' },
    { id: 'runtime', label: 'SQL', on: isSql, go: isSql ? active : 'runtime' },
    { id: 'chart', label: 'Graph', on: active === 'chart', go: 'chart' },
    { id: 'lineage', label: 'Lineage', on: active === 'lineage', go: 'lineage' },
    { id: 'kb', label: `KB (${kbCount})`, on: active === 'kb', go: 'kb' },
    { id: 'governance', label: `Rules (${injections.length})`, on: active === 'governance', go: 'governance' },
  ]
  const segment = (key: string, label: string, on: boolean, press: () => unknown) => (
    <Button key={key} label={label} variant={on ? 'primary' : undefined} plain={on ? undefined : true} dimColor={!on} onPress={press} />
  )
  const sqlText = clean((active === 'base' ? m.baseSql : result.governed_sql) ?? '')
  // Feature #1067: every footer reads from the left - the desktop sizes the
  // laid-over controls a little wider than the card's own cells, so a row
  // anchored to the right edge runs past it.
  const n = (x: number) => x.toLocaleString('en-US')
  // The lineage status reads in the native footer, after its buttons.
  const status =
    active === 'lineage'
      ? upstream?.status === 'ok'
        ? upstream.notFound
          ? `${upstream.notFound} isn't in your Graphit org - showing the query only`
          : `Warehouse to result, read from Graphit at ${upstream.loadedAt ?? ''}`
        : upstream?.status === 'loading'
          ? 'Reading the warehouse, data source and KB definitions…'
          : upstream?.status === 'error'
            ? `Upstream not read: ${upstream.error ?? 'unknown error'}`
            : 'Showing the query only; load the upstream for the full chain'
      : undefined
  const footer = active === 'results' && shown.length > 0 ? (
    <Box justifyContent="flex-start" alignItems="center" gap={3}>
      <Button key={`results-full-${m.rowKey}`} label="Full results ↗" variant="secondary" onPress={() => m.act.openResults()} />
      <Box alignItems="center" gap={2}>
        <Box alignItems="center" gap={1}>
          {m.pageCount > 2 ? <Button key={`pg-first-${m.rowKey}`} label="«" plain dimColor={m.page === 0} onPress={() => m.act.goTo(0)} /> : null}
          {m.pageCount > 1 ? <Button key={`pg-prev-${m.rowKey}`} label="❮" variant="secondary" dimColor={m.page === 0} onPress={() => m.act.goTo(m.page - 1)} /> : null}
          <Text dimColor>{`Rows ${n(m.first + 1)}-${n(m.first + shown.length)} of ${n(result.rows.length)}`}</Text>
          {m.pageCount > 1 ? <Button key={`pg-next-${m.rowKey}`} label="❯" variant="secondary" dimColor={m.page === m.pageCount - 1} onPress={() => m.act.goTo(m.page + 1)} /> : null}
          {m.pageCount > 2 ? <Button key={`pg-last-${m.rowKey}`} label="»" plain dimColor={m.page === m.pageCount - 1} onPress={() => m.act.goTo(m.pageCount - 1)} /> : null}
        </Box>
        {colStarts.length > 1 ? (
          <Box alignItems="center" gap={1}>
            <Button key={`col-prev-${m.rowKey}`} label="❮" variant="secondary" dimColor={colPage === 0} onPress={() => goCols(colPage - 1)} />
            <Text dimColor>{`Columns ${cStart + 1}-${cEnd} of ${cols.length}`}</Text>
            <Button key={`col-next-${m.rowKey}`} label="❯" variant="secondary" dimColor={colPage === colStarts.length - 1} onPress={() => goCols(colPage + 1)} />
          </Box>
        ) : null}
      </Box>
    </Box>
  ) : active === 'lineage' ? (
    <Box justifyContent="flex-start" alignItems="center" gap={1}>
      <Button
        key={`up-explore-${m.rowKey}`}
        label="Explore lineage"
        variant="secondary"
        onPress={() => m.act.openExplorer(`${m.sourceName ?? 'Query'} lineage`, layers)}
      />
      <Button
        key={`up-load-${m.rowKey}`}
        label={upstream?.status === 'ok' ? 'Reload' : upstream?.status === 'loading' ? 'Loading…' : 'Load upstream'}
        variant="secondary"
        dimColor={upstream?.status === 'loading'}
        onPress={() => m.act.loadUpstream()}
      />
      {status ? <Text dimColor wrap="truncate-end">{status}</Text> : null}
    </Box>
  ) : isSql ? (
    <Box justifyContent="flex-start" alignItems="center" gap={3}>
      {/* Which SQL the panel shows, as a highlighted toggle on the left. */}
      <Box alignItems="center" gap={1}>
        {(['base', 'runtime'] as const).map(kind => (
          <Button
            key={`sql-${kind === 'base' ? 'base' : 'run'}-${m.id}`}
            label={kind === 'base' ? 'As written' : 'As run'}
            variant={active === kind ? 'primary' : 'secondary'}
            onPress={() => m.act.setTab(kind)}
          />
        ))}
      </Box>
      <Box alignItems="center" gap={1}>
      {sqlText ? (
        <Button key={`sql-copy-${m.id}`} label="Copy" plain onPress={() => m.act.copy(formatLines(sqlText).map(lineText).join('\n'))} />
      ) : null}
      {sqlText ? (
        <Button
          key={`sql-open-${m.id}`}
          label="Open full SQL"
          variant="secondary"
          onPress={() => m.act.openSql(active === 'base' ? 'SQL as written' : 'SQL as run', sqlText)}
        />
      ) : null}
      </Box>
    </Box>
  ) : null


  const card = renderCardSvg({
    logoInner: m.logoInner,
    tierLabel: TIER_LABEL[m.tier] ?? clean(m.tier),
    tierColor: TIER_COLOR[m.tier] ?? TIER_COLOR.ad_hoc,
    meta: m.meta.join(' · '),
    source: m.sourceName ? cell(m.sourceName) : undefined,
    panel: panels[active](),
    toolbar: TOOLBAR_PX,
    // Feature #1067: every tab keeps the footer band, so the card's height never changes.
    footer: FOOTER_PX,
  })
  return (
    <Box flexDirection="column" marginTop={1} alignSelf="flex-start">
      <Svg key="card" source={card.svg} alt={`Graphit query result: ${m.meta.join(', ')}`} width={card.width} height={card.height} />
      {/* The tab band: tabs on the left, the query switcher on the right. */}
      <Box position="absolute" top={4} left={2} right={2} alignItems="center" justifyContent="space-between">
        <Box alignItems="center" gap={1}>
          {segments.map(t =>
            segment(`tab-${t.id}`, t.label, t.on, async () => {
              await m.act.setTab(t.go)
              if (t.go === 'lineage' && !upstream) await m.act.loadUpstream()
            }),
          )}
        </Box>
        {m.nav}
      </Box>
      {footer ? (
        <Box position="absolute" bottom={2} left={2} right={2}>
          {footer}
        </Box>
      ) : null}
    </Box>
  )
}
