// The query view's sidebars: the KB definition (Feature #1062), and the
// lineage explorer and full SQL the card opens (Feature #1067). Panes are
// native, so they scroll and every row is clickable. Pure: register.tsx reads
// the state and supplies the actions (a mod's `$` never crosses an import).

import type { Ui } from './card'
import { KIND_LABEL, capitalize, cell, clean } from './result'
import { TEMPLATE_COLOR, tokenSpans } from './spans'
import { codeChunks, formatLines, prettySql, tokenize } from './sql'
import type { Explore, KbDef, KbSelection, SqlPane } from './state'
import { renderHeroSvg } from './svgcard'

// The inspector's inset grouped lists.
const INSET_FILL = '#FFFFFF'
const INSET_BORDER = '#E5E5EA'

export function drawKbPane(ui: Ui, sel: KbSelection | null, def: KbDef | undefined, copy: (text: string) => unknown): unknown {
  const { Box, Text, Button } = ui
  if (!sel) return <Text dimColor>Click a KB reference in a query result to see its definition.</Text>
  const color = TEMPLATE_COLOR[sel.kind] ?? TEMPLATE_COLOR.Metric
  const reference = `{{ ${cell(sel.kind)}('${cell(sel.name)}') }}`
  const compiled = clean(sel.expansion)
  const alias = sel.alias ? ` AS ${sel.alias}` : ''

  const rows: Array<{ label: string; value: string; isCode?: boolean }> = []
  rows.push({ label: 'Kind', value: KIND_LABEL[def?.type ?? ''] ?? sel.kind })
  if (sel.kind === 'Dimension' && compiled === sel.name) rows.push({ label: 'Column', value: compiled, isCode: true })
  for (const part of def?.parts ?? []) rows.push({ label: capitalize(part.label), value: part.value, isCode: true })
  if (def?.group) rows.push({ label: 'Group', value: def.group })
  if (def?.lifecycle) rows.push({ label: 'Lifecycle', value: def.lifecycle })
  if (def?.domains?.length) rows.push({ label: 'Access', value: def.domains.join(', ') })

  const heading = (text: string, key: string) => (
    <Text key={key} dimColor bold>
      {text}
    </Text>
  )

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="column">
        <Box gap={1}>
          <Text backgroundColor={color} color="#ffffff" bold>
            {` ${sel.kind.toUpperCase()} `}
          </Text>
          <Text bold>{cell(sel.name)}</Text>
        </Box>
        {def?.status === 'loading' ? <Text dimColor>Loading the definition…</Text> : null}
        {def?.status === 'error' ? <Text color="red">{clean(def.error)}</Text> : null}
        {def?.description ? <Text>{clean(def.description)}</Text> : null}
        {def?.status === 'unsupported' ? (
          <Text dimColor>{`No ${sel.kind.toLowerCase()} definition read in this CLI version.`}</Text>
        ) : null}
      </Box>

      <Box flexDirection="column">
        {heading('DEFINITION', 'h-def')}
        {rows.map((row, i) => (
          <Box key={`row${i}`} gap={2}>
            <Box minWidth={10}>
              <Text dimColor>{row.label}</Text>
            </Box>
            {row.isCode ? (
              <Text color={color} bold>{cell(row.value)}</Text>
            ) : (
              <Text>{cell(row.value)}</Text>
            )}
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        {heading('IN THIS QUERY', 'h-query')}
        <Box gap={2}>
          <Box minWidth={10}>
            <Text dimColor>Written</Text>
          </Box>
          <Text>{tokenSpans(Text, tokenize(`${reference}${alias}`), 'w-')}</Text>
        </Box>
        {compiled ? (
          formatLines(`${compiled}${alias}`).map((line, i) => (
            <Box key={`c${i}`} gap={2}>
              <Box minWidth={10}>
                <Text dimColor>{i === 0 ? 'Compiled' : ''}</Text>
              </Box>
              <Text>{tokenSpans(Text, line, `c${i}-`)}</Text>
            </Box>
          ))
        ) : (
          <Text dimColor>Used outside the SELECT list; see Runtime SQL.</Text>
        )}
      </Box>

      <Box gap={1}>
        <Button key="kb-copy-ref" label="Copy reference" onPress={() => copy(reference)} />
        {compiled ? (
          <Button key="kb-copy-sql" label="Copy SQL" onPress={() => copy(compiled)} />
        ) : null}
      </Box>
    </Box>
  )
}

// The full SQL, native and scrollable: the card shows only its first lines.
export function drawSqlPane(ui: Ui, pane: SqlPane | null, copy: (text: string) => unknown): unknown {
  const { Box, Text, Button, Code } = ui
  if (!pane) return <Text dimColor>Open the SQL tab on a query result, then Open full SQL.</Text>
  const pretty = prettySql(pane.sql)
  const lines = formatLines(pretty)
  const width = String(lines.length).length
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>{`${pane.title} · ${lines.length} lines`}</Text>
        <Button key="sqlp-copy" label="Copy" onPress={() => copy(pretty)} />
      </Box>
      {Code ? (
        codeChunks(pretty).map((c, ci) => <Code key={`sqlp-c${ci}`} source={c.source} language="sql" startLine={c.startLine} />)
      ) : (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Box key={`sp${i}`} gap={1}>
            <Text dimColor>{String(i + 1).padStart(width)}</Text>
            <Text>{tokenSpans(Text, line, `sp${i}-`)}</Text>
          </Box>
        ))}
      </Box>
      )}
    </Box>
  )
}

// The lineage explorer: with no node chosen it lists every layer; a node shows
// its facts and the nodes it comes from and feeds, each one a click away.
// What the explorer's controls do; each runs in register.tsx with `$`.
export type ExploreActions = { go: (id: string) => unknown; back: () => unknown; all: () => unknown }

export function drawExplorer(ui: Ui, ex: Explore | null, act: ExploreActions): unknown {
  const { Box, Text, Button, Code, Svg } = ui
  if (!ex) return <Text dimColor>Open Lineage on a query result, then Explore lineage.</Text>
  const nodes = ex.layers.flatMap(l => l.nodes.map(n => ({ ...n, layer: l.label })))
  const byId = new Map(nodes.map(n => [n.id, n]))
  const byTitle = new Map(nodes.map(n => [n.title, n]))
  const sel = ex.selected ? byId.get(ex.selected) : undefined
  const go = act.go
  const titleCase = (t: string) => t.charAt(0) + t.slice(1).toLowerCase()

  // An inset grouped list: rounded, white, on the pane's own background.
  const group = (key: string, header: string, children: unknown) => (
    <Box key={key} flexDirection="column">
      <Text dimColor bold>{`  ${header}`}</Text>
      <Box flexDirection="column" borderStyle="round" borderColor={INSET_BORDER} backgroundColor={INSET_FILL} paddingX={1}>
        {children}
      </Box>
    </Box>
  )
  // A navigation row: colored dot, title, muted subtitle, chevron.
  const navRow = (n: { id: string; title: string; color: string; subtitle?: string }, key: string) => (
    <Box key={key} justifyContent="space-between" alignItems="center">
      <Box gap={1} alignItems="center" flexShrink={1}>
        <Text color={n.color}>{'●'}</Text>
        <Button key={`${key}-b`} label={n.title} plain onPress={() => go(n.id)} />
        {n.subtitle ? (
          <Text dimColor wrap="truncate-end">
            {n.subtitle}
          </Text>
        ) : null}
      </Box>
      <Text dimColor>{'›'}</Text>
    </Box>
  )
  const hero = (kind: string, title: string, subtitle: string | undefined, color: string) => {
    // Never name a local `h`: the JSX factory is `h`.
    const heroSvg = renderHeroSvg({ kind, title, subtitle, color })
    return Svg ? (
      <Svg key="lx-hero" source={heroSvg.svg} alt={`${titleCase(kind)}: ${title}`} width={heroSvg.width} height={heroSvg.height} />
    ) : (
      <Text bold>{`${titleCase(kind)}: ${title}`}</Text>
    )
  }
  const navBar = (
    <Box justifyContent="space-between" alignItems="center">
      <Box gap={1} alignItems="center">
        <Button
          key="lx-back"
          label="‹ Back"
          plain
          dimColor={ex.trail.length === 0}
          onPress={() => act.back()}
        />
        <Text dimColor>{sel ? `Lineage › ${titleCase(sel.layer)}` : 'Lineage'}</Text>
      </Box>
      {sel ? <Button key="lx-all" label="All layers" plain onPress={() => act.all()} /> : null}
    </Box>
  )

  if (!sel) {
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        {navBar}
        {hero('LINEAGE', ex.title, `${ex.layers.length} layers · ${nodes.length} nodes`, '#4DB6AC')}
        {ex.layers.map((layer, li) => group(`ly${li}`, layer.label, layer.nodes.map((n, ni) => navRow(n, `ln${li}-${ni}`))))}
      </Box>
    )
  }

  const uniq = <T extends { id: string }>(list: T[]) => list.filter((n, i) => list.findIndex(m => m.id === n.id) === i)
  const from = uniq(ex.edges.filter(x => x.to === sel.id).map(x => byId.get(x.from)).filter((n): n is NonNullable<typeof n> => !!n))
  const into = uniq(ex.edges.filter(x => x.from === sel.id).map(x => byId.get(x.to)).filter((n): n is NonNullable<typeof n> => !!n))
  const facts = sel.facts ?? []
  const plainFacts = facts.filter(f => !f.code)
  const codeFacts = facts.filter(f => f.code)
  // A value naming other nodes ("ua_installs, cpi_num") becomes chips that open them.
  const factValue = (value: string, key: string) => {
    const parts = value.split(/,\s*/)
    const linked = parts.length > 0 && parts.every(p => byTitle.has(p))
    if (!linked) return <Text key={key}>{value}</Text>
    return (
      <Box key={key} gap={1} flexWrap="wrap" justifyContent="flex-end">
        {parts.map((p, pi) => (
          <Button key={`${key}-${pi}`} label={p} variant="secondary" onPress={() => go(byTitle.get(p)!.id)} />
        ))}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {navBar}
      {hero(sel.layer, sel.title, sel.subtitle, sel.color)}
      {plainFacts.length > 0
        ? group(
            'lx-facts',
            'DETAILS',
            plainFacts.map((f, i) => (
              <Box key={`lf${i}`} justifyContent="space-between" gap={2}>
                <Text dimColor>{f.label}</Text>
                {factValue(f.value, `lfv${i}`)}
              </Box>
            )),
          )
        : null}
      {codeFacts.map((f, i) => (
        <Box key={`lc${i}`} flexDirection="column">
          <Text dimColor bold>{`  ${(f.label || 'SQL').toUpperCase()}`}</Text>
          {Code ? (
            codeChunks(prettySql(f.value)).map((c, ci) => (
              <Code key={`lc${i}-${ci}`} source={c.source} language="sql" startLine={prettySql(f.value).includes('\n') ? c.startLine : undefined} />
            ))
          ) : (
            <Text>{f.value}</Text>
          )}
        </Box>
      ))}
      {from.length > 0 ? group('lx-from', 'COMES FROM', from.map((n, i) => navRow(n, `lfrom${i}`))) : null}
      {into.length > 0 ? group('lx-into', 'FEEDS', into.map((n, i) => navRow(n, `linto${i}`))) : null}
    </Box>
  )
}
