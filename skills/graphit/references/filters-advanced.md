# Advanced Filter Controls - Dependent Dropdowns and Date Presets

Load only when you need an optional control on top of the core filters: a dependent dropdown, data-driven date bounds, a top-N list, or a date-preset picker. The base filter, param, bind, wiring, `:name` binding, and saved-view mechanics live in `filters.md`. Every control below is headless logic - you own all the markup.

## graphit.cascade(el, options) - Only Relevant Values

Dependent dropdowns: fetch a column's DISTINCT values constrained by other filters, and refetch when they change - pick an org and the user list shows only that org's users. You build the markup in `render`.

```js
const org = graphit.filter('org', { label: 'Org' })
const user = graphit.filter('user', { label: 'User', default: [] }) // multi-select

graphit.cascade('#user-list', {
  column: 'USER_NAME',                  // distinct values of this column
  source: 'users_table',               // table name - an identifier, never SQL
  dataSourceId: 'USERS_TABLE',
  filters: () => ({ ORG: org.get() }),  // upstream constraints; null = all, [] = none
  deps: ['org'],                        // refetch when org changes
  selection: user,                      // optional: prune selected users no longer in this org
  render: (values, el, ctx) => {
    // ctx = { loading, empty, error, hasUpstream, counts } - build any markup you like
    el.innerHTML = values.map(v => `<label><input type="checkbox" value="${v}"> ${v}</label>`).join('')
  },
})
```

- `filters()` returns `{ COLUMN: value }`. A scalar makes `COLUMN = :p`; an array makes `COLUMN IN :p`. One contract everywhere: `null`, absent or `''` means ALL (no constraint), and `[]` means match NOTHING - an empty-array upstream settles the list empty without issuing a query.
- Objects: `{ exclude: [...] }` is NOT IN, keeping null rows unless `null` is listed; `{ start, end }` takes `dr.get()` as-is (a date-only `end` includes that day); `{ min, max }` is inclusive. Empty ones constrain nothing.
- `selection` (a filter handle) is auto-pruned to the surviving values when an upstream changes. Name the control a cascade feeds - pass `selection`, or use the `column` that control declares in `data-graphit-field` - so report and saved-view editors can list and search these values.
- Returns `{ destroy(), search(term) }`. Keep the result set small (default `LIMIT 1001`).
- `withCounts: true` adds a per-value row count, delivered as `ctx.counts` alongside `values` (same order). `orderBy: 'count'` returns the top `limit` by count instead - for high-cardinality columns; it never prunes `selection`.
- Type-ahead: call the handle's `search('ber')` to narrow server-side; it is debounced with the normal refetch and is a case-insensitive contains match with literal wildcards, so `100%` finds `100%`. Clearing it (`search('')`) restores the full list.
- For low-cardinality cascades, `preload: true` fetches the distinct cross-product ONCE and filters in memory on every change; above `limit` tuples (default 1001), or with an object filter, it queries per change.

## graphit.dataBounds(options) - A Column's Real Min/Max

For a date picker that tracks the data instead of a literal frozen at authoring time. Never bake a `max="2026-07-15"` into markup - the source moves and the user gets locked out of fresh rows.

```js
const b = await graphit.dataBounds({ column: 'EVENT_DATE', source: 'sales', dataSourceId: 'SALES_DS' })
input.min = b.min
input.max = b.max
```

- Returns `{ min, max, dataMax, today }`. Use `max` as the picker ceiling: it is `max(dataMax, today)`, so a source lagging a few days never locks the user out of today. `dataMax` is the raw last row, for a "data through {dataMax}" caption.
- Non-date columns return their true min/max with no ceiling applied.
- Optional `filters` (as in cascade, e.g. `{ IS_WEB: 0 }`) bound matching rows only.

## graphit.rank(options) - Top-N Values

Top values by a measure, shaped to drop straight into an array filter or an `IN :param` binding.

```js
const top = await graphit.rank({
  column: 'COUNTRY', source: 'sales', dataSourceId: 'SALES_DS',
  by: "{{ Metric('revenue') }}",       // governed metric, or a bare aggregate
  limit: 10,
  filters: { REGION: region.get() },   // optional, same contract as cascade
})
```

- Returns a plain array of values; `withScores: true` returns `{ values, scores }` (score = the `by` value). Prefer `{{ Metric('name') }}` so ranking uses the org's definition; a bare aggregate accepts SUM, COUNT, AVG, MIN, or MAX over one column.

## graphit.dateRange(id, options) - Date Presets

A headless date filter with the standard presets built in (logic only - you render the buttons or inputs). `default` is a preset id or `{ start, end }`.

```js
const dr = graphit.dateRange('date_range', { label: 'Date Range', default: 'last_30_days' })
```

Handle:
- `dr.get()` returns `{ preset, start, end }` (ISO `YYYY-MM-DD`)
- `dr.set(presetId)` (e.g. `dr.set('this_month')`); `dr.setRange(start, end)` for a custom range
- `dr.start` / `dr.end` / `dr.preset` convenience getters; `dr.deps` (pass as `deps: dr.deps`); `dr.subscribe(cb)` (cb gets `{ preset, start, end }`)

A `dateRange` registration persists to saved views exactly like a `filter`/`param`, and its `subscribe` callback restores the picker's visual state on view apply or reload (same rule as the core controls in `filters.md`).

Declare it in markup like any other control, with `kind="date_range"` and a JSON OBJECT default - not the scalar a `filter` takes:

```html
<div data-graphit-state="date_range" data-graphit-state-kind="date_range"
     data-graphit-state-default='{"preset":"last_30_days"}'></div>
```

At least one of `start` / `end` / `preset`, each a string or null, max 64 chars; `{"start":"2026-01-01","end":"2026-06-30"}` is the custom-range form. Kind and value must agree both ways - a `date_range` wrapper holding a bare string is refused, and so is a `filter`/`param` wrapper holding `{start, end}`. A saved view stores the same object, so nothing has to infer a range's shape from its text.

Relative presets auto-recompute on reload (a saved "last_7_days" always means the last 7 days from today). The 11 preset ids - also available via `graphit.datePresets` (`[{id,label}]`) and `graphit.datePreset(id)` (`{start,end}`): today, yesterday, last_7_days, last_30_days, this_month, last_month, this_quarter, last_quarter, ytd, last_90_days, last_12_months.

Bind a chart to the range with two scalar params and a `BETWEEN`. The entity owns the query - its `data-graphit-sql` holds the `BETWEEN :start_date AND :end_date` template and the call passes only the values:

```js
// entity #rev: data-graphit-sql="SELECT day, SUM(rev) AS rev FROM orders WHERE day BETWEEN :start_date AND :end_date GROUP BY 1"
graphit.bind('#rev', {
  params: () => ({ start_date: dr.start, end_date: dr.end }),
  deps: dr.deps,
  render: (r, el) => graphit.graph(el, { type: 'area', data: r.data, x: 'day', y: 'rev' }),
})
```

Name the placeholders `:start_date` / `:end_date`, never `:from` / `:to` - reserved-word placeholders fail SQL validation (see the `:name` rules in `filters.md`).
