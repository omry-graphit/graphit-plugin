// The query view's sidebars: the KB definition (Feature #1062), and the
// lineage explorer and full SQL the card opens (Feature #1067). Panes are
// native, so they scroll and every row is clickable. Pure: register.tsx reads
// the state and supplies the actions (a mod's `$` never crosses an import).

import type { Ui } from './card'
import { KIND_LABEL, capitalize, cell, clean, own } from './result'
import { templateColor, tokenSpans } from './spans'
import { codeChunks, formatLines, prettySql, tokenize } from './sql'
import type { Explore, KbDef, KbSelection, SqlPane } from './state'
import { renderFlowSvg } from './flow'
import { renderHeroSvg } from './svgcard'
import { chainOf } from './upstream'
import type { Layers } from './upstream'

// The inspector's inset grouped lists.
const INSET_FILL = '#FFFFFF'
const INSET_BORDER = '#E5E5EA'

export function drawKbPane(ui: Ui, sel: KbSelection | null, def: KbDef | undefined, copy: (text: string) => unknown): unknown {
  const { Box, Text, Button } = ui
  if (!sel) return <Text dimColor>Click a KB reference in a query result to see its definition.</Text>
  const color = templateColor(sel.kind)
  const reference = `{{ ${cell(sel.kind)}('${cell(sel.name)}') }}`
  const compiled = clean(sel.expansion)
  const alias = sel.alias ? ` AS ${sel.alias}` : ''

  const rows: Array<{ label: string; value: string; isCode?: boolean }> = []
  rows.push({ label: 'Kind', value: own(KIND_LABEL, def?.type) ?? sel.kind })
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
export type ExploreActions = {
  go: (id: string) => unknown
  back: () => unknown
  all: () => unknown
  openSql: (title: string, sql: string) => unknown
  copy: (text: string) => unknown
}

// A node's SQL shows this many lines in the explorer; Open full SQL has the rest.
const SQL_PREVIEW_LINES = 12

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

  // The chain drawn top to bottom: all of it on the overview, one node's own
  // upstream and downstream on its page. Each node is a native box with its
  // name as a Button, laid out in flow; only the links between layers are
  // drawn (flow.ts). Pressing a node opens it here.
  const flow = (key: string, spec: Layers, focus?: string) => {
    if (!Svg) return null
    const drawn = renderFlowSvg(spec, { focus })
    const alt = focus ? `Lineage of ${sel?.title ?? ''}` : `${ex.title}, top to bottom`
    return (
      <Box key={key} flexDirection="column" alignSelf="flex-start">
        {drawn.strips.map(strip =>
          strip.kind === 'link' ? (
            <Svg key={`${key}-${strip.key}`} source={strip.svg} alt={alt} width={drawn.width} height={strip.height} />
          ) : (
            // A node is native, so its name takes the first press and no
            // drawing has to line up with it.
            <Box key={`${key}-${strip.key}`} flexDirection="row" marginLeft={strip.lead} marginTop={strip.first ? 0 : 1}>
              {strip.nodes.map(n => (
                <Box
                  key={`${key}-box-${n.id}`}
                  width={n.cols}
                  marginLeft={n.gap}
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={n.color}
                  backgroundColor={n.focus ? '#F2F8F7' : '#FFFFFF'}
                  paddingX={1}
                >
                  <Button key={`${key}-n-${n.id}`} label={n.label} plain dimColor={n.muted || undefined} onPress={() => (n.focus ? undefined : go(n.id))} />
                  {n.subtitle ? (
                    <Text dimColor wrap="truncate-end">
                      {n.subtitle}
                    </Text>
                  ) : null}
                </Box>
              ))}
            </Box>
          ),
        )}
      </Box>
    )
  }
  const spec: Layers = { layers: ex.layers, edges: ex.edges }

  if (!sel) {
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        {navBar}
        {hero('LINEAGE', ex.title, `${ex.layers.length} layers · ${nodes.length} nodes`, '#4DB6AC')}
        {/* The drawing is the navigation; without one (the terminal), the layers as rows. */}
        {Svg ? flow('lx-flow', spec) : ex.layers.map((layer, li) => group(`ly${li}`, layer.label, layer.nodes.map((n, ni) => navRow(n, `ln${li}-${ni}`))))}
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
      {flow('lx-chain', chainOf(spec, sel.id), sel.id)}
      {codeFacts.map((f, i) => {
        // A long query (a source's SQL runs to hundreds of lines) shows its
        // head here; the full SQL sidebar is wider and holds every line.
        const pretty = prettySql(f.value)
        const lines = pretty.split('\n')
        const label = f.label || 'SQL'
        const cut = lines.length > SQL_PREVIEW_LINES
        const shown = cut ? lines.slice(0, SQL_PREVIEW_LINES).join('\n') : pretty
        return (
          <Box key={`lc${i}`} flexDirection="column">
            <Box justifyContent="space-between" alignItems="center">
              <Text dimColor bold>{`  ${label.toUpperCase()}${lines.length > 1 ? `  ·  ${lines.length} lines` : ''}`}</Text>
              <Box gap={1} alignItems="center">
                <Button key={`lc${i}-copy`} label="Copy" plain onPress={() => act.copy(pretty)} />
                {cut ? <Button key={`lc${i}-open`} label="Open full SQL" variant="secondary" onPress={() => act.openSql(`${sel.title} · ${label}`, f.value)} /> : null}
              </Box>
            </Box>
            {Code ? (
              codeChunks(shown).map((c, ci) => (
                <Code key={`lc${i}-${ci}`} source={c.source} language="sql" startLine={lines.length > 1 ? c.startLine : undefined} />
              ))
            ) : (
              <Text>{shown}</Text>
            )}
            {cut ? <Text dimColor>{`  ${lines.length - SQL_PREVIEW_LINES} more lines - Open full SQL`}</Text> : null}
          </Box>
        )
      })}
      {!Svg && from.length > 0 ? group('lx-from', 'COMES FROM', from.map((n, i) => navRow(n, `lfrom${i}`))) : null}
      {!Svg && into.length > 0 ? group('lx-into', 'FEEDS', into.map((n, i) => navRow(n, `linto${i}`))) : null}
    </Box>
  )
}
