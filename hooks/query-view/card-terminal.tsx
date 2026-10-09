// The card on the terminal: native rows - a tier badge, tabs, the selected
// panel - with clickable KB references that open the KB sidebar.

import type { CardModel, Ui } from './card'
import { MARK, OUTCOME_BADGE, REF_KIND, TIER_COLOR, cell, clean, fmtNumber, marksFor, own } from './result'
import { templateColor, tokenSpans } from './spans'
import { formatLines, lineText, tokenize } from './sql'
import type { Expansion, Token } from './sql'
import type { TabId } from './state'
import { SERIES_COLORS } from './viz'

export function drawTerminalCard(ui: Ui, m: CardModel): unknown {
  const { Box, Text, Button } = ui
  const { active, result, injections, denied, kbRefs, kbCount, hidden, cols, shown, chart, layers } = m

  const tabList: Array<{ id: TabId; label: string }> = [
    { id: 'results', label: `Results (${m.rowCount})` },
    { id: 'base', label: 'Base query' },
    { id: 'runtime', label: 'Runtime SQL' },
    { id: 'chart', label: 'Graph' },
    { id: 'lineage', label: 'Lineage' },
    { id: 'kb', label: `KB assets (${kbCount})` },
    { id: 'governance', label: `Governance (${injections.length})` },
  ]

  const openKb = (x: Expansion) => m.act.openKb(x)

  const pager = (
    <Box key={`pager-${m.rowKey}`} gap={1} alignItems="center">
      {m.pageCount > 1
        ? [
            <Button key={`pg-prev-${m.rowKey}`} label="‹ Prev" dimColor={m.page === 0} onPress={() => m.act.goTo(m.page - 1)} />,
            <Text key={`pg-at-${m.rowKey}`} dimColor>{`Rows ${(m.first + 1).toLocaleString('en-US')}-${(m.first + shown.length).toLocaleString('en-US')} of ${result.rows.length.toLocaleString('en-US')} · page ${m.page + 1} / ${m.pageCount.toLocaleString('en-US')}`}</Text>,
            <Button key={`pg-next-${m.rowKey}`} label="Next ›" dimColor={m.page === m.pageCount - 1} onPress={() => m.act.goTo(m.page + 1)} />,
          ]
        : null}
      <Button key={`results-full-${m.rowKey}`} label="Full results ›" onPress={() => m.act.openResults()} />
    </Box>
  )

  // One Box per column, so the table aligns on a proportional font too.
  const resultsTab =
    cols.length === 0 || shown.length === 0 ? (
      <Text dimColor>Query returned 0 rows.</Text>
    ) : (
      <Box flexDirection="column">
        <Box gap={3}>
          {cols.map((c, i) => (
            <Box key={`col${i}`} flexDirection="column">
              <Text bold color={hidden.has(c) ? 'gray' : undefined}>
                {hidden.has(c) ? `${cell(c)} ⊘` : cell(c)}
              </Text>
              {shown.map((r, ri) => (
                <Text key={`c${i}-${ri}`} dimColor={hidden.has(c)}>
                  {hidden.has(c) ? '•••' : (typeof r[c] === 'number' ? fmtNumber(r[c] as number) : cell(r[c])) || ' '}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
        {pager}
        {hidden.size > 0 ? <Text color="gray">⊘ hidden by policy: {[...hidden].map(cell).join(', ')}</Text> : null}
      </Box>
    )

  const sqlTab = (kind: 'base' | 'runtime', text: string | undefined, missing: string) => {
    if (!text) return <Text dimColor>{missing}</Text>
    const lines = formatLines(clean(text))
    const formatted = lines.map(lineText).join('\n')
    const width = String(lines.length).length
    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Box gap={1}>
            <Text bold>{kind === 'base' ? 'SQL as written' : 'SQL as run'}</Text>
            <Text dimColor>{`${lines.length} lines`}</Text>
            {kind === 'runtime' ? (
              <Text>
                <Text color={MARK.added.color}>{'  + rule added'}</Text>
                <Text color={MARK.masked.color}>{'  ~ rule masked'}</Text>
                <Text color={MARK.kb.color}>{'  ◆ KB expansion'}</Text>
              </Text>
            ) : (
              <Text color={MARK.kb.color}>{'  ◆ KB reference - click it for the definition'}</Text>
            )}
          </Box>
          <Button key={`copy-${kind}`} label="Copy" onPress={() => m.act.copy(formatted)} />
        </Box>
        {lines.map((line, i) => {
          const marks = marksFor(line, kind, injections, m.expansions)
          const lead = marks[0]
          const notes = [...new Set(marks.map(mk => mk.note).filter(Boolean))]
          // Split the line at each template so the reference itself is the button.
          const segments: Array<{ tokens: Token[]; x?: Expansion }> = [{ tokens: [] }]
          for (const t of line) {
            segments[segments.length - 1].tokens.push(t)
            if (t.kind === 'template') {
              segments[segments.length - 1].x = m.expansionFor(t.templateKind ?? 'Metric', t.templateName ?? '')
              segments.push({ tokens: [] })
            }
          }
          return (
            <Box key={`ln-${kind}-${i}`} gap={1}>
              <Text dimColor>{String(i + 1).padStart(width)}</Text>
              <Text color={lead?.color} bold>
                {lead?.marker ?? ' '}
              </Text>
              <Box>
                {segments.map((seg, si) => {
                  const plain = seg.x ? seg.tokens.slice(0, -1) : seg.tokens
                  const tpl = seg.x ? seg.tokens[seg.tokens.length - 1] : undefined
                  return (
                    <Box key={`sg${si}`}>
                      <Text>{tokenSpans(Text, plain, `t${si}-`)}</Text>
                      {seg.x && tpl ? (
                        <Button
                          key={`kb-${kind}-${i}-${si}`}
                          label={`{{ ${cell(tpl.templateKind)}('${cell(tpl.templateName)}') }}`}
                          plain
                          hover={{ color: templateColor(tpl.templateKind) }}
                          onPress={() => openKb(seg.x as Expansion)}
                        />
                      ) : null}
                    </Box>
                  )
                })}
              </Box>
              {notes.length > 0 ? <Text color={lead.color}>{`  ← ${notes.join(', ')}`}</Text> : null}
            </Box>
          )
        })}
      </Box>
    )
  }

  const label = (text: string) => (
    <Box minWidth={12}>
      <Text dimColor>{text}</Text>
    </Box>
  )
  const badge = (text: string, color: string) => (
    <Text backgroundColor={color} color="#ffffff" bold>
      {` ${text} `}
    </Text>
  )

  const kbTab =
    kbRefs.length > 0 ? (
      <Box flexDirection="column" gap={1}>
        {kbRefs.map((ref, i) => {
          const kindName = own(REF_KIND, ref.kind) ?? 'Metric'
          const color = templateColor(kindName)
          const x = m.expansionFor(kindName, ref.name ?? '')
          return (
            <Box key={`kb${i}`} flexDirection="column">
              <Box gap={1}>
                {badge(kindName.toUpperCase(), color)}
                <Button key={`kb-tab-${i}`} label={cell(ref.name)} plain hover={{ color }} onPress={() => openKb(x)} />
                {ref.deprecated ? badge('DEPRECATED', '#dc2626') : null}
              </Box>
              <Box gap={2}>
                {label('Reference')}
                <Text>{tokenSpans(Text, tokenize(`{{ ${kindName}('${cell(ref.name)}') }}`), `kbr${i}-`)}</Text>
              </Box>
              {x.expr ? (
                <Box gap={2}>
                  {label(x.expr === x.alias ? 'Column' : 'Compiles to')}
                  <Text>{tokenSpans(Text, tokenize(x.expr), `kbe${i}-`)}</Text>
                </Box>
              ) : null}
              {x.alias ? (
                <Box gap={2}>
                  {label('Used as')}
                  <Text bold>{cell(x.alias)}</Text>
                </Box>
              ) : null}
            </Box>
          )
        })}
      </Box>
    ) : (
      <Text dimColor>{kbCount > 0 ? `${kbCount} KB assets referenced; this CLI version does not send their names.` : 'No KB assets referenced.'}</Text>
    )

  const filtersAdded = injections.reduce((n, inj) => n + (inj.added_clauses?.length ?? 0), 0)
  const columnsMasked = injections.reduce((n, inj) => n + (inj.transformations ?? []).filter(t => t.column).length, 0)
  const summary = [
    `${injections.length} rule${injections.length === 1 ? '' : 's'} applied`,
    filtersAdded ? `${filtersAdded} filter${filtersAdded === 1 ? '' : 's'} added` : '',
    columnsMasked ? `${columnsMasked} column${columnsMasked === 1 ? '' : 's'} masked` : '',
    denied.length ? `${denied.length} override${denied.length === 1 ? '' : 's'} denied` : '',
  ].filter(Boolean)

  const governanceTab =
    injections.length === 0 && denied.length === 0 ? (
      <Text dimColor>No governance rules applied.</Text>
    ) : (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{summary.join(' · ')}</Text>
        {injections.map((inj, i) => {
          const name = cell(inj.source === 'deprecated_asset' ? inj.source_id : inj.rule_name ?? inj.source_id ?? 'rule')
          const outcome = own(OUTCOME_BADGE, inj.outcome) ?? { label: clean(inj.outcome ?? 'applied').toUpperCase(), color: '#6b7280' }
          return (
            <Box key={`inj${i}`} flexDirection="column">
              <Box gap={1}>
                {badge(outcome.label, outcome.color)}
                <Text bold>{name}</Text>
              </Box>
              {inj.why ? <Text>{clean(inj.why)}</Text> : null}
              {(inj.added_clauses ?? []).map((cl, j) => (
                <Box key={`cl${j}`} gap={2}>
                  {label(j === 0 ? 'Adds filter' : '')}
                  <Text>
                    <Text color={MARK.added.color} bold>
                      {'+ '}
                    </Text>
                    {tokenSpans(Text, tokenize(clean(cl)), `cl${i}-${j}-`)}
                  </Text>
                </Box>
              ))}
              {(inj.transformations ?? [])
                .filter(t => t.column)
                .map((t, j) => (
                  <Box key={`tr${j}`} gap={2}>
                    {label(j === 0 ? 'Masks column' : '')}
                    <Text>
                      <Text color={MARK.masked.color} bold>
                        {'~ '}
                      </Text>
                      <Text bold>{cell(t.column)}</Text>
                      <Text dimColor>{'  returned as NULL'}</Text>
                    </Text>
                  </Box>
                ))}
              {inj.reason ? (
                <Box gap={2}>
                  {label('Note')}
                  <Text dimColor>{clean(inj.reason)}</Text>
                </Box>
              ) : null}
            </Box>
          )
        })}
        {denied.map((d, i) => (
          <Box key={`den${i}`} flexDirection="column">
            <Box gap={1}>
              {badge('OVERRIDE DENIED', '#dc2626')}
              <Text bold>{cell(d.rule_name ?? 'rule')}</Text>
            </Box>
            {d.reason ? <Text>{clean(d.reason)}</Text> : null}
          </Box>
        ))}
      </Box>
    )

  // Feature #1067: the graph as bars of block characters, one row per value.
  const peak = chart ? Math.max(1, ...chart.series.flatMap(s => s.values.map(v => Math.abs(v ?? 0)))) : 1
  const chartTab = !chart ? (
    <Text dimColor>Nothing to graph: the result needs a category or date column and a number column.</Text>
  ) : (
    <Box flexDirection="column">
      <Text bold>{`${chart.measure} by ${chart.x}`}</Text>
      {chart.categories.map((c, i) => (
        <Box key={`bar${i}`} flexDirection="column">
          {chart.series.map((s, si) => (
            <Box key={`bar${i}-${si}`} gap={1}>
              <Box minWidth={12}>
                <Text dimColor>{si === 0 ? cell(c) : ''}</Text>
              </Box>
              <Text color={SERIES_COLORS[si]}>{'█'.repeat(Math.max(1, Math.round((Math.abs(s.values[i] ?? 0) / peak) * 40)))}</Text>
              <Text>{`${s.values[i] === null ? '-' : fmtNumber(s.values[i] as number)}${chart.series.length > 1 ? `  ${cell(s.name)}` : ''}`}</Text>
            </Box>
          ))}
        </Box>
      ))}
      {chart.note ? <Text dimColor>{chart.note}</Text> : null}
    </Box>
  )

  // Feature #1067: the lineage as its layers, top to bottom.
  const lineageTab = (
    <Box flexDirection="column">
      {layers.layers.map((layer, li) => (
        <Box key={`lay${li}`} gap={1}>
          <Box minWidth={20}>
            <Text dimColor bold>
              {layer.label}
            </Text>
          </Box>
          <Text>{layer.nodes.map(n => cell(n.title)).join('  ·  ')}</Text>
        </Box>
      ))}
    </Box>
  )

  const body: Record<TabId, unknown> = {
    results: resultsTab,
    chart: chartTab,
    lineage: lineageTab,
    base: sqlTab('base', m.baseSql, 'The base query is not in this result.'),
    runtime: sqlTab('runtime', result.governed_sql, 'No runtime SQL in this result.'),
    kb: kbTab,
    governance: governanceTab,
  }

  return (
    <Box flexDirection="column">
      {m.header ? (
        <Text key="command" dimColor wrap="truncate-end">
          {`Bash  $ ${m.header}`}
        </Text>
      ) : null}
      <Box gap={1} justifyContent="space-between">
        <Box gap={1}>
          <Text key="badge" backgroundColor={own(TIER_COLOR, m.tier) ?? 'gray'} color="black" bold>
            {` ${m.tier.replace('_', '-')} `}
          </Text>
          <Text dimColor>
            {m.meta.join(' · ')}
            {m.sourceName ? <Text bold dimColor={false}>{` · ${cell(m.sourceName)}`}</Text> : null}
          </Text>
        </Box>
        {m.nav}
      </Box>
      <Box gap={1} marginTop={1} flexWrap="wrap">
        {tabList.map(t => (
          <Button
            key={`tab-${t.id}`}
            label={t.id === active ? `▸ ${t.label}` : t.label}
            variant={t.id === active ? 'primary' : 'secondary'}
            dimColor={t.id !== active}
            onPress={() => m.act.setTab(t.id)}
          />
        ))}
      </Box>
      <Box key={`panel-${active}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        {body[active]}
      </Box>
    </Box>
  )
}
