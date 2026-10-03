// SQL tokens as colored text, a KB template in Graphit's own syntax.

import { cell } from './result'
import type { Token, TokenKind } from './sql'

export const TOKEN_COLOR: Partial<Record<TokenKind, string>> = {
  kw: '#a855f7',
  fn: '#3b82f6',
  str: '#e5534b',
  num: '#14a38b',
  param: '#db2777',
  comment: '#8b8b8b',
}

// KB templates keep Graphit's own syntax, {{ Metric('cpi') }}, highlighted.
export const TEMPLATE_COLOR: Record<string, string> = {
  Metric: '#2a9d8f',
  Dimension: '#3b82f6',
  Measure: '#8b5cf6',
}

// The surface's Text element, as $.ui.resolve hands it out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TextEl = any

// One token as colored text; a KB template in Graphit's own syntax.
export function tokenSpans(Text: TextEl, tokens: Token[], keyPrefix: string): unknown[] {
  return tokens.map((t, j) => {
    if (t.kind === 'template') {
      const color = TEMPLATE_COLOR[t.templateKind ?? ''] ?? TEMPLATE_COLOR.Metric
      return (
        <Text key={`${keyPrefix}${j}`}>
          <Text dimColor>{'{{ '}</Text>
          <Text color={color} bold>{cell(t.templateKind)}</Text>
          <Text dimColor>{"('"}</Text>
          <Text color={color} bold underline>{cell(t.templateName)}</Text>
          <Text dimColor>{"') }}"}</Text>
        </Text>
      )
    }
    return (
      <Text key={`${keyPrefix}${j}`} color={TOKEN_COLOR[t.kind]} bold={t.kind === 'kw'} italic={t.kind === 'comment'}>
        {t.text}
      </Text>
    )
  })
}
