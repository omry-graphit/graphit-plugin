// Feature #1099: the graphit-view MCP App's browser entry. Holds the view state,
// draws view-model.ts's HTML and turns data-act clicks into state changes or
// app-only tool calls. `ontoolresult` is set before connect() so the first
// result is never missed.

import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps/app-with-deps'
import type { TabId } from '../query-view/state'
import { INITIAL_STATE, RESULTS_STEP, kbDefOf, modelOf, payloadOf, renderCard, upstreamOf } from './view-model'
import type { Payload, ViewState } from './view-model'

declare const GRAPHIT_LOGO_INNER: string

const root = document.getElementById('root') as HTMLElement
let payload: Payload | null = null
let state: ViewState = { ...INITIAL_STATE }

const app = new App({ name: 'Graphit query view', version: '1.0.0' })

function draw(): void {
  if (!payload) return
  const focusedSearch = document.activeElement instanceof HTMLInputElement && document.activeElement.classList.contains('search')
  const caret = focusedSearch ? (document.activeElement as HTMLInputElement).selectionStart : null
  root.innerHTML = renderCard(payload, state, GRAPHIT_LOGO_INNER)
  fit()
  if (focusedSearch) {
    const input = root.querySelector<HTMLInputElement>('input.search')
    input?.focus()
    if (input && caret !== null) input.setSelectionRange(caret, caret)
  }
}

// The card is drawn at the desktop's 720px; a narrower chat column scales it.
function fit(): void {
  const card = root.querySelector<HTMLElement>('.card')
  if (!card) return
  const scale = Math.min(1, root.clientWidth / 720)
  card.style.transform = scale < 1 ? `scale(${scale})` : ''
  card.style.marginBottom = scale < 1 ? `${-(1 - scale) * card.offsetHeight}px` : ''
}

function set(patch: Partial<ViewState>): void {
  state = { ...state, ...patch }
  draw()
}

function structuredOf(result: { structuredContent?: unknown } | undefined): unknown {
  return result?.structuredContent ?? null
}

async function loadUpstream(): Promise<void> {
  if (!payload || state.upstream?.status === 'loading') return
  const m = modelOf(payload, state, '')
  set({ upstream: { status: 'loading' } })
  let answer: unknown = null
  try {
    const result = await app.callServerTool({
      name: 'query_upstream',
      arguments: { source_name: m.sourceName, metric_names: m.lineageRefs.filter(r => r.kind === 'Metric').map(r => r.name) },
    })
    answer = result.isError ? null : structuredOf(result)
  } catch {
    answer = null
  }
  const at = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
  set({ upstream: upstreamOf(answer as Parameters<typeof upstreamOf>[0], m.sourceName, m.lineageRefs, at) })
}

async function openKb(name: string): Promise<void> {
  const key = `Metric:${name}`
  set({ drawer: { kind: 'kb', name } })
  if (state.defs[key]?.status === 'ok') return
  set({ defs: { ...state.defs, [key]: { status: 'loading' } } })
  try {
    const result = await app.callServerTool({ name: 'kb_definition', arguments: { kind: 'metric', name } })
    const out = structuredOf(result) as { stdout?: string; stderr?: string } | null
    const def = result.isError || !out ? { status: 'error' as const, error: 'Could not run graphit kb get.' } : kbDefOf(out.stdout || out.stderr || '')
    set({ defs: { ...state.defs, [key]: def } })
  } catch {
    set({ defs: { ...state.defs, [key]: { status: 'error', error: 'Could not run graphit kb get.' } } })
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // A sandboxed frame without clipboard access: select the text instead.
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  set({ copied: true })
  setTimeout(() => set({ copied: false }), 1500)
}

root.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!target || !payload || target.getAttribute('aria-disabled') === 'true') return
  const arg = target.dataset.arg ?? ''
  switch (target.dataset.act) {
    case 'tab':
      set({ tab: arg as TabId })
      if (arg === 'lineage' && !state.upstream) void loadUpstream()
      break
    case 'page':
      set({ page: Number(arg) })
      break
    case 'cols':
      set({ colPage: Number(arg) })
      break
    case 'load-upstream':
      void loadUpstream()
      break
    case 'open-results':
      set({ drawer: { kind: 'results' }, limit: RESULTS_STEP })
      break
    case 'open-explore':
      set({ drawer: { kind: 'explore' } })
      break
    case 'open-sql': {
      const sql = arg === 'base' ? modelOf(payload, state, '').baseSql : payload.result.governed_sql
      set({ drawer: { kind: 'sql', title: arg === 'base' ? 'SQL as written' : 'SQL as run', sql: sql ?? '' } })
      break
    }
    case 'copy-sql': {
      const sql = state.tab === 'base' ? modelOf(payload, state, '').baseSql : payload.result.governed_sql
      void copy(sql ?? '')
      break
    }
    case 'open-kb':
      void openKb(arg)
      break
    case 'sort':
      set({ sort: arg, desc: state.sort === arg ? !state.desc : false })
      break
    case 'more-rows':
      set({ limit: state.limit + RESULTS_STEP })
      break
    case 'close-drawer':
      set({ drawer: null })
      break
  }
})

root.addEventListener('input', event => {
  const input = event.target as HTMLInputElement
  if (input.classList.contains('search')) set({ search: input.value, limit: RESULTS_STEP })
})

window.addEventListener('resize', fit)

function applyHost(): void {
  const ctx = app.getHostContext()
  if (ctx?.theme) applyDocumentTheme(ctx.theme)
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
}

app.ontoolresult = result => {
  const next = payloadOf(result.structuredContent)
  if (!next) {
    root.innerHTML = '<p class="muted">This Graphit result has no rows to draw.</p>'
    return
  }
  payload = next
  state = { ...INITIAL_STATE }
  draw()
}
app.onhostcontextchanged = () => applyHost()

void app.connect().then(applyHost)
