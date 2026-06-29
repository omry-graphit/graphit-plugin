# Advanced Filter Controls - Dependent Dropdowns and Date Presets

Load only when you need one of two optional controls on top of the core filters: a dependent dropdown ("only relevant values" that narrows as an upstream filter changes) or a date-preset picker. The base filter, param, bind, wiring, `:name` binding, and saved-view mechanics live in `filters.md`. Both controls below are headless logic - you own all the markup.

## graphit.cascade(el, options) - Only Relevant Values

Dependent dropdowns: fetch a column's DISTINCT values constrained by other filters, and refetch when they change. For example, pick an org and the user list shows only that org's users. Logic only - you build the checkboxes or list in `render`.

```js
const org = graphit.filter('org', { label: 'Org' })
const user = graphit.filter('user', { label: 'User', default: [] }) // multi-select

graphit.cascade('#user-list', {
  column: 'USER_NAME',                  // distinct values of this column
  source: 'users_table',               // table name (or a subquery)
  dataSourceId: 'USERS_TABLE',
  filters: () => ({ ORG: org.get() }),  // upstream constraints; empty values skipped
  deps: ['org'],                        // refetch when org changes
  selection: user,                      // optional: prune selected users no longer in this org
  render: (values, el, ctx) => {
    // ctx = { loading, empty, error, hasUpstream } - build any markup you like
    el.innerHTML = values.map(v => `<label><input type="checkbox" value="${v}"> ${v}</label>`).join('')
  },
})
```

- `filters()` returns `{ COLUMN: value }`. A scalar makes `COLUMN = :p`; an array makes `COLUMN IN :p`. Empty values (`null`, `''`, `[]`) are skipped (no constraint), so an empty upstream means "no filter", not "match nothing".
- `selection` (a filter handle) is auto-pruned to the surviving values when an upstream changes.
- Returns `{ destroy() }`. Keep the result set small (default `LIMIT 1001`); these parameterized queries skip the result cache, so they hit DuckDB directly.
- Faster for low-cardinality cascades: add `preload: true` to fetch the full distinct cross-product ONCE (cacheable, no params) and filter in-memory on every change - instant, zero per-change round-trips. Best when the column-by-upstream combinations are small (cap = `limit`, default 1001 tuples); above the cap it auto-falls-back to per-change server queries.

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

Relative presets auto-recompute on reload (a saved "last_7_days" always means the last 7 days from today). The 11 preset ids - also available via `graphit.datePresets` (`[{id,label}]`) and `graphit.datePreset(id)` (`{start,end}`): today, yesterday, last_7_days, last_30_days, this_month, last_month, this_quarter, last_quarter, ytd, last_90_days, last_12_months.

Bind a chart to the range with two scalar params and a `BETWEEN`:

```js
graphit.bind('#rev', {
  sql: 'SELECT day, SUM(rev) AS rev FROM orders WHERE day BETWEEN :start_date AND :end_date GROUP BY 1',
  dataSourceId: 'ORDERS',
  params: () => ({ start_date: dr.start, end_date: dr.end }),
  deps: dr.deps,
  render: (r, el) => graphit.graph(el, { type: 'area', data: r.data, x: 'day', y: 'rev' }),
})
```

Name the placeholders `:start_date` / `:end_date`, never `:from` / `:to` - reserved-word placeholders fail SQL validation (see the `:name` rules in `filters.md`).
