// SQL tokenizer and formatter for the query view: pure functions, no `$`.

export type TokenKind =
  | 'kw'
  | 'fn'
  | 'str'
  | 'num'
  | 'param'
  | 'comment'
  | 'template'
  | 'op'
  | 'ident'
  | 'punct'
  | 'ws'

export type Token = {
  kind: TokenKind
  text: string
  // A KB template's kind and name: {{ Metric('revenue') }} -> Metric, revenue.
  templateKind?: string
  templateName?: string
}

const KEYWORDS = new Set(
  (
    'select from where and or not in is null as on join left right inner outer full cross group by order ' +
    'having limit offset union all distinct case when then else end with over partition between like ilike ' +
    'asc desc true false exists qualify interval cast using lateral window rows range preceding following ' +
    'current row unbounded filter within except intersect values insert update delete set into'
  ).split(' '),
)

const CLAUSE_STARTS = new Set(['select', 'from', 'where', 'having', 'limit', 'qualify', 'union', 'with', 'window', 'offset'])
const TWO_WORD_CLAUSES = new Set(['group', 'order'])
const JOIN_PREFIXES = new Set(['left', 'right', 'inner', 'full', 'cross', 'outer'])

const RULES: Array<[TokenKind, RegExp]> = [
  ['template', /^\{\{\s*([A-Za-z_]+)\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/],
  ['comment', /^--[^\n]*/],
  ['str', /^'(?:[^']|'')*'/],
  ['ident', /^"[^"]*"/],
  ['num', /^\d+(?:\.\d+)?\b/],
  ['param', /^:[A-Za-z_]\w*/],
  ['ident', /^[A-Za-z_][\w$]*/],
  ['ws', /^\s+/],
  ['op', /^(?:<>|!=|>=|<=|\|\||::|[=<>+\-*/%])/],
]

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = []
  let rest = sql
  while (rest.length > 0) {
    let matched = false
    for (const [kind, re] of RULES) {
      const m = re.exec(rest)
      if (!m) continue
      const text = m[0]
      if (kind === 'template') {
        tokens.push({ kind, text, templateKind: m[1], templateName: m[2] })
      } else if (kind === 'ident' && /^[A-Za-z_]/.test(text)) {
        const after = rest.slice(text.length).trimStart()
        const lower = text.toLowerCase()
        tokens.push({ kind: KEYWORDS.has(lower) ? 'kw' : after.startsWith('(') ? 'fn' : 'ident', text })
      } else {
        tokens.push({ kind, text })
      }
      rest = rest.slice(text.length)
      matched = true
      break
    }
    if (!matched) {
      tokens.push({ kind: 'punct', text: rest[0] })
      rest = rest.slice(1)
    }
  }
  return tokens
}

function trimEnd(line: Token[]): Token[] {
  while (line.length > 0 && line[line.length - 1].kind === 'ws') line.pop()
  return line
}

// A multi-line query keeps the author's layout; a one-line query gets one
// clause per line, one select item per line, and AND/OR on their own lines.
export function formatLines(sql: string): Token[][] {
  const tokens = tokenize(sql.trim())
  if (sql.trim().includes('\n')) {
    const lines: Token[][] = [[]]
    for (const t of tokens) {
      if (t.kind === 'ws' && t.text.includes('\n')) {
        const parts = t.text.split('\n')
        for (let i = 1; i < parts.length; i += 1) lines.push([])
        const indent = parts[parts.length - 1]
        if (indent) lines[lines.length - 1].push({ kind: 'ws', text: indent })
      } else {
        lines[lines.length - 1].push(t)
      }
    }
    return lines.map(trimEnd)
  }

  // Feature #1067: a subquery or CTE body - a "(" that opens a
  // SELECT or WITH - is formatted like the top level, indented under its
  // parenthesis; any other parenthesis (a call, an IN list) stays inline.
  const lines: Token[][] = []
  let line: Token[] = []
  type Frame = { sub: boolean; indent: number; clause: string }
  const frames: Frame[] = [{ sub: true, indent: 0, clause: '' }]
  const top = () => frames[frames.length - 1]
  let prevWord = ''
  const newline = (indent: number) => {
    if (trimEnd(line).length > 0) lines.push(line)
    line = indent > 0 ? [{ kind: 'ws', text: ' '.repeat(indent) }] : []
  }
  const atLineStart = () => line.every(t => t.kind === 'ws')
  const lineIndent = () => (line[0]?.kind === 'ws' ? line[0].text.length : 0)
  const nextWord = (from: number) => {
    for (let k = from; k < tokens.length; k += 1) if (tokens[k].kind !== 'ws') return tokens[k].text.toLowerCase()
    return ''
  }

  tokens.forEach((t, i) => {
    if (t.kind === 'ws') {
      if (!atLineStart()) line.push({ kind: 'ws', text: ' ' })
      return
    }
    if (t.text === '(') {
      const opensQuery = ['select', 'with'].includes(nextWord(i + 1))
      line.push(t)
      if (opensQuery) {
        const indent = lineIndent() + 4
        frames.push({ sub: true, indent, clause: '' })
        newline(indent)
      } else {
        frames.push({ sub: false, indent: top().indent, clause: top().clause })
      }
      return
    }
    if (t.text === ')') {
      const frame = frames.length > 1 ? frames.pop()! : top()
      if (frame.sub) newline(Math.max(frame.indent - 4, 0))
      line.push(t)
      return
    }
    const frame = top()
    const word = t.kind === 'kw' || t.kind === 'ident' || t.kind === 'fn' ? t.text.toLowerCase() : ''
    if (frame.sub && word) {
      const startsJoin = word === 'join' && !JOIN_PREFIXES.has(prevWord)
      if (CLAUSE_STARTS.has(word) || TWO_WORD_CLAUSES.has(word) || JOIN_PREFIXES.has(word) || startsJoin) {
        if (!(JOIN_PREFIXES.has(prevWord) && (word === 'join' || word === 'outer')) && !(TWO_WORD_CLAUSES.has(prevWord) && word === 'by')) {
          if (!atLineStart()) newline(frame.indent)
          frame.clause = word
        }
      } else if ((word === 'and' || word === 'or') && (frame.clause === 'where' || frame.clause === 'having')) {
        newline(frame.indent + 2)
      }
    }
    line.push(t)
    if (word) prevWord = word
    if (frame.sub && word === 'select') newline(frame.indent + 2)
    if (frame.sub && t.text === ',' && frame.clause === 'select') newline(frame.indent + 2)
  })
  if (trimEnd(line).length > 0) lines.push(line)
  return lines
}

export function lineText(line: Token[]): string {
  return line.map(t => t.text).join('')
}

type SelectItem = { alias: string; expr: string; templates: Token[] }

// The top-level SELECT list: each item's alias (AS name, or a bare column)
// and its expression text, with the KB templates it holds.
function selectItems(sql: string): SelectItem[] {
  const tokens = tokenize(sql)
  const items: SelectItem[] = []
  let depth = 0
  let inSelect = false
  let current: Token[] = []
  const flush = () => {
    const parts = current.filter(t => t.kind !== 'ws')
    if (parts.length > 0) {
      const asAt = parts.length >= 3 && parts[parts.length - 2].text.toLowerCase() === 'as' ? parts.length - 2 : -1
      const aliasTok = asAt >= 0 ? parts[parts.length - 1] : parts.length === 1 ? parts[0] : undefined
      const exprTokens = asAt >= 0 ? current.slice(0, current.lastIndexOf(parts[asAt])) : current
      if (aliasTok) {
        items.push({
          alias: aliasTok.text.replace(/"/g, '').toLowerCase(),
          expr: exprTokens.map(t => t.text).join('').trim(),
          templates: parts.filter(t => t.kind === 'template'),
        })
      }
    }
    current = []
  }
  for (const t of tokens) {
    if (t.text === '(') depth += 1
    if (t.text === ')') depth -= 1
    const word = t.kind === 'kw' ? t.text.toLowerCase() : ''
    if (depth === 0 && word === 'select' && !inSelect && items.length === 0) {
      inSelect = true
      continue
    }
    if (!inSelect) continue
    if (depth === 0 && word === 'from') {
      flush()
      break
    }
    if (depth === 0 && word === 'distinct' && current.every(c => c.kind === 'ws')) continue
    if (depth === 0 && t.text === ',') flush()
    else current.push(t)
  }
  return items
}

export type Expansion = { kind: string; name: string; alias: string; expr: string }

// What each KB template of the base query compiled to, matched to the runtime
// SQL by select alias: {{ Metric('cpi') }} AS cpi <-> (...) AS cpi.
export function templateExpansions(baseSql: string, runtimeSql: string): Expansion[] {
  const runtime = new Map(selectItems(runtimeSql).map(i => [i.alias, i.expr]))
  const out: Expansion[] = []
  for (const item of selectItems(baseSql)) {
    const expr = runtime.get(item.alias)
    if (!expr) continue
    for (const t of item.templates) {
      if (t.templateKind && t.templateName) {
        out.push({ kind: t.templateKind, name: t.templateName, alias: item.alias, expr })
      }
    }
  }
  return out
}

// Feature #1067: SQL as the sidebars show it - re-flowed by the
// formatter (one clause, one select item per line, CTEs indented) unless it
// holds a line comment, whose end the layout must keep.
export function prettySql(sql: string): string {
  const text = sql.trim()
  if (/--/.test(text.replace(/'(?:[^']|'')*'/g, "''"))) return text
  return formatLines(text.replace(/\s+/g, ' ')).map(lineText).join('\n')
}

// Text for native Code blocks: whole lines, each block under `max` characters.
export function codeChunks(text: string, max = 9500): Array<{ source: string; startLine: number }> {
  const out: Array<{ source: string; startLine: number }> = []
  let lines: string[] = []
  let size = 0
  let start = 1
  text.split('\n').forEach((line, i) => {
    const piece = line.length > max ? line.slice(0, max - 1) + '…' : line
    if (size + piece.length + 1 > max && lines.length) {
      out.push({ source: lines.join('\n'), startLine: start })
      lines = []
      size = 0
      start = i + 1
    }
    lines.push(piece)
    size += piece.length + 1
  })
  if (lines.length) out.push({ source: lines.join('\n'), startLine: start })
  return out
}
